import { checkoutAmountLabel } from "../../shared/checkout";
import { parseUnits } from "viem";
import { Toast } from "../components/Toast";
import { PageLoading } from "../components/PageLoading";
import { pendingCheckout, purchaseWithContract } from "../lib/checkout";
import { allowsCheckout, checkoutLabel, accessPolicyLabel, accessWindowLabel, DEFAULT_ACCESS_POLICY } from "../../shared/accessPolicy";
import { normalizeDemoUrl } from "../../shared/demoUrl";
import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import type { Listing } from "../api";
import { arcTestnet, thirdwebClient, thirdwebWallets, thirdwebTheme, thirdwebAppMetadata } from "../lib/thirdweb";
import { type PaymentToken } from "../lib/constants";
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
            <div className="clone-code agent-quickstart-terminal">
                <div className="clone-code-label">
                    <span>Agent quickstart · Terminal</span>
                    <div className="agent-terminal-actions">
                        <button type="button" className="clone-header-copy" onClick={copy} aria-label="Copy x402 request" title="Copy command"><CopyIcon /></button>
                        <a className="clone-header-copy" href={unlockUrl} target="_blank" rel="noopener noreferrer" aria-label="Open x402 endpoint in a new tab" title="Open endpoint">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
                        </a>
                    </div>
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

function DirectBuyButton({ listing, onPurchased }: { listing: Listing; onPurchased: (receipt: PurchaseReceipt) => void }) {
    const account = useActiveAccount();
    const [token, setToken] = useState<PaymentToken>("USDC");
    const [status, setStatus] = useState<"idle" | "checking" | "sending" | "verifying" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [pricing, setPricing] = useState<{ key: string; amount: string } | null>(null);
    const [priceError, setPriceError] = useState<string | null>(null);
    const [priceRevision, setPriceRevision] = useState(0);
    const priceKey = `${listing.id}:${listing.price}:${token}`;
    useEffect(() => {
        setPricing(null);
        setPriceError(null);
        if (token !== "EURC") return;
        const controller = new AbortController();
        fetch(`/api/checkout/price?listingId=${encodeURIComponent(listing.id)}&currency=EURC`, { signal: controller.signal })
            .then(async response => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.error ?? "Could not load EURC price.");
                if (data.currency !== "EURC" || !/^[1-9][0-9]*$/.test(data.amount)) throw new Error("Invalid EURC price.");
                if (!controller.signal.aborted) setPricing({ key: priceKey, amount: data.amount });
            })
            .catch(err => { if (!controller.signal.aborted) setPriceError(err instanceof Error ? err.message : "Could not load EURC price."); });
        return () => controller.abort();
    }, [listing.id, token, priceKey, priceRevision]);
    const amount = token === "USDC" ? parseUnits(listing.price.replace("$", ""), 6).toString() : pricing?.key === priceKey ? pricing.amount : null;
    const displayAmount = amount ? checkoutAmountLabel(amount) : null;

    if (!account) {
        return null;
    }

    const buy = async () => {
        setError(null);
        setStatus("checking");
        try {
            const data = await purchaseWithContract(listing, token, account, setStatus, amount ?? undefined);
            onPurchased({ amount: data.amount, cloneUrl: data.cloneUrl, transactionHash: data.transactionHash, currency: data.currency, method: "wallet", expiresAt: data.expiresAt, checkoutContract: data.checkoutContract });
            setStatus("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
            setPriceRevision(value => value + 1);
        }
    };

    const busy = status === "checking" || status === "sending" || status === "verifying";
    const label =
        status === "checking" ? "Checking delivery…" : status === "sending" ? "Confirm in wallet…" : status === "verifying" ? "Verifying…" : pendingCheckout(listing.id, account.address) ? "Recover purchase" : amount ? `Pay ${displayAmount} ${token}` : priceError ? "Retry EURC price" : "Converting…";

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
            <button type="button" className="btn btn-primary payment-submit" disabled={busy || (!amount && !priceError && !pendingCheckout(listing.id, account.address))} aria-busy={busy || (!amount && !priceError)} onClick={() => { if (!amount && !pendingCheckout(listing.id, account.address)) setPriceRevision(value => value + 1); else void buy(); }}>
                {(status === "verifying" || (!amount && !priceError && !pendingCheckout(listing.id, account.address))) && <span className="payment-spinner" aria-hidden="true" />}
                {label}
            </button>
            {(error || priceError) && <p className="error">{error ?? priceError}</p>}
        </div>
    );
}

export function RepoDetailPage({ owner, name, listings, navigate }: {
    owner: string; name: string; listings: Listing[] | null; navigate: (p: string) => void;
}) {
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
                    <h3 className="repository-purchase-title">Make it yours</h3><div className="repository-price">${Number(listing.price.replace("$", "")).toFixed(2)}</div><p className="hint">{checkoutLabel(listing.accessPolicy)}. {listing.accessPolicy?.mode === "single_download" ? accessPolicyLabel(listing.accessPolicy) : `Clone or download with retries for ${accessWindowLabel(listing.accessPolicy?.minutes ?? DEFAULT_ACCESS_POLICY.minutes)}.`}</p>
                    <div className="repository-payment-tabs" role="group" aria-label="Purchase method"><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "wallet")} aria-pressed={selectedPayment === "wallet"} onClick={() => setPayment("wallet")}>Your wallet</button><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "x402")} aria-pressed={selectedPayment === "agent"} onClick={() => setPayment("agent")}>x402 / Agent</button></div>
                    <div hidden={selectedPayment !== "wallet"}><h3>Pay with wallet</h3><p className="hint">Send USDC or EURC on Arc through the Margit contract to the publisher.</p><DirectBuyButton listing={listing} onPurchased={setPurchase} /></div>
                    <div hidden={selectedPayment !== "agent"}><h3>Buy with an agent</h3><p className="hint">Give this endpoint to your x402-compatible agent. It pays using its own funded Circle Gateway balance and receives the repository access link.</p><AgentInstructions listingId={listing.id} /></div>
                    {selectedPayment === "wallet" && !account && <div className="repository-requirements"><button className="btn btn-primary repository-connect-wallet" type="button" onClick={() => {void connectModal.connect({client:thirdwebClient, wallets:thirdwebWallets, chain:arcTestnet, theme:thirdwebTheme, appMetadata:thirdwebAppMetadata}).catch(() => undefined)}}><WalletIcon /> Connect Wallet</button></div>}
                    </>}
                </aside>
            </div>
        </section>
    );
}
