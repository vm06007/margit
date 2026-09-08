import { createCheckoutQuote, completeCheckout } from "./checkout.js";
import { checkoutAbi, typedOrder, checkoutTermsHash } from "../../shared/checkout.js";
import { allowsCheckout, parseAccessPolicy, type AccessPolicy } from "../../shared/accessPolicy.js";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbiItem, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { redis } from "./redis.js";
import { decryptToken, encryptToken } from "./crypto.js";
import { createApiKey } from "./api-keys.js";
import { createListing, deleteListing, getListing, listListings, type Listing } from "./listings.js";
import { resolvePayoutAddress } from "./names.js";
import type { SessionData } from "./session.js";
import { ARC_TOKEN_ADDRESSES, arcTestnet, type PaymentToken } from "./payments.js";

const HISTORY_PREFIX = "margit:agent-chat:";
const HISTORY_TTL_SECONDS = 60 * 60 * 24;
const MAX_HISTORY_MESSAGES = 20;
const SETTINGS_PREFIX = "margit:agent-settings:";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const PRICE_PATTERN = /^\$\d+(\.\d{1,2})?$/;
const MAX_DESCRIPTION_LENGTH = 4000;

// OpenRouter's own maintained router — auto-selects a free, currently-available model
// per request, so this default never goes stale even as individual free models are
// deprecated. Verified live against https://openrouter.ai/api/v1/models. Users can
// still pick any specific model in Settings; listAgentModels() below reflects the
// live catalog rather than this constant.
const DEFAULT_MODEL = "openrouter/free";

const ERC20_ABI = [
    parseAbiItem("function transfer(address to, uint256 value) returns (bool)"),
    parseAbiItem("function balanceOf(address owner) view returns (uint256)"),
];

const agentAccount = process.env.ARC_DEMO_BUYER_PRIVATE_KEY
    ? privateKeyToAccount(process.env.ARC_DEMO_BUYER_PRIVATE_KEY as `0x${string}`)
    : undefined;

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
const walletClient = agentAccount
    ? createWalletClient({ account: agentAccount, chain: arcTestnet, transport: http() })
    : undefined;

export interface AgentWalletBalance {
    address?: string;
    nativeGas?: string;
    usdc?: string;
    eurc?: string;
    error?: string;
}

export async function getAgentWalletBalance(): Promise<AgentWalletBalance> {
    if (!agentAccount) return { error: "Agent wallet is not configured (ARC_DEMO_BUYER_PRIVATE_KEY missing)" };
    const [native, usdc, eurc] = await Promise.all([
        publicClient.getBalance({ address: agentAccount.address }),
        publicClient.readContract({
            address: ARC_TOKEN_ADDRESSES.USDC as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [agentAccount.address],
        }),
        publicClient.readContract({
            address: ARC_TOKEN_ADDRESSES.EURC as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [agentAccount.address],
        }),
    ]);
    return {
        address: agentAccount.address,
        nativeGas: formatUnits(native, 18),
        usdc: formatUnits(usdc as bigint, 6),
        eurc: formatUnits(eurc as bigint, 6),
    };
}

interface BuyResult {
    ok: boolean;
    reason?: string;
    cloneUrl?: string;
    txHash?: string;
}

async function buyListing(listingId: string, token: PaymentToken, operatorSession?: string): Promise<BuyResult> {
    if (!walletClient || !agentAccount) {
        return { ok: false, reason: "Agent wallet is not configured (ARC_DEMO_BUYER_PRIVATE_KEY missing)" };
    }
    // Persist a pending receipt before verification so agent retries cannot buy twice.
    const pendingKey = `margit:agent-checkout:${operatorSession ?? "internal"}:${listingId}`;
    const previous = await redis.get<{secret:string;hash:`0x${string}`}>(pendingKey);
    if (previous) {
        const receipt = await publicClient.waitForTransactionReceipt({hash:previous.hash});
        if (receipt.status !== "success") {await redis.del(pendingKey);return {ok:false,reason:"Previous checkout failed; no purchase was completed."};}
        const access = await completeCheckout(previous.secret,previous.hash);
        await redis.del(pendingKey);
        return {ok:true,txHash:previous.hash,...access};
    }
    const listing = await getListing(listingId);
    if (!listing) return { ok: false, reason: "Unknown listing id" };

    // The built-in agent uses contract checkout, which follows the wallet channel.
    if (!allowsCheckout(listing.accessPolicy, "wallet")) return { ok: false, reason: "This listing requires x402 checkout. This agent's contract checkout tool cannot buy it." };

    const quote = await createCheckoutQuote(listingId,agentAccount.address,token,operatorSession);
    const amount = BigInt(quote.order.amount);
    const tokenAddress = ARC_TOKEN_ADDRESSES[token] as `0x${string}`;

    const balance = (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [agentAccount.address],
    })) as bigint;
    if (balance < amount) {
        return {
            ok: false,
            reason:
                `Agent wallet has insufficient ${token} (has ${formatUnits(balance, 6)}, needs ${formatUnits(amount, 6)}). ` +
                `Fund ${agentAccount.address} with ${token} on Arc testnet first.`,
        };
    }

    if (quote.order.termsHash !== checkoutTermsHash(listing.price,token,listing.payoutAddress,listing.accessPolicy)) return {ok:false,reason:"Listing changed. Review its latest terms before purchasing."};
    const allowance = token === "USDC" ? BigInt(quote.order.amount) : await publicClient.readContract({address:tokenAddress,abi:[parseAbiItem("function allowance(address owner,address spender) view returns (uint256)")],functionName:"allowance",args:[agentAccount.address,quote.contract]});
    if (allowance < BigInt(quote.order.amount)) {
        const approval = await walletClient.writeContract({address:tokenAddress,abi:[parseAbiItem("function approve(address spender,uint256 amount) returns (bool)")],functionName:"approve",args:[quote.contract,BigInt(quote.order.amount)]});
        const receipt = await publicClient.waitForTransactionReceipt({hash:approval});
        if (receipt.status !== "success") return {ok:false,reason:"Token approval failed"};
    }
    const signature = parseSignature(quote.signature);
    const txHash = await walletClient.writeContract({value:token === "USDC" ? BigInt(quote.order.amount)*10n**12n : 0n,address:quote.contract,abi:checkoutAbi,functionName:"buy",args:[typedOrder(quote.order),Number(signature.v ?? BigInt(27+(signature.yParity ?? 0))),signature.r,signature.s]});
    await redis.set(pendingKey,{secret:quote.claimSecret,hash:txHash});
    const receipt = await publicClient.waitForTransactionReceipt({hash:txHash});
    if (receipt.status !== "success") {await redis.del(pendingKey);return {ok:false,reason:"Checkout transaction failed"};}
    const access = await completeCheckout(quote.claimSecret,txHash);
    await redis.del(pendingKey);
    return {ok:true,txHash,...access};
}

export interface GithubRepoSummary {
    id: number;
    name: string;
    fullName: string;
    private: boolean;
    description: string | null;
    stars: number;
    language: string | null;
    isOrgOwned: boolean;
}

export async function listMyRepos(githubAccessToken: string): Promise<GithubRepoSummary[] | { error: string }> {
    const res = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator",
        { headers: { Authorization: `Bearer ${githubAccessToken}`, Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return { error: "Failed to fetch repos from GitHub" };
    const repos = (await res.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        description: string | null;
        stargazers_count: number;
        language: string | null;
        owner: { login: string; type: string };
    }>;
    return repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        isOrgOwned: r.owner.type === "Organization",
    }));
}

export interface CreateListingResult {
    ok: boolean;
    reason?: string;
    listing?: Listing;
}

// Mirrors POST /api/listings' validation exactly, just invoked by the agent
// on behalf of the signed-in user instead of a direct HTTP request.
export async function createListingForUser(
    session: SessionData,
    input: { repoFullName: string; price: string; payoutAddress: string; sellerDescription?: string; accessPolicy?: AccessPolicy },
): Promise<CreateListingResult> {
    let accessPolicy: AccessPolicy;
    try { accessPolicy = parseAccessPolicy(input.accessPolicy); }
    catch { return { ok: false, reason: "Choose valid delivery terms." }; }
    if (!PRICE_PATTERN.test(input.price)) {
        return { ok: false, reason: 'price must look like "$1.50"' };
    }
    if (input.sellerDescription && input.sellerDescription.length > MAX_DESCRIPTION_LENGTH) {
        return { ok: false, reason: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` };
    }

    let resolvedPayoutAddress: string;
    try {
        resolvedPayoutAddress = await resolvePayoutAddress(input.payoutAddress);
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "Could not resolve payoutAddress" };
    }

    const repoRes = await fetch(`https://api.github.com/repos/${input.repoFullName}`, {
        headers: { Authorization: `Bearer ${session.githubAccessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!repoRes.ok) return { ok: false, reason: "Repo not found or not accessible with your GitHub token" };
    const repo = (await repoRes.json()) as {
        owner: { login: string };
        description: string | null;
        language: string | null;
        stargazers_count: number;
    };
    if (repo.owner.login.toLowerCase() !== session.login.toLowerCase()) {
        return { ok: false, reason: "You can only list repos you own" };
    }

    const listing = await createListing({
        repoFullName: input.repoFullName,
        ownerLogin: session.login,
        ownerGithubToken: session.githubAccessToken,
        price: input.price,
        payoutAddress: resolvedPayoutAddress,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        sellerDescription: input.sellerDescription ?? null,
        screenshots: [],
        accessPolicy,
    });
    return { ok: true, listing };
}

export async function unlistRepoForUser(
    session: SessionData,
    input: { id?: string; repoFullName?: string },
): Promise<{ ok: boolean; reason?: string; repoFullName?: string }> {
    let id = input.id;
    let repoFullName = input.repoFullName;
    if (!id && repoFullName) {
        const all = await listListings();
        const match = all.find(
            (l) =>
                l.repoFullName.toLowerCase() === repoFullName?.toLowerCase() &&
                l.ownerLogin.toLowerCase() === session.login.toLowerCase(),
        );
        id = match?.id;
    }
    if (!id) return { ok: false, reason: "Could not find a listing for that repo owned by you" };
    if (!repoFullName) {
        const listing = await getListing(id);
        repoFullName = listing?.repoFullName;
    }
    const ok = await deleteListing(id, session.login);
    return ok ? { ok: true, repoFullName } : { ok: false, reason: "Listing not found or not yours" };
}

const TOOLS: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "list_listings",
            description: "Browse the margit catalog of repos for sale. Optionally filter by a text query matched against name/description.",
            parameters: {
                type: "object",
                properties: { query: { type: "string", description: "Optional search text" } },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_listing",
            description: "Get full details for one listing by id, including its price and description.",
            parameters: {
                type: "object",
                properties: { id: { type: "string", description: "Listing id" } },
                required: ["id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_wallet_balance",
            description: "Check the agent's own Arc-testnet wallet balance (native gas, USDC, EURC) before attempting a purchase.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "buy_listing",
            description:
                "Actually pay for a listing on-chain using the agent's own funded Arc-testnet wallet, then return the repo's clone URL. This spends real (testnet) funds — only call it when the user has clearly asked to buy something.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Listing id to buy" },
                    token: { type: "string", enum: ["USDC", "EURC"], description: "Which stablecoin to pay with (default USDC)" },
                },
                required: ["id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "list_my_repos",
            description:
                "List the signed-in user's own GitHub repos (which the agent can then list for sale on their behalf). Requires the user to be signed in with GitHub in this browser — if it errors, tell them to connect GitHub first.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "create_listing",
            description:
                "List one of the signed-in user's own repos for sale on margit. Only call this when the user has clearly asked you to list a specific repo — confirm the repo name, price, and payout address with them first if any are ambiguous.",
            parameters: {
                type: "object",
                properties: {
                    repoFullName: { type: "string", description: 'e.g. "octocat/my-repo" — must be a repo the signed-in user owns' },
                    price: { type: "string", description: 'e.g. "$0.05" — dollar sign, up to 2 decimal places' },
                    payoutAddress: { type: "string", description: "0x address, .eth (ENS), or .arc/.circle (ArcNS) name" },
                    accessPolicy: { type: "object", description: "Seller delivery terms. Defaults to 10 minutes with retries. Single download is ZIP only and consumed when transfer starts.", properties: { mode: { type: "string", enum: ["window", "single_download"] }, minutes: { type: "integer", enum: [10, 60, 1440, 10080] }, checkout: { type: "string", enum: ["both", "x402", "wallet"], description: "Allowed payment method, not human identity verification" } } },
                    sellerDescription: { type: "string", description: "Optional short description shown to buyers" },
                },
                required: ["repoFullName", "price", "payoutAddress"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "unlist_repo",
            description: "Remove one of the signed-in user's own listings from the catalog. Identify it by repoFullName or listing id.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string", description: "Listing id, if known" },
                    repoFullName: { type: "string", description: 'e.g. "octocat/my-repo" — used to look up the listing id if not given' },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "generate_api_key",
            description:
                "Generate a margit API key for the signed-in user. This key lets external tools/agents (e.g. one calling through a Bazantic Gateway) list or unlist that user's own repos on their behalf, without needing their browser session. Only call this when the user explicitly asks for an API key.",
            parameters: { type: "object", properties: {} },
        },
    },
];

function systemPrompt(githubSession: SessionData | undefined): string {
    const address = agentAccount?.address ?? "(not configured)";
    const identity = githubSession
        ? `The user is signed in to margit as GitHub user "${githubSession.login}" — list_my_repos/create_listing/unlist_repo act on their behalf.`
        : "The user is NOT signed in with GitHub in this browser — list_my_repos/create_listing/unlist_repo will fail until they connect GitHub (top-right of the page).";
    return (
        "You are the margit shopping agent. margit is a marketplace where developers list private GitHub repos " +
        "for sale; buyers pay USDC or EURC on Arc and receive a one-time authenticated clone URL. " +
        `You have two separate roles: (1) an autonomous BUYER with your own funded Arc-testnet wallet (${address}) — ` +
        "use get_wallet_balance and buy_listing to actually pay for listings when clearly asked; and " +
        "(2) a SELLER assistant acting on behalf of whichever human is chatting with you — use list_my_repos, " +
        "create_listing, and unlist_repo to manage their own repos. If they want an *external* tool or another " +
        "agent (e.g. one running through a Bazantic Gateway) to manage their listings without going through this " +
        "chat, use generate_api_key to issue them a margit API key — only when they explicitly ask for one. " +
        identity + " " +
        "Use list_listings/get_listing to browse the catalog for anyone. " +
        "Be concise. If a purchase succeeds, tell the user the clone URL is shown below your reply — don't repeat the raw URL in your text."
    );
}

export interface AgentTurnResult {
    reply: string;
    purchase?: { cloneUrl: string; txHash: string; repoFullName: string; token: PaymentToken };
    listingChange?: { type: "listed" | "unlisted"; repoFullName: string; listing?: Listing };
}

function safeParseArgs(text: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

async function executeTool(
    name: string,
    input: Record<string, unknown>,
    githubSession: SessionData | undefined,
    operatorSession?: string,
): Promise<{ output: unknown; purchase?: AgentTurnResult["purchase"]; listingChange?: AgentTurnResult["listingChange"] }> {
    switch (name) {
        case "list_listings": {
            const all = await listListings();
            const query = typeof input.query === "string" ? input.query.toLowerCase() : undefined;
            const filtered = query
                ? all.filter(
                      (l) =>
                          l.repoFullName.toLowerCase().includes(query) ||
                          (l.description ?? "").toLowerCase().includes(query) ||
                          (l.sellerDescription ?? "").toLowerCase().includes(query),
                  )
                : all;
            return {
                output: filtered.map((l) => ({
                    id: l.id,
                    repoFullName: l.repoFullName,
                    price: l.price,
                    description: l.description,
                    language: l.language,
                    stars: l.stargazersCount,
                })),
            };
        }
        case "get_listing": {
            const id = typeof input.id === "string" ? input.id : undefined;
            const listing = id ? await getListing(id) : undefined;
            if (!listing) return { output: { error: "Unknown listing id" } };
            return {
                output: {
                    id: listing.id,
                    repoFullName: listing.repoFullName,
                    price: listing.price,
                    description: listing.description,
                    sellerDescription: listing.sellerDescription,
                    language: listing.language,
                    stars: listing.stargazersCount,
                },
            };
        }
        case "get_wallet_balance":
            return { output: await getAgentWalletBalance() };
        case "buy_listing": {
            const id = typeof input.id === "string" ? input.id : undefined;
            const token: PaymentToken = input.token === "EURC" ? "EURC" : "USDC";
            if (!id) return { output: { ok: false, reason: "Missing listing id" } };
            const result = await buyListing(id, token, operatorSession);
            if (result.ok && result.cloneUrl && result.txHash) {
                const listing = await getListing(id);
                return {
                    output: { ok: true, txHash: result.txHash },
                    purchase: {
                        cloneUrl: result.cloneUrl,
                        txHash: result.txHash,
                        repoFullName: listing?.repoFullName ?? id,
                        token,
                    },
                };
            }
            return { output: result };
        }
        case "list_my_repos": {
            if (!githubSession) {
                return { output: { error: "Not signed in — the user needs to connect GitHub in this browser first." } };
            }
            return { output: await listMyRepos(githubSession.githubAccessToken) };
        }
        case "create_listing": {
            if (!githubSession) {
                return { output: { error: "Not signed in — the user needs to connect GitHub in this browser first." } };
            }
            const repoFullName = typeof input.repoFullName === "string" ? input.repoFullName : undefined;
            const price = typeof input.price === "string" ? input.price : undefined;
            const payoutAddress = typeof input.payoutAddress === "string" ? input.payoutAddress : undefined;
            const sellerDescription = typeof input.sellerDescription === "string" ? input.sellerDescription : undefined;
            if (!repoFullName || !price || !payoutAddress) {
                return { output: { ok: false, reason: "repoFullName, price, and payoutAddress are required" } };
            }
            const createResult = await createListingForUser(githubSession, {
                repoFullName,
                price,
                payoutAddress,
                sellerDescription,
                accessPolicy: input.accessPolicy as AccessPolicy | undefined,
            });
            if (createResult.ok && createResult.listing) {
                return {
                    output: createResult,
                    listingChange: { type: "listed", repoFullName, listing: createResult.listing },
                };
            }
            return { output: createResult };
        }
        case "unlist_repo": {
            if (!githubSession) {
                return { output: { error: "Not signed in — the user needs to connect GitHub in this browser first." } };
            }
            const id = typeof input.id === "string" ? input.id : undefined;
            const repoFullName = typeof input.repoFullName === "string" ? input.repoFullName : undefined;
            const unlistResult = await unlistRepoForUser(githubSession, { id, repoFullName });
            if (unlistResult.ok && unlistResult.repoFullName) {
                return {
                    output: unlistResult,
                    listingChange: { type: "unlisted", repoFullName: unlistResult.repoFullName },
                };
            }
            return { output: unlistResult };
        }
        case "generate_api_key": {
            if (!githubSession) {
                return { output: { error: "Not signed in — the user needs to connect GitHub in this browser first." } };
            }
            const apiKey = await createApiKey(githubSession.login, githubSession.githubAccessToken);
            return {
                output: {
                    apiKey,
                    note: "Keep this secret — it lets anyone holding it list or unlist your repos on margit.",
                },
            };
        }
        default:
            return { output: { error: `Unknown tool ${name}` } };
    }
}

// --- Per-visitor settings (model choice + optional bring-your-own API key) ---

interface StoredAgentSettings {
    model?: string;
    encryptedApiKey?: string;
}

export interface AgentSettingsPublic {
    model: string;
    hasCustomKey: boolean;
    hasSharedDefault: boolean;
}

export async function getAgentSettings(sessionId: string): Promise<AgentSettingsPublic> {
    const stored = await redis.get<StoredAgentSettings>(SETTINGS_PREFIX + sessionId);
    return {
        model: stored?.model || DEFAULT_MODEL,
        hasCustomKey: Boolean(stored?.encryptedApiKey),
        hasSharedDefault: Boolean(process.env.OPENROUTER_API_KEY),
    };
}

export async function updateAgentSettings(
    sessionId: string,
    input: { apiKey?: string; model?: string },
): Promise<AgentSettingsPublic> {
    const existing = (await redis.get<StoredAgentSettings>(SETTINGS_PREFIX + sessionId)) ?? {};
    const next: StoredAgentSettings = { ...existing };
    if (input.model !== undefined) next.model = input.model.trim() || undefined;
    if (input.apiKey !== undefined) {
        next.encryptedApiKey = input.apiKey.trim() ? encryptToken(input.apiKey.trim()) : undefined;
    }
    await redis.set(SETTINGS_PREFIX + sessionId, next);
    return getAgentSettings(sessionId);
}

interface ResolvedCredentials {
    apiKey: string;
    model: string;
}

async function resolveCredentials(sessionId: string): Promise<ResolvedCredentials | { error: string }> {
    const stored = await redis.get<StoredAgentSettings>(SETTINGS_PREFIX + sessionId);
    const model = stored?.model || DEFAULT_MODEL;
    if (stored?.encryptedApiKey) {
        return { apiKey: decryptToken(stored.encryptedApiKey), model };
    }
    if (process.env.OPENROUTER_API_KEY) {
        return { apiKey: process.env.OPENROUTER_API_KEY, model };
    }
    return {
        error:
            "The agent isn't configured yet — no OpenRouter API key available. Add your own key in Settings " +
            "(get one free at openrouter.ai/keys), or ask the site owner to set OPENROUTER_API_KEY.",
    };
}

// --- Live model catalog (OpenRouter's public /models endpoint, no auth needed) ---

export interface OpenRouterModelSummary {
    id: string;
    name: string;
    free: boolean;
    contextLength: number | null;
}

interface OpenRouterModelsResponse {
    data: Array<{
        id: string;
        name: string;
        context_length?: number;
        supported_parameters?: string[];
        pricing?: { prompt?: string };
    }>;
}

let modelsCache: { data: OpenRouterModelSummary[]; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function listAgentModels(): Promise<OpenRouterModelSummary[]> {
    if (modelsCache && Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL_MS) return modelsCache.data;
    try {
        const res = await fetch(`${OPENROUTER_BASE_URL}/models`);
        if (!res.ok) return modelsCache?.data ?? [];
        const body = (await res.json()) as OpenRouterModelsResponse;
        const models = body.data
            .filter((m) => (m.supported_parameters ?? []).includes("tools"))
            .map((m) => ({
                id: m.id,
                name: m.name,
                free: m.pricing?.prompt === "0",
                contextLength: m.context_length ?? null,
            }))
            .sort((a, b) => {
                if (a.id === DEFAULT_MODEL) return -1;
                if (b.id === DEFAULT_MODEL) return 1;
                return Number(b.free) - Number(a.free) || a.name.localeCompare(b.name);
            });
        modelsCache = { data: models, fetchedAt: Date.now() };
        return models;
    } catch {
        return modelsCache?.data ?? [];
    }
}

export async function runAgentTurn(
    sessionId: string,
    userMessage: string,
    githubSession: SessionData | undefined,
): Promise<AgentTurnResult> {
    const credentials = await resolveCredentials(sessionId);
    if ("error" in credentials) return { reply: credentials.error };

    const client = new OpenAI({
        apiKey: credentials.apiKey,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
            "HTTP-Referer": process.env.APP_URL ?? "http://localhost:5173",
            "X-Title": "margit",
        },
    });

    const history = (await redis.get<ChatCompletionMessageParam[]>(HISTORY_PREFIX + sessionId)) ?? [];
    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt(githubSession) },
        ...history,
        { role: "user", content: userMessage },
    ];

    let purchase: AgentTurnResult["purchase"];
    let listingChange: AgentTurnResult["listingChange"];
    let finalText = "";

    try {
        for (let round = 0; round < 6; round++) {
            const response = await client.chat.completions.create({
                model: credentials.model,
                messages,
                tools: TOOLS,
            });

            const message = response.choices[0]?.message;
            if (!message) break;
            messages.push(message);

            if (message.content) finalText = message.content;

            const calls = message.tool_calls ?? [];
            if (calls.length === 0) break;

            for (const call of calls) {
                if (call.type !== "function") continue;
                const args = safeParseArgs(call.function.arguments);
                const {
                    output,
                    purchase: madePurchase,
                    listingChange: madeListingChange,
                } = await executeTool(call.function.name, args, githubSession, sessionId);
                if (madePurchase) purchase = madePurchase;
                if (madeListingChange) listingChange = madeListingChange;
                messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output) });
            }
        }
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { reply: `The agent's model backend rejected the request: ${detail}` };
    }

    // Drop the regenerated system message before persisting; everything after it is real history.
    await redis.set(HISTORY_PREFIX + sessionId, messages.slice(1).slice(-MAX_HISTORY_MESSAGES), {
        ex: HISTORY_TTL_SECONDS,
    });

    return { reply: finalText || "(no response)", purchase, listingChange };
}
