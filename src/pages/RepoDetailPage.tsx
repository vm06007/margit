import { useState } from "react";
import { getContract, prepareContractCall, readContract, sendTransaction, waitForReceipt } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { toUnits } from "thirdweb/utils";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import type { Listing } from "../api";
import { arcTestnet, thirdwebClient } from "../lib/thirdweb";
import { ARC_TOKEN_ADDRESSES, ARC_USDC_ADDRESS, type PaymentToken } from "../lib/constants";
import { useUnlockPreview, unlockDetailsNode } from "../hooks/useUnlockPreview";
import { CloneResult } from "../components/CloneResult";
import { PublisherLink } from "../components/ListingCard";
import { StarRating } from "../components/StarRating";
import { ReviewsSection } from "../components/ReviewsSection";

function AgentInstructions({ listingId }: { listingId: string }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const unlockUrl = `${window.location.origin}/api/listings/unlock?id=${listingId}`;
    const curlCmd = `curl -i "${unlockUrl}"`;

    return (
        <div className="agent-instructions">
            <button type="button" className="repo-group-label" onClick={() => setOpen((v) => !v)}>
                <span className={`chevron ${open ? "chevron-open" : ""}`}>▸</span>
                For AI agents
            </button>
            {open && (
                <div className="agent-instructions-body">
                    <p className="hint">
                        This endpoint speaks x402 (v2) on Arc testnet (<code>eip155:5042002</code>), priced in
                        USDC. An unpaid request returns <code>402</code> with the machine-readable payment
                        requirements in the <code>payment-required</code> response header — scheme, price, payTo,
                        and the Gateway's verifying contract.
                    </p>
                    <div className="agent-instructions-code">
                        <code>{curlCmd}</code>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                                navigator.clipboard.writeText(curlCmd);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 1500);
                            }}
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <p className="hint">
                        To pay: an x402-aware client (e.g. <code>@x402/core</code> +{" "}
                        <code>@circle-fin/x402-batching</code>, or Circle's Agent Stack) can complete the
                        fetch → 402 → pay → retry loop automatically. Hand-rolling the Gateway's batched
                        settlement without one of these isn't recommended.
                    </p>
                </div>
            )}
        </div>
    );
}

// Real, verified ABI/addresses from @circle-fin/x402-batching's own bundled
// CHAIN_CONFIGS.arcTestnet — not guessed.
const ARC_GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

function DepositButton() {
    const account = useActiveAccount();
    const [amount, setAmount] = useState("1.00");
    const [status, setStatus] = useState<"idle" | "checking" | "approving" | "depositing" | "done" | "error">(
        "idle",
    );
    const [error, setError] = useState<string | null>(null);

    if (!account) return null;

    const deposit = async () => {
        setError(null);
        try {
            const usdcContract = getContract({ client: thirdwebClient, chain: arcTestnet, address: ARC_USDC_ADDRESS });
            const gatewayContract = getContract({
                client: thirdwebClient,
                chain: arcTestnet,
                address: ARC_GATEWAY_WALLET_ADDRESS,
            });
            const depositAmount = toUnits(amount, 6);

            setStatus("checking");
            const allowance = await readContract({
                contract: usdcContract,
                method: "function allowance(address owner, address spender) view returns (uint256)",
                params: [account.address, ARC_GATEWAY_WALLET_ADDRESS],
            });

            if (allowance < depositAmount) {
                setStatus("approving");
                const approveTx = prepareContractCall({
                    contract: usdcContract,
                    method: "function approve(address spender, uint256 amount)",
                    params: [ARC_GATEWAY_WALLET_ADDRESS, depositAmount],
                });
                const { transactionHash } = await sendTransaction({ transaction: approveTx, account });
                await waitForReceipt({ client: thirdwebClient, chain: arcTestnet, transactionHash });
            }

            setStatus("depositing");
            const depositTx = prepareContractCall({
                contract: gatewayContract,
                method: "function deposit(address token, uint256 value)",
                params: [ARC_USDC_ADDRESS, depositAmount],
            });
            const { transactionHash } = await sendTransaction({ transaction: depositTx, account });
            await waitForReceipt({ client: thirdwebClient, chain: arcTestnet, transactionHash });

            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Deposit failed");
            setStatus("error");
        }
    };

    const busy = status === "checking" || status === "approving" || status === "depositing";
    const label =
        status === "checking"
            ? "Checking…"
            : status === "approving"
              ? "Approve in wallet…"
              : status === "depositing"
                ? "Confirm deposit…"
                : status === "done"
                  ? "Deposited!"
                  : "Deposit to Gateway";

    return (
        <div className="deposit-wrap">
            <p className="hint">
                Circle Gateway requires a one-time deposit before payments settle — holding USDC in your wallet
                isn't enough on its own.
            </p>
            <div className="deposit-controls">
                <input
                    className="input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                />
                <button type="button" className="btn btn-outline" disabled={busy} onClick={deposit}>
                    {label}
                </button>
            </div>
            {error && <p className="error">{error}</p>}
        </div>
    );
}

function DirectBuyButton({ listing }: { listing: Listing }) {
    const account = useActiveAccount();
    const [token, setToken] = useState<PaymentToken>("USDC");
    const [status, setStatus] = useState<"idle" | "sending" | "verifying" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [cloneUrl, setCloneUrl] = useState<string | null>(null);

    if (!account) {
        return <p className="hint">Connect a wallet above to pay directly.</p>;
    }

    const buy = async () => {
        setError(null);
        setStatus("sending");
        try {
            const amount = toUnits(listing.price.replace("$", ""), 6);
            const tokenContract = getContract({
                client: thirdwebClient,
                chain: arcTestnet,
                address: ARC_TOKEN_ADDRESSES[token],
            });
            const transferTx = prepareContractCall({
                contract: tokenContract,
                method: "function transfer(address to, uint256 value) returns (bool)",
                params: [listing.payoutAddress, amount],
            });
            const { transactionHash } = await sendTransaction({ transaction: transferTx, account });
            await waitForReceipt({ client: thirdwebClient, chain: arcTestnet, transactionHash });

            setStatus("verifying");
            const res = await fetch(`/api/listings/${listing.id}/verify-payment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ txHash: transactionHash, token }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                throw new Error(body.error ?? `Verification failed (${res.status})`);
            }
            const data = (await res.json()) as { cloneUrl: string };
            setCloneUrl(data.cloneUrl);
            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
        }
    };

    const busy = status === "sending" || status === "verifying";
    const label =
        status === "sending" ? "Confirm in wallet…" : status === "verifying" ? "Verifying…" : `Pay ${token}`;

    return (
        <div className="buy-button-wrap">
            <div className="token-toggle" role="group" aria-label="Payment currency">
                {(["USDC", "EURC"] as const).map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`token-toggle-option ${token === option ? "active" : ""}`}
                        disabled={busy}
                        onClick={() => setToken(option)}
                    >
                        {option}
                    </button>
                ))}
            </div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={buy}>
                {label}
            </button>
            {error && <p className="error">{error}</p>}
            {cloneUrl && <CloneResult cloneUrl={cloneUrl} repoFullName={listing.repoFullName} />}
        </div>
    );
}

function BuyButton({ listingId, repoFullName }: { listingId: string; repoFullName: string }) {
    const account = useActiveAccount();
    const [status, setStatus] = useState<"idle" | "signing" | "settling" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [cloneUrl, setCloneUrl] = useState<string | null>(null);

    const buy = async () => {
        if (!account) return;
        setError(null);
        setStatus("signing");
        try {
            const batchScheme = new BatchEvmScheme({
                address: account.address as `0x${string}`,
                signTypedData: (params) => account.signTypedData(params),
            });
            // spendControls: false — @x402/core's default spend-control allowlist
            // doesn't recognize Arc's native-gas-as-USDC asset (0x3600...0000) as a
            // "default asset", so it rejects the payment requirement otherwise.
            //
            // @circle-fin/x402-batching redeclares its own PaymentPayload shape instead
            // of importing @x402/core's, so BatchEvmScheme is structurally narrower than
            // SchemeNetworkClient — harmless at runtime (same cast used server-side in
            // x402-gateway.ts).
            const client = x402Client.fromConfig({
                schemes: [{ network: "eip155:*", client: batchScheme }],
                spendControls: false,
            } as unknown as Parameters<typeof x402Client.fromConfig>[0]);
            const http = new x402HTTPClient(client);
            const unlockUrl = `${window.location.origin}/api/listings/unlock?id=${listingId}`;

            const res = await fetch(unlockUrl);
            if (res.status !== 402) {
                throw new Error(`Expected a 402 payment challenge, got ${res.status}`);
            }

            const paymentRequired = http.getPaymentRequiredResponse((name) => res.headers.get(name));
            const paymentPayload = await http.createPaymentPayload(paymentRequired);
            setStatus("settling");
            const paymentHeaders = http.encodePaymentSignatureHeader(paymentPayload);

            const paidRes = await fetch(unlockUrl, { headers: paymentHeaders });
            if (!paidRes.ok) {
                let detail: string | undefined;
                try {
                    const settleResponse = http.getPaymentSettleResponse((name) => paidRes.headers.get(name));
                    detail = settleResponse.errorMessage ?? settleResponse.errorReason;
                } catch {
                    // No decodable settlement header — fall back to the JSON body below.
                }
                if (!detail) {
                    const body = (await paidRes.json().catch(() => ({}))) as { error?: string };
                    detail = body.error;
                }
                throw new Error(detail ?? `Payment failed (${paidRes.status})`);
            }
            const data = (await paidRes.json()) as { cloneUrl: string };
            setCloneUrl(data.cloneUrl);
            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
        }
    };

    if (!account) {
        return <p className="hint">Connect a wallet above to buy directly.</p>;
    }

    return (
        <div className="buy-button-wrap">
            <button
                type="button"
                className="btn btn-primary"
                disabled={status === "signing" || status === "settling"}
                onClick={buy}
            >
                {status === "signing" ? "Confirm in wallet…" : status === "settling" ? "Settling…" : "Buy Now"}
            </button>
            {error && <p className="error">{error}</p>}
            {cloneUrl && <CloneResult cloneUrl={cloneUrl} repoFullName={repoFullName} />}
        </div>
    );
}

export function RepoDetailPage({
    owner,
    name,
    listings,
    navigate,
}: {
    owner: string;
    name: string;
    listings: Listing[] | null;
    navigate: (p: string) => void;
}) {
    const [unlockResults, previewUnlock] = useUnlockPreview();
    const fullName = `${owner}/${name}`;
    const listing = listings?.find((l) => l.repoFullName.toLowerCase() === fullName.toLowerCase());

    if (listings === null) {
        return <p className="hint">Loading…</p>;
    }

    if (!listing) {
        return (
            <section>
                <button type="button" className="btn btn-ghost back-link" onClick={() => navigate("/catalog")}>
                    ← Back to catalog
                </button>
                <p className="hint">No listing found for "{fullName}" — it may have been unlisted.</p>
            </section>
        );
    }

    return (
        <section>
            <button type="button" className="btn btn-ghost back-link" onClick={() => navigate("/catalog")}>
                ← Back to catalog
            </button>

            <div className="repo-detail-header">
                <h1>{name}</h1>
                <p className="hint">
                    by <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                </p>
                <StarRating average={0} count={0} />
            </div>

            <p>{listing.sellerDescription ?? listing.description ?? "No description provided."}</p>

            {listing.screenshots?.length > 0 && (
                <div className="repo-detail-screenshots">
                    {listing.screenshots.map((src, i) => (
                        <img key={i} src={src} alt="" />
                    ))}
                </div>
            )}

            <div className="listing-card-tags">
                {listing.language && <span className="tag">{listing.language}</span>}
                {listing.stargazersCount > 0 && <span className="tag tag-muted">★ {listing.stargazersCount}</span>}
            </div>

            <p className="hint repo-detail-note">
                This repo is private — the listing above is all that's publicly visible until you unlock it.
            </p>

            <div className="repo-detail-footer">
                <span className="listing-card-price">{listing.price}</span>
                <button
                    type="button"
                    className="btn btn-outline"
                    disabled={unlockResults[listing.id] === "loading"}
                    onClick={() => previewUnlock(listing.id)}
                >
                    {unlockResults[listing.id] === "loading" ? "Checking…" : "Preview requirements"}
                </button>
            </div>
            {unlockDetailsNode(unlockResults[listing.id])}

            <div className="payment-options">
                <div className="payment-option">
                    <h3>Pay directly</h3>
                    <p className="hint">
                        One on-chain USDC transfer straight to the seller. No pre-funding, no facilitator.
                    </p>
                    <DirectBuyButton listing={listing} />
                </div>
                <div className="payment-option">
                    <h3>Pay via x402 (built for agents)</h3>
                    <p className="hint">
                        Deposit once into Circle Gateway, then any agent can pay repeatedly and gaslessly.
                    </p>
                    <DepositButton />
                    <BuyButton listingId={listing.id} repoFullName={listing.repoFullName} />
                </div>
            </div>

            <AgentInstructions listingId={listing.id} />

            <ReviewsSection subject={name} />
        </section>
    );
}
