import { checkoutAmountLabel } from "../../shared/checkout";
import { parseUnits } from "viem";
import { Toast } from "../components/Toast";
import { PageLoading } from "../components/PageLoading";
import { InsufficientBalanceError, pendingCheckout, purchaseWithContract } from "../lib/checkout";
import { allowsCheckout, acceptedPaymentTokens, checkoutLabel, accessPolicyLabel, accessWindowLabel, DEFAULT_ACCESS_POLICY } from "../../shared/accessPolicy";
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
                <li>Use the returned access link according to the listing’s access terms.</li>
            </ol>
            {notification && <Toast key={notification.id} message={notification.message} tone={notification.tone} onDismiss={dismiss} />}
        </section>
    );
}

interface CachedTokenPrice { key: string; amount: string; expiresAt: number }
const priceStorageKey = (currency: PaymentToken) => `margit:checkout-price:${currency}`;
function readTokenPrice(key: string, currency: PaymentToken): CachedTokenPrice | null {
    try {
        const cached = JSON.parse(localStorage.getItem(priceStorageKey(currency)) ?? 'null') as CachedTokenPrice | null;
        return cached?.key === key && cached.expiresAt > Date.now() && /^[1-9][0-9]*$/.test(cached.amount) ? cached : null;
    } catch { return null; }
}

function DirectBuyButton({ listing, onPurchased }: { listing: Listing; onPurchased: (receipt: PurchaseReceipt) => void }) {
    const account = useActiveAccount();
    const acceptedTokens = acceptedPaymentTokens(listing.accessPolicy);
    const [selectedToken, setToken] = useState<PaymentToken>(() => acceptedTokens[0]);
    const token = acceptedTokens.includes(selectedToken) ? selectedToken : acceptedTokens[0];
    const [status, setStatus] = useState<"idle" | "checking" | "sending" | "verifying" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [balanceToast, setBalanceToast] = useState<{ message: string; id: number } | null>(null);
    const dismissBalanceToast = useCallback(() => setBalanceToast(null), []);
    const priceKey = `${listing.id}:${listing.price}`;
    const acceptsBtc = acceptedTokens.includes("cirBTC");
    const acceptsEurc = acceptedTokens.includes("EURC");
    const [pricing, setPricing] = useState<Partial<Record<PaymentToken, CachedTokenPrice | null>>>(() => ({ EURC: readTokenPrice(priceKey, 'EURC'), cirBTC: readTokenPrice(priceKey, 'cirBTC') }));
    const [priceErrors, setPriceErrors] = useState<Partial<Record<PaymentToken, string>>>({});
    const [priceRevision, setPriceRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        const load = async (currency: PaymentToken) => {
            setPriceErrors(previous => ({ ...previous, [currency]: undefined }));
            try {
                const response = await fetch(`/api/checkout/price?listingId=${encodeURIComponent(listing.id)}&currency=${currency}`, { signal: controller.signal });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error ?? `Could not load ${currency} price.`);
                if (data.currency !== currency || !/^[1-9][0-9]*$/.test(data.amount) || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error(`Invalid ${currency} price.`);
                if (controller.signal.aborted) return;
                const cached = { key: priceKey, amount: data.amount, expiresAt: data.expiresAt };
                setPricing(previous => ({ ...previous, [currency]: cached }));
                try { localStorage.setItem(priceStorageKey(currency), JSON.stringify(cached)); } catch { /* In-memory cache is sufficient. */ }
            } catch (err) {
                if (!controller.signal.aborted) setPriceErrors(previous => ({ ...previous, [currency]: err instanceof Error ? err.message : `Could not load ${currency} price.` }));
            }
        };
        if (acceptsEurc) void load('EURC');
        if (acceptsBtc) void load('cirBTC');
        // Preload before selection and keep the short-lived BTC reference fresh.
        const timer = window.setInterval(() => {
            if (acceptsBtc) void load('cirBTC');
            if (acceptsEurc && !readTokenPrice(priceKey, 'EURC')) void load('EURC');
        }, 30_000);
        return () => { controller.abort(); window.clearInterval(timer); };
    }, [listing.id, priceKey, acceptsBtc, acceptsEurc, priceRevision]);
    const cached = pricing[token];
    const amount = token === "USDC" ? parseUnits(listing.price.replace("$", ""), 6).toString() : cached?.key === priceKey && cached.expiresAt > Date.now() ? cached.amount : null;
    const priceError = priceErrors[token];
    const displayAmount = amount ? checkoutAmountLabel(amount, token) : null;

    if (!account) {
        return null;
    }

    const buy = async () => {
        setError(null);
        setStatus("checking");
        try {
            const data = await purchaseWithContract(listing, token, account, setStatus, amount ?? undefined);
            onPurchased({ accessPolicy: data.accessPolicy, amount: data.amount, cloneUrl: data.cloneUrl, transactionHash: data.transactionHash, currency: data.currency, method: "wallet", expiresAt: data.expiresAt, checkoutContract: data.checkoutContract });
            setStatus("done");
        } catch (err) {
            if (err instanceof InsufficientBalanceError) {
                setBalanceToast(previous => ({ message: err.message, id: (previous?.id ?? 0) + 1 }));
                setStatus('idle');
                return;
            }
            setError(err instanceof Error ? err.message : "Purchase failed");
            setStatus("error");
            if (token !== 'USDC') {
                setPricing(previous => ({ ...previous, [token]: null }));
                try { localStorage.removeItem(priceStorageKey(token)); } catch { /* Storage may be disabled. */ }
            }
            setPriceRevision(value => value + 1);
        }
    };

    const busy = status === "checking" || status === "sending" || status === "verifying";
    const label =
        status === "checking" ? "Checking delivery…" : status === "sending" ? "Confirm in wallet…" : status === "verifying" ? "Verifying…" : pendingCheckout(listing.id, account.address) ? "Recover purchase" : amount ? `Pay ${displayAmount} ${token}` : priceError ? `Retry ${token} price` : "Converting…";

    return (
        <div className="buy-button-wrap">
            <div className="token-toggle" role="group" aria-label="Payment currency">
                {acceptedTokens.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`token-toggle-option ${token === option ? "active" : ""}`}
                        disabled={busy}
                        aria-pressed={token === option}
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
            {balanceToast && <Toast key={balanceToast.id} message={balanceToast.message} onDismiss={dismissBalanceToast} />}
            {(error || (token !== "USDC" && priceError)) && <p className="error">{error ?? priceError}</p>}
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
                    <div className="repository-cover listing-media" role="img" aria-label={listing.screenshots.length ? `Screenshot ${selectedImage + 1} of ${name}` : `${name} repository cover`} style={listingMediaStyle(listing.screenshots[selectedImage], "#9f8be7", listing.screenshotBackground)} />
                    {listing.screenshots.length > 1 && <div className="repository-thumbnails">{listing.screenshots.map((src, i) => <button type="button" key={src} aria-label={`Show screenshot ${i+1}`} aria-pressed={i === selectedImage} onClick={() => setSelectedImage(i)}><img src={src} alt="" /></button>)}</div>}
                    <section className="repository-about"><h2>Inside {name}</h2><div className="repository-description-row"><p className="repository-description">{listing.sellerDescription || listing.description || "The publisher hasn’t added a description yet."}</p>{(listing.language || normalizeDemoUrl(listing.demoUrl)) && <div className="repository-tags">{listing.language && <span>{listing.language}</span>}{normalizeDemoUrl(listing.demoUrl) && <a href={normalizeDemoUrl(listing.demoUrl)!} target="_blank" rel="noopener noreferrer">Live preview ↗</a>}</div>}</div></section>
                    <a className="repository-author" href={publisher} onClick={e => {e.preventDefault(); navigate(publisher)}}><img src={`https://github.com/${listing.ownerLogin}.png?size=160`} alt="" /><div><p className="repository-eyebrow">Published by</p><h3>{listing.ownerLogin}</h3><p>Explore all repositories by this publisher ↗</p></div></a>
                    <ReviewsSection subject={name} />
                </article>
                <aside className="repository-purchase" aria-label="Unlock repository">
                    {purchase ? <PurchaseSuccess receipt={purchase} listing={listing} /> : <>
                    <h3 className="repository-purchase-title">Make it yours</h3><div className="repository-price">${Number(listing.price.replace("$", "")).toFixed(2)}</div><p className="hint">{checkoutLabel(listing.accessPolicy)}. {listing.accessPolicy?.mode === "single_download" || listing.accessPolicy?.mode === "permanent" ? accessPolicyLabel(listing.accessPolicy) : `Clone or download with retries for ${accessWindowLabel(listing.accessPolicy?.minutes ?? DEFAULT_ACCESS_POLICY.minutes)}.`}</p>
                    <div className="repository-payment-tabs" role="group" aria-label="Purchase method"><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "wallet")} aria-pressed={selectedPayment === "wallet"} onClick={() => setPayment("wallet")}>Your wallet</button><button type="button" disabled={!allowsCheckout(listing.accessPolicy, "x402")} aria-pressed={selectedPayment === "agent"} onClick={() => setPayment("agent")}>x402 / Agent</button></div>
                    <div hidden={selectedPayment !== "wallet"}><h3>Pay with wallet</h3><p className="hint">Send {new Intl.ListFormat("en", { style: "long", type: "disjunction" }).format(acceptedPaymentTokens(listing.accessPolicy))} on Arc through the Margit contract to the publisher.</p><DirectBuyButton listing={listing} onPurchased={setPurchase} /></div>
                    <div hidden={selectedPayment !== "agent"}><h3>Buy with an agent</h3><p className="hint">Give this endpoint to your x402-compatible agent. It pays using its own funded Circle Gateway balance and receives the repository access link.</p><AgentInstructions listingId={listing.id} /></div>
                    {selectedPayment === "wallet" && !account && <div className="repository-requirements"><button className="btn btn-primary repository-connect-wallet" type="button" onClick={() => {void connectModal.connect({client:thirdwebClient, wallets:thirdwebWallets, chain:arcTestnet, theme:thirdwebTheme, appMetadata:thirdwebAppMetadata}).catch(() => undefined)}}><WalletIcon /> Connect Wallet</button></div>}
                    </>}
                </aside>
            </div>
        </section>
    );
}
