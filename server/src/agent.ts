import Anthropic from "@anthropic-ai/sdk";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { redis } from "./redis.js";
import { getListing, getOwnerTokenForListing, listListings } from "./listings.js";
import { ARC_TOKEN_ADDRESSES, arcTestnet, priceToAtomicUnits, verifyDirectPayment, type PaymentToken } from "./payments.js";

const HISTORY_PREFIX = "margit:agent-chat:";
const HISTORY_TTL_SECONDS = 60 * 60 * 24;
const MAX_HISTORY_MESSAGES = 20;
const MODEL = "claude-sonnet-5";

const ERC20_ABI = [
    parseAbiItem("function transfer(address to, uint256 value) returns (bool)"),
    parseAbiItem("function balanceOf(address owner) view returns (uint256)"),
];

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : undefined;

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

const TOOLS: Anthropic.Tool[] = [
    {
        name: "list_listings",
        description: "Browse the margit catalog of repos for sale. Optionally filter by a text query matched against name/description.",
        input_schema: {
            type: "object",
            properties: { query: { type: "string", description: "Optional search text" } },
        },
    },
    {
        name: "get_listing",
        description: "Get full details for one listing by id, including its price and description.",
        input_schema: {
            type: "object",
            properties: { id: { type: "string", description: "Listing id" } },
            required: ["id"],
        },
    },
    {
        name: "get_wallet_balance",
        description: "Check the agent's own Arc-testnet wallet balance (native gas, USDC, EURC) before attempting a purchase.",
        input_schema: { type: "object", properties: {} },
    },
    {
        name: "buy_listing",
        description:
            "Actually pay for a listing on-chain using the agent's own funded Arc-testnet wallet, then return the repo's clone URL. This spends real (testnet) funds — only call it when the user has clearly asked to buy something.",
        input_schema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Listing id to buy" },
                token: { type: "string", enum: ["USDC", "EURC"], description: "Which stablecoin to pay with (default USDC)" },
            },
            required: ["id"],
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

export async function runAgentTurn(sessionId: string, userMessage: string): Promise<AgentTurnResult> {
    if (!anthropic) {
        return { reply: "The agent isn't configured yet — ANTHROPIC_API_KEY is missing from the server's .env." };
    }

    const history = (await redis.get<Anthropic.MessageParam[]>(HISTORY_PREFIX + sessionId)) ?? [];
    const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userMessage }];

    let purchase: AgentTurnResult["purchase"];
    let finalText = "";

    for (let round = 0; round < 6; round++) {
        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: systemPrompt(),
            tools: TOOLS,
            messages,
        });

        messages.push({ role: "assistant", content: response.content });

        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
        if (textBlocks.length > 0) finalText = textBlocks.map((b) => b.text).join("\n");

        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
            const { output, purchase: madePurchase } = await executeTool(use.name, use.input as Record<string, unknown>);
            if (madePurchase) purchase = madePurchase;
            toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(output) });
        }
        messages.push({ role: "user", content: toolResults });
    }

    await redis.set(HISTORY_PREFIX + sessionId, messages.slice(-MAX_HISTORY_MESSAGES), { ex: HISTORY_TTL_SECONDS });

    return { reply: finalText || "(no response)", purchase };
}
