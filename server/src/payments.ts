import { createPublicClient, decodeEventLog, defineChain, http, parseAbiItem } from "viem";
import { redis } from "./redis.js";

const arcTestnet = defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
});

export type PaymentToken = "USDC" | "EURC";

// Both are Circle-issued stablecoins on Arc testnet, each with 6 decimals.
export const ARC_TOKEN_ADDRESSES: Record<PaymentToken, string> = {
    USDC: "0x3600000000000000000000000000000000000000",
    EURC: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};

const USED_TX_PREFIX = "margit:used-tx:";
const TRANSFER_ABI = [parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")];

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

/**
 * Converts a "$0.05"-style price string to atomic token units.
 *
 * The numeric amount is treated as currency-agnostic (no live USD/EUR FX rate
 * is applied) — a "$0.05" listing accepts either 0.05 USDC or 0.05 EURC. Both
 * are Circle-issued stablecoins with 6 decimals.
 */
export function priceToAtomicUnits(price: string): bigint {
    const amount = Number(price.replace("$", ""));
    return BigInt(Math.round(amount * 1_000_000));
}

export interface DirectPaymentVerification {
    ok: boolean;
    reason?: string;
}

/**
 * Verifies a plain USDC or EURC transfer on Arc testnet actually paid
 * `payoutAddress` at least `requiredAtomicAmount`, and hasn't already been
 * used to unlock a listing (a tx hash is single-use).
 */
export async function verifyDirectPayment(
    txHash: string,
    payoutAddress: string,
    requiredAtomicAmount: bigint,
    token: PaymentToken,
): Promise<DirectPaymentVerification> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return { ok: false, reason: "Not a valid transaction hash" };
    }

    const alreadyUsed = await redis.get(USED_TX_PREFIX + txHash);
    if (alreadyUsed) {
        return { ok: false, reason: "This transaction was already used to unlock a listing" };
    }

    let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
    try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    } catch {
        return { ok: false, reason: "Transaction not found (it may still be pending)" };
    }

    if (receipt.status !== "success") {
        return { ok: false, reason: "Transaction failed on-chain" };
    }

    const tokenAddress = ARC_TOKEN_ADDRESSES[token];
    const paid = receipt.logs.some((log) => {
        if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) return false;
        try {
            const decoded = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
            const { to, value } = decoded.args as { to: string; value: bigint };
            return to.toLowerCase() === payoutAddress.toLowerCase() && value >= requiredAtomicAmount;
        } catch {
            return false;
        }
    });

    if (!paid) {
        return {
            ok: false,
            reason: `No matching ${token} transfer of at least the required amount to ${payoutAddress} found in this transaction`,
        };
    }

    await redis.set(USED_TX_PREFIX + txHash, "1");
    return { ok: true };
}
