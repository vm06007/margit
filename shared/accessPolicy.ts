import { PAYMENT_TOKENS, type PaymentToken } from "./paymentTokens.js";
export interface AccessPolicy {
    mode: "window" | "single_download" | "permanent";
    minutes: number;
    /** Legacy listings and pending quotes retain this field. */
    acceptCirBTC?: boolean;
    acceptedTokens?: PaymentToken[];
    checkout?: "both" | "x402" | "wallet";
}
export const ACCESS_WINDOWS = [10, 60, 1440, 10080] as const;
export const DEFAULT_ACCESS_POLICY: AccessPolicy = { mode: "window", minutes: 10 };
export function parseAccessPolicy(value: unknown): AccessPolicy {
    if (value === undefined) return { ...DEFAULT_ACCESS_POLICY };
    if (!value || typeof value !== "object") throw new Error("Choose valid delivery terms.");
    const policy = value as AccessPolicy;
    const minutes = policy.mode === "permanent" && policy.minutes === undefined ? 10 : policy.minutes;
    if (!["window", "single_download", "permanent"].includes(policy.mode) || !ACCESS_WINDOWS.includes(minutes as typeof ACCESS_WINDOWS[number])) {
        throw new Error("Choose a valid access window and delivery mode.");
    }
    if (policy.checkout !== undefined && !["both", "x402", "wallet"].includes(policy.checkout)) throw new Error("Choose a valid purchase channel.");
    if (policy.acceptCirBTC !== undefined && typeof policy.acceptCirBTC !== "boolean") throw new Error("Choose valid payment currencies.");
    if (policy.acceptedTokens !== undefined && (!Array.isArray(policy.acceptedTokens) || policy.acceptedTokens.length === 0 || policy.acceptedTokens.some(token => !PAYMENT_TOKENS.includes(token)))) throw new Error("Select at least one valid payment currency.");
    const acceptedTokens = policy.acceptedTokens === undefined ? undefined : PAYMENT_TOKENS.filter(token => policy.acceptedTokens!.includes(token));
    if (policy.checkout === "x402" && acceptedTokens && !acceptedTokens.includes("USDC")) throw new Error("x402 requires USDC. Select USDC or use wallet checkout.");
    return { ...(acceptedTokens === undefined && policy.acceptCirBTC ? { acceptCirBTC: true } : {}), mode: policy.mode, minutes, ...(policy.checkout ? { checkout: policy.checkout } : {}), ...(acceptedTokens ? { acceptedTokens } : {}) };
}
export function accessWindowLabel(minutes: number): string {
    return minutes >= 1440 ? `${minutes / 1440} day${minutes === 1440 ? "" : "s"}` : minutes >= 60 ? `${minutes / 60} hour` : `${minutes} minutes`;
}
export function accessPolicyLabel(policy: AccessPolicy = DEFAULT_ACCESS_POLICY): string {
    if (policy.mode === "permanent") return "Permanent access. Clone or download again with no expiry, including repository updates while the seller keeps the repository connected.";
    return policy.mode === "single_download"
        ? `One ZIP download, started within ${accessWindowLabel(policy.minutes)} of purchase. Access is consumed when the download starts; interrupted downloads cannot be retried. Git cloning is not included.`
        : `Clone or download with retries for ${accessWindowLabel(policy.minutes)} after purchase. No access or future updates after expiry.`;
}

export function allowsCheckout(policy: AccessPolicy | undefined, channel: "x402" | "wallet"): boolean {
    if (channel === "x402" && !allowsPaymentToken(policy, "USDC")) return false;
    return !policy?.checkout || policy.checkout === "both" || policy.checkout === channel;
}
export function checkoutLabel(policy: AccessPolicy | undefined): string {
    return !allowsCheckout(policy, "wallet") ? "x402 checkout only" : !allowsCheckout(policy, "x402") ? "Wallet checkout only" : "Wallet and x402 checkout";
}

export function allowsPaymentToken(policy: AccessPolicy | undefined, currency: string): boolean {
    return acceptedPaymentTokens(policy).some(token => token === currency);
}

export function acceptedPaymentTokens(policy?: AccessPolicy): PaymentToken[] {
    return policy?.acceptedTokens ?? (policy?.acceptCirBTC ? ["USDC", "EURC", "cirBTC"] : ["USDC", "EURC"]);
}
