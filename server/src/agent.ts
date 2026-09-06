import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { redis } from "./redis.js";
import { decryptToken, encryptToken } from "./crypto.js";
import { getListing, getOwnerTokenForListing, listListings } from "./listings.js";
import { ARC_TOKEN_ADDRESSES, arcTestnet, priceToAtomicUnits, verifyDirectPayment, type PaymentToken } from "./payments.js";

const HISTORY_PREFIX = "margit:agent-chat:";
const HISTORY_TTL_SECONDS = 60 * 60 * 24;
const MAX_HISTORY_MESSAGES = 20;
const SETTINGS_PREFIX = "margit:agent-settings:";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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

async function buyListing(listingId: string, token: PaymentToken): Promise<BuyResult> {
    if (!walletClient || !agentAccount) {
        return { ok: false, reason: "Agent wallet is not configured (ARC_DEMO_BUYER_PRIVATE_KEY missing)" };
    }
    const listing = await getListing(listingId);
    if (!listing) return { ok: false, reason: "Unknown listing id" };

    const amount = priceToAtomicUnits(listing.price);
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

    let txHash: `0x${string}`;
    try {
        txHash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [listing.payoutAddress as `0x${string}`, amount],
        });
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "On-chain transfer failed" };
    }
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const verification = await verifyDirectPayment(txHash, listing.payoutAddress, amount, token);
    if (!verification.ok) return { ok: false, reason: verification.reason };

    const ownerToken = await getOwnerTokenForListing(listing.id);
    if (!ownerToken) return { ok: false, reason: "Listing has no stored credentials" };

    return {
        ok: true,
        txHash,
        cloneUrl: `https://x-access-token:${ownerToken}@github.com/${listing.repoFullName}.git`,
    };
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
];

function systemPrompt(): string {
    const address = agentAccount?.address ?? "(not configured)";
    return (
        "You are the margit shopping agent — an autonomous buyer with your own funded Arc-testnet wallet " +
        `(${address}). margit is a marketplace where developers list private GitHub repos for sale; buyers pay ` +
        "USDC or EURC on Arc and receive a one-time authenticated clone URL. " +
        "Use list_listings/get_listing to help the user find repos, get_wallet_balance to check funds, and " +
        "buy_listing to actually execute a purchase when the user clearly asks you to buy something. " +
        "Be concise. If a purchase succeeds, tell the user the clone URL is shown below your reply — don't repeat the raw URL in your text."
    );
}

export interface AgentTurnResult {
    reply: string;
    purchase?: { cloneUrl: string; txHash: string; repoFullName: string; token: PaymentToken };
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
): Promise<{ output: unknown; purchase?: AgentTurnResult["purchase"] }> {
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
            const result = await buyListing(id, token);
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

export async function runAgentTurn(sessionId: string, userMessage: string): Promise<AgentTurnResult> {
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
        { role: "system", content: systemPrompt() },
        ...history,
        { role: "user", content: userMessage },
    ];

    let purchase: AgentTurnResult["purchase"];
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
                const { output, purchase: madePurchase } = await executeTool(call.function.name, args);
                if (madePurchase) purchase = madePurchase;
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

    return { reply: finalText || "(no response)", purchase };
}
