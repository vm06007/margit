export interface AccessPolicy {
    mode: "window" | "single_download";
    minutes: number;
    checkout?: "both" | "x402" | "wallet";
}
export const ACCESS_WINDOWS = [10, 60, 1440, 10080] as const;
export const DEFAULT_ACCESS_POLICY: AccessPolicy = { mode: "window", minutes: 10 };
export function parseAccessPolicy(value: unknown): AccessPolicy {
    if (value === undefined) return { ...DEFAULT_ACCESS_POLICY };
    if (!value || typeof value !== "object") throw new Error("Choose valid delivery terms.");
    const policy = value as AccessPolicy;
    if (!["window", "single_download"].includes(policy.mode) || !ACCESS_WINDOWS.includes(policy.minutes as typeof ACCESS_WINDOWS[number])) {
        throw new Error("Choose a valid access window and delivery mode.");
    }
    if (policy.checkout !== undefined && !["both", "x402", "wallet"].includes(policy.checkout)) throw new Error("Choose a valid purchase channel.");
    return { mode: policy.mode, minutes: policy.minutes, ...(policy.checkout ? { checkout: policy.checkout } : {}) };
}
export function accessWindowLabel(minutes: number): string {
    return minutes >= 1440 ? `${minutes / 1440} day${minutes === 1440 ? "" : "s"}` : minutes >= 60 ? `${minutes / 60} hour` : `${minutes} minutes`;
}
export function accessPolicyLabel(policy: AccessPolicy = DEFAULT_ACCESS_POLICY): string {
    return policy.mode === "single_download"
        ? `One ZIP download, started within ${accessWindowLabel(policy.minutes)} of purchase. Access is consumed when the download starts; interrupted downloads cannot be retried. Git cloning is not included.`
        : `Clone or download with retries for ${accessWindowLabel(policy.minutes)} after purchase. No access or future updates after expiry.`;
}

export function allowsCheckout(policy: AccessPolicy | undefined, channel: "x402" | "wallet"): boolean {
    return !policy?.checkout || policy.checkout === "both" || policy.checkout === channel;
}
export function checkoutLabel(policy: AccessPolicy | undefined): string {
    return policy?.checkout === "x402" ? "x402 checkout only" : policy?.checkout === "wallet" ? "Wallet checkout only" : "Wallet and x402 checkout";
}
