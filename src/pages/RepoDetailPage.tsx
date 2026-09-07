import { Toast } from "../components/Toast";
import { PageLoading } from "../components/PageLoading";
import { pendingCheckout, purchaseWithContract } from "../lib/checkout";
import { allowsCheckout, checkoutLabel, accessPolicyLabel } from "../../shared/accessPolicy";
import { normalizeDemoUrl } from "../../shared/demoUrl";
import { useCallback, useState } from "react";
import { getContract, prepareContractCall, readContract, sendTransaction, waitForReceipt } from "thirdweb";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { toUnits } from "thirdweb/utils";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import type { Listing } from "../api";
import { arcTestnet, thirdwebClient, thirdwebWallets, thirdwebTheme, thirdwebAppMetadata } from "../lib/thirdweb";
import { ARC_USDC_ADDRESS, type PaymentToken } from "../lib/constants";
import { useUnlockPreview, unlockDetailsNode } from "../hooks/useUnlockPreview";
import { CopyIcon, WalletIcon } from "../components/icons";
import { PurchaseSuccess, type PurchaseReceipt } from "../components/PurchaseSuccess.tsx";
import { listingMediaStyle } from "../components/listingMedia";
import "../styles/repository.css";

import { ReviewsSection } from "../components/ReviewsSection";

function AgentInstructions({ listingId }: { listingId: string }) {
    const [notification, setNotification] = useState<{ message: string; tone: "success" | "error"; id: number } | null>(null);
    const dismiss = useCallback(() => setNotification(null), []);
    const unlockUrl = `${window.location.origin}/api/listings/unlock?id=${encodeURIComponent(listingId)}`;
    const curlCmd = `curl -i "${unlockUrl}"`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(curlCmd);
            setNotification(previous => ({ message: "Command copied", tone: "success", id: (previous?.id ?? 0) + 1 }));
        } catch {
            setNotification(previous => ({ message: "Could not copy. Please select and copy the command manually.", tone: "error", id: (previous?.id ?? 0) + 1 }));
        }
    };

    return (
        <section className="agent-instructions" aria-label="Agent integration">
            <div className="clone-code agent-instructions-code">
                <div className="clone-code-label">
                    <span>Agent quickstart · Terminal</span>
                    <button type="button" className="clone-header-copy" onClick={copy} aria-label="Copy x402 request" title="Copy command"><CopyIcon /></button>
                </div>
                <pre tabIndex={0} aria-label="Preview x402 payment requirements"><code><span className="agent-code-comment"># Preview payment requirements</span>{"\n"}{curlCmd}</code></pre>
            </div>
            <p className="hint agent-instructions-caption">This request returns HTTP 402 and payment requirements. It does not make a purchase.</p>
            <ol className="agent-instructions-steps">
                <li>Read the price and recipient from the <code>PAYMENT-REQUIRED</code> header.</li>
                <li>Use a Circle Gateway-compatible x402 client to authorize payment and retry.</li>
                <li>Use the returned access link before it expires.</li>
            </ol>
            {notification && <Toast key={notification.id} message={notification.message} tone={notification.tone} onDismiss={dismiss} />}
        </section>
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

function DirectBuyButton({ listing, onPurchased }: { listing: Listing; onPurchased: (receipt: PurchaseReceipt) => void }) {
    const account = useActiveAccount();
    const [token, setToken] = useState<PaymentToken>("USDC");
    const [status, setStatus] = useState<"idle" | "checking" | "sending" | "verifying" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);

    if (!account) {
        return null;
    }

    const buy = async () => {
        setError(null);
        setStatus("checking");
        try {
            const data = await purchaseWithContract(listing, token, account, setStatus);
            onPurchased({ cloneUrl: data.cloneUrl, transactionHash: data.transactionHash, currency: data.currency, method: "wallet", expiresAt: data.expiresAt, checkoutContract: data.checkoutContract });
            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
        }
    };

    const busy = status === "checking" || status === "sending" || status === "verifying";
    const label =
        status === "checking" ? "Checking delivery…" : status === "sending" ? "Confirm in wallet…" : status === "verifying" ? "Verifying…" : pendingCheckout(listing.id, account.address) ? "Recover purchase" : `Pay ${token}`;

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
            <button type="button" className="btn btn-primary payment-submit" disabled={busy} aria-busy={busy} onClick={buy}>
                {status === "verifying" && <span className="payment-spinner" aria-hidden="true" />}
                {label}
            </button>
            {error && <p className="error">{error}</p>}
        </div>
    );
}

function BuyButton({ listingId, onPurchased }: { listingId: string; onPurchased: (receipt: PurchaseReceipt) => void }) {
    const account = useActiveAccount();
    const [status, setStatus] = useState<"idle" | "signing" | "settling" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);

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
            let transactionHash: string | undefined;
            try { transactionHash = http.getPaymentSettleResponse((name) => paidRes.headers.get(name)).transaction; } catch { /* Some batched settlements do not return a transaction yet. */ }
            onPurchased({ cloneUrl: data.cloneUrl, transactionHash, currency: "USDC", method: "x402", expiresAt: (data as { expiresAt?: string }).expiresAt });
            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
        }
    };

    if (!account) {
        return null;
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
        </div>
    );
}

export function RepoDetailPage({ owner, name, listings, navigate }: {
    owner: string; name: string; listings: Listing[] | null; navigate: (p: string) => void;
}) {
    const [unlockResults, previewUnlock] = useUnlockPreview();
    const [purchase, setPurchase] = useState<PurchaseReceipt | null>(null);
    const [payment, setPayment] = useState<"wallet" | "agent">("wallet");
    const [selectedImage, setSelectedImage] = useState(0);
    const account = useActiveAccount();
    const connectModal = useConnectModal();
    const listing = listings?.find(l => l.repoFullName.toLowerCase() === `${owner}/${name}`.toLowerCase());
    if (listings === null) return <section className="repository-page" aria-busy="true">
        <PageLoading label="Loading repository…" />
    </section>;
    if (!listing) return <section className="repository-page"><a href="/catalog">← Catalog</a><p>This repository is no longer listed.</p></section>;
    const publisher = `/publisher/${encodeURIComponent(listing.ownerLogin)}`;
    const selectedPayment = !allowsCheckout(listing.accessPolicy, "wallet") ? "agent" : !allowsCheckout(listing.accessPolicy, "x402") ? "wallet" : payment;
    return (
        <section className="repository-page">
            <header className="repository-headline">
                <h1 className="repository-breadcrumb-title"><span className="repository-title-parent"><a href="/catalog">Catalog</a> <span aria-hidden="true">/</span></span>{" "}{name}</h1>
            </header>
            <div className="repository-columns">
                <article className="repository-article">
                    <div className="repository-cover listing-media" role="img" aria-label={listing.screenshots.length ? `Screenshot ${selectedImage + 1} of ${name}` : `${name} repository cover`} style={listingMediaStyle(listing.screenshots[selectedImage], "#9f8be7")} />
                    {listing.screenshots.length > 1 && <div className="repository-thumbnails">{listing.screenshots.map((src, i) => <button type="button" key={src} aria-label={`Show screenshot ${i+1}`} aria-pressed={i === selectedImage} onClick={() => setSelectedImage(i)}><img src={src} alt="" /></button>)}</div>}
                    <section className="repository-about">{normalizeDemoUrl(listing.demoUrl) && <a className="btn btn-outline" href={normalizeDemoUrl(listing.demoUrl)!} target="_blank" rel="noopener noreferrer">Live preview ↗</a>}<p className="repository-eyebrow">About the repository</p><h2>Inside {name}</h2><div className="repository-description-row"><p className="repository-description">{listing.sellerDescription || listing.description || "The publisher hasn’t added a description yet."}</p>{listing.language && <div className="repository-tags"><span>{listing.language}</span></div>}</div><p className="hint">Source code stays private until you unlock it. A successful purchase gives you an authenticated clone command and a ZIP download.</p></section>
                    <a className="repository-author" href={publisher} onClick={e => {e.preventDefault(); navigate(publisher)}}><img src={`https://github.com/${listing.ownerLogin}.png?size=160`} alt="" /><div><p className="repository-eyebrow">Published by</p><h3>{listing.ownerLogin}</h3><p>Explore all repositories by this publisher ↗</p></div></a>
                    <ReviewsSection subject={name} />
                </article>
                <aside className="repository-purchase" aria-label="Unlock repository">
                    {purchase ? <PurchaseSuccess receipt={purchase} listing={listing} /> : <>
                    <h3 className="repository-purchase-title">Make it yours</h3><div className="repository-price">${Number(listing.price.replace("$", "")).toFixed(2)}</div><p className="hint">{checkoutLabel(listing.accessPolicy)}. {accessPolicyLabel(listing.accessPolicy)}</p>
                    <div className="repository-payment-tabs" role="group" aria-label="Purchase method"><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "wallet")} aria-pressed={selectedPayment === "wallet"} onClick={() => setPayment("wallet")}>Your wallet</button><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "x402")} aria-pressed={selectedPayment === "agent"} onClick={() => setPayment("agent")}>x402 / Agent</button></div>
                    <div hidden={selectedPayment !== "wallet"}><h3>Pay with wallet</h3><p className="hint">Send USDC or EURC on Arc through the Margit contract to the publisher.</p><DirectBuyButton listing={listing} onPurchased={setPurchase} /></div>
                    <div hidden={selectedPayment !== "agent"}><h3>Buy with x402</h3><p className="hint">Fund Circle Gateway with USDC, then authorize an x402 payment.</p><DepositButton /><BuyButton listingId={listing.id} onPurchased={setPurchase} /><AgentInstructions listingId={listing.id} /></div>
                    {selectedPayment === "wallet" ? (!account && <div className="repository-requirements">{!account && <button className="btn btn-primary repository-connect-wallet" type="button" onClick={() => {void connectModal.connect({client:thirdwebClient, wallets:thirdwebWallets, chain:arcTestnet, theme:thirdwebTheme, appMetadata:thirdwebAppMetadata}).catch(() => undefined)}}><WalletIcon /> Connect Wallet</button>}</div>) : <div className="repository-requirements"><button className="btn btn-outline" type="button" disabled={unlockResults[listing.id] === "loading"} onClick={() => previewUnlock(listing.id)}>{unlockResults[listing.id] === "loading" ? "Checking…" : "Preview requirements"}</button>{unlockDetailsNode(unlockResults[listing.id])}</div>}
                    </>}
                </aside>
            </div>
        </section>
    );
}
