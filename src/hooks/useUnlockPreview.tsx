import { useState, type ReactNode } from "react";
import { fetchUnlockRequirements, type UnlockRequirement } from "../api";
import { formatUsdc } from "../lib/format";

export function useUnlockPreview() {
    const [unlockResults, setUnlockResults] = useState<Record<string, UnlockRequirement | string | "loading">>({});

    const previewUnlock = async (listingId: string) => {
        setUnlockResults((prev) => ({ ...prev, [listingId]: "loading" }));
        try {
            const req = await fetchUnlockRequirements(listingId);
            setUnlockResults((prev) => ({ ...prev, [listingId]: req }));
        } catch (err) {
            setUnlockResults((prev) => ({
                ...prev,
                [listingId]: err instanceof Error ? err.message : "Failed to fetch payment requirements",
            }));
        }
    };

    return [unlockResults, previewUnlock] as const;
}

export function unlockDetailsNode(result: UnlockRequirement | string | "loading" | undefined): ReactNode {
    if (!result || result === "loading") return null;
    return (
        <div className="unlock-details">
            {typeof result === "string" ? (
                <span className="error">{result}</span>
            ) : (
                <span>
                    Real x402 challenge: pay {formatUsdc(result.amount)} to <code>{result.payTo}</code> on{" "}
                    <code>{result.network}</code>. This preview does not initiate a payment.
                </span>
            )}
        </div>
    );
}
