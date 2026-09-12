import { PAYMENT_TOKENS, type PaymentToken } from "../../shared/paymentTokens";
import { Toast } from "../components/Toast";
import { PageLoading } from "../components/PageLoading";
import { arcTestnet, thirdwebAppMetadata, thirdwebClient, thirdwebTheme, thirdwebWallets } from "../lib/thirdweb";
import { useActiveAccount, useConnectModal } from "thirdweb/react";
import { ACCESS_WINDOWS, DEFAULT_ACCESS_POLICY, acceptedPaymentTokens, accessPolicyLabel, accessWindowLabel, type AccessPolicy } from "../../shared/accessPolicy";
import { MakePrivateModal } from "../components/MakePrivateModal";
import { RepoVisibilitySelect } from "../components/RepoVisibilitySelect";
import { normalizeDemoUrl } from "../../shared/demoUrl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
    createListing,
    deleteListing,
    generateRepoDescription,
    resolveName,
    type Listing,
    type Me,
    type Repo,
} from "../api";


/** Manage GitHub repositories and their marketplace listings. */

const MAX_SCREENSHOTS = 5;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

// Same accent/additional pair CatalogPage.tsx uses for its fallback thumbnails — kept as a
// literal hex pair (not var(--accent)) so the deterministic per-repo gradient is computable
// in plain JS without tracking the current color-scheme.
const FALLBACK_ACCENT = "#9F8BE7";
const FALLBACK_ADDITIONAL = "#DDF160";

/** Deterministic two-tone gradient data: URI for repos with no seller-uploaded screenshot yet — usable directly as an <img src> or a CSS background-image, unlike a plain CSS gradient. */
function gradientDataUri(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash += seed.charCodeAt(i);
    const [from, to] = hash % 2 === 0 ? [FALLBACK_ACCENT, FALLBACK_ADDITIONAL] : [FALLBACK_ADDITIONAL, FALLBACK_ACCENT];
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
        `</linearGradient></defs><rect width='600' height='400' fill='url(%23g)'/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function thumbFor(repo: Repo, listing: Listing | undefined): string {
    return listing?.screenshots[0] || gradientDataUri(repo.fullName);
}

/** Page-scoped CSS not covered by the vendor stylesheet — ported near-verbatim from
    works2.html's own <style> block (pill-select, wide two-column modal, plain-text-link
    description-helper buttons, pagination disabled state). */
export function DashboardStyle() {
    return (
        <style>{`
            .pill-select-wrap { position: relative; display: inline-flex; }
            .pill-select {
                -webkit-appearance: none;
                appearance: none;
                height: 4.2rem;
                line-height: 4.2rem;
                padding: 0 3.2rem 0 1.6rem;
                border-radius: 2.1rem;
                border: 2px solid var(--st-bright);
                background: transparent;
                color: var(--t-bright);
                font: normal var(--fw-medium) 1.6rem/1 var(--_font-accent);
                cursor: pointer;
            }
            .pill-select-wrap::after {
                content: '';
                position: absolute;
                right: 1.5rem;
                top: 50%;
                width: 1.1rem;
                height: 1.1rem;
                transform: translateY(-50%);
                background-color: var(--t-bright);
                -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 8l5 5 5-5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center / contain;
                mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 8l5 5 5-5' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center / contain;
                pointer-events: none;
            }
            .modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 200;
                padding: 2rem;
            }
            .modal {
                position: relative;
                width: 100%;
                max-width: 58rem;
                max-height: 90vh;
                overflow-y: auto;
                background: var(--base);
                border: 1px solid var(--st-muted);
                border-radius: var(--_radius-m);
                padding: 2.4rem;
                font-size: 1.6rem;
            }
            .modal-wide { max-width: 96rem; padding: 0; }
            .modal-grid { display: grid; grid-template-columns: 32rem 1fr; }
            @media (max-width: 800px) {
                .modal-grid { grid-template-columns: 1fr; }
            }
            .modal-repo-details {
                display: flex;
                flex-direction: column;
                padding: 3.2rem 2.8rem;
                background: var(--base-tint);
                border-right: 1px solid var(--st-muted);
                border-radius: var(--_radius-m) 0 0 var(--_radius-m);
            }
            .modal-repo-details h2 { font-size: 2.8rem; color: var(--t-bright); word-break: break-word; }
            .modal-wide .modal-body { display: flex; flex-direction: column; padding: 3.2rem 2.8rem; }
            .modal-wide .modal-footer { border-top: none; padding: 0; }
            .modal-header { padding-bottom: 1.6rem; margin-bottom: 1.6rem; border-bottom: 1px solid var(--st-muted); }
            .modal-header h2 { font-size: 2.6rem; }
            .modal-header .hint { font-size: 1.6rem; }
            .modal-close {
                position: absolute;
                top: 2.4rem;
                right: 2.4rem;
                background: none;
                border: none;
                color: var(--t-medium);
                cursor: pointer;
                font-size: 2.4rem;
                line-height: 1;
                padding: 0.4rem;
                border-radius: 6px;
            }
            .modal-close:hover { background: var(--base-tint); }
            .modal-field { display: flex; flex-direction: column; gap: 0.7rem; margin-bottom: 1.8rem; }
            .modal-field .agent-input { font-size: 1.8rem; }
            .modal-field .agent-input[aria-invalid="true"] { border: 1px solid #ff6b6b; box-shadow: none; }
            .modal-field .agent-input[aria-invalid="true"]:focus { outline: none; box-shadow: none; }
            .modal-field .hint { font-size: 1.4rem !important; }
            .modal-delivery-terms { min-width: 0; }
            .modal-delivery-terms .agent-input { width: 100%; min-width: 0; }
            .modal-select-wrap { position: relative; width: 100%; min-width: 0; }
            .modal-select-wrap select.agent-input { appearance: none; -webkit-appearance: none; padding-right: 4.8rem; }
            .modal-select-wrap::after { content: ''; position: absolute; right: 2rem; top: 50%; width: .8rem; height: .8rem; border-right: 1.5px solid var(--t-bright); border-bottom: 1.5px solid var(--t-bright); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
            .listing-currency-picker { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; border-radius: 1.8rem; }
            .listing-currency-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .6rem; padding: 1rem .6rem; min-width: 0; border: 2px solid var(--st-muted); border-radius: 1.4rem; background: var(--base); color: var(--t-medium); font: inherit; font-size: 1.5rem; font-weight: 600; }
            .listing-currency-card.is-required:disabled { opacity: 1; cursor: default; }
            .listing-currency-card img { width: 3.6rem; height: 3.6rem; }
            .listing-currency-card i { position: absolute; top: .7rem; right: .7rem; font-size: 1.6rem; }
            .listing-currency-card[aria-pressed="true"] { border-color: transparent; background: linear-gradient(var(--base), var(--base)) padding-box, linear-gradient(120deg, #69b8ed, #aa8bf2) border-box; color: var(--t-bright); }
            .listing-currency-card[aria-pressed="true"] i { color: #aa8bf2; }
            .listing-currency-card:focus-visible { outline: 2px solid var(--t-bright); outline-offset: 3px; }
            .listing-currency-picker[aria-invalid="true"] { outline: 2px solid #ff6b6b; outline-offset: 3px; }
            .listing-details-tabs { display: flex; gap: .5rem; padding: .5rem; border: 1px solid var(--t-muted); border-radius: 4rem; margin-bottom: 2.4rem; }
            .modal-repo-details .listing-details-tabs { flex-direction: column; border-radius: 2.4rem; margin-top: 0; }
            .listing-sidebar-navigation { margin-top: auto; padding-top: 2.4rem; }
            .listing-sidebar-navigation .listing-details-tabs { margin-bottom: 0; }
            .listing-sidebar-divider { width: 100%; border: 0; border-top: 1px solid var(--st-muted); margin: 1rem 0 2.4rem; }
            .listing-details-tabs button { display: flex; align-items: center; justify-content: flex-start; gap: 1rem; text-align: left; flex: 1; padding: 1.2rem 1.8rem; border: 0; border-radius: 3rem; background: transparent; color: var(--t-medium); font: inherit; font-size: 1.7rem; }
            .listing-details-tabs button i { flex-shrink: 0; font-size: 2rem; }
            .listing-details-tabs button[aria-selected="true"] { background: var(--t-bright); color: var(--base); }
            .listing-details-tabs button:focus-visible { outline: 2px solid var(--t-bright); outline-offset: 3px; }
            .listing-details-panels { display: grid; flex: 1; }
            .listing-details-panels > [role="tabpanel"] { display: flex; flex-direction: column; grid-area: 1 / 1; min-width: 0; }
            .listing-details-panels > [role="tabpanel"] > :is(.modal-footer, .modal-screenshot-field) { margin-top: auto; }
            .listing-details-panels > [role="tabpanel"][hidden] { display: flex; visibility: hidden; pointer-events: none; }
            .listing-price-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
            .listing-price-presets { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem; margin-left: auto; }
            .listing-price-presets button { padding: .3rem .7rem; border: 1px solid var(--t-muted); border-radius: 3rem; background: transparent; color: var(--t-bright); font: inherit; font-size: 1.25rem; }
            .listing-price-presets button[aria-pressed="true"] { background: var(--t-bright); color: var(--base); border-color: var(--t-bright); }
            .listing-price-presets button:focus-visible { outline: 2px solid var(--t-bright); outline-offset: 3px; }
            .modal-generate-btn { display: inline-flex; align-items: center; gap: .7rem; }
            .modal-generate-spinner { width: 1.4rem; height: 1.4rem; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: description-spin .8s linear infinite; }
            @keyframes description-spin { to { transform: rotate(360deg); } }
            @media (prefers-reduced-motion: reduce) { .modal-generate-spinner { animation: none; } }
            .modal-label { font-size: 1.8rem; font-weight: 600; color: var(--t-medium); }
            .modal-link-btn {
                font: inherit;
                font-size: 1.4rem;
                font-weight: 600;
                color: var(--accent);
                background: none;
                border: none;
                padding: 0;
                cursor: pointer;
                text-decoration: underline;
                text-underline-offset: 0.2rem;
                white-space: nowrap;
            }
            .modal-link-btn:hover { opacity: 1; }
            .modal-link-btn:disabled { opacity: 0.5; cursor: default; }
            .modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 1rem;
                padding-top: 1.6rem;
                border-top: 1px solid var(--st-muted);
            }
            .screenshot-upload-btn { display: inline-flex; width: fit-content; cursor: pointer; }
            .screenshot-thumbs { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 1.6rem; }
            .screenshot-thumb { position: relative; width: 10rem; height: 7rem; border-radius: 8px; overflow: hidden; }
            .screenshot-thumb img { width: 100%; height: 100%; object-fit: contain; }
            .screenshot-select { display: block; width: 100%; height: 100%; padding: 0; background: #000; border: 2px solid transparent; border-radius: 8px; cursor: pointer; }
            .screenshot-select[aria-pressed="true"] { border-color: var(--t-bright); }
            .screenshot-select:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; }
            .screenshot-preview { width: 100%; height: clamp(100px, calc(90dvh - 400px), 320px); flex-shrink: 1; min-height: 0; background: #000; border-radius: 1.6rem; overflow: hidden; margin: 1.6rem 0; }
            .screenshot-cover-badge { position: absolute; left: .4rem; bottom: .4rem; padding: .1rem .5rem; border-radius: .4rem; background: #000c; color: #fff; font-size: 1rem; pointer-events: none; }
            .screenshot-background { display: flex; flex-wrap: wrap; align-items: center; gap: 1.5rem; margin-bottom: 1rem; }
            .screenshot-background label { display: flex; align-items: center; gap: 1rem; }
            .screenshot-background input { width: 3rem; height: 3rem; padding: 0; border: 0; cursor: pointer; }
            .screenshot-preview img { width: 100%; height: 100%; object-fit: contain; display: block; }
            .listing-details-panels > [role="tabpanel"] > .modal-screenshot-field { margin-top: 0; flex: 1; display: flex; flex-direction: column; }
            .modal-screenshot-field .screenshot-action-row { margin-top: auto; }
            .screenshot-remove {
                position: absolute;
                top: 0.3rem;
                right: 0.3rem;
                width: 2rem;
                height: 2rem;
                border-radius: 50%;
                border: none;
                background: rgba(0, 0, 0, 0.7);
                color: #fff;
                cursor: pointer;
                font-size: 1.2rem;
                line-height: 1;
            }
            .repos-row-clickable { cursor: pointer; }
            .mxd-projects-list__item.repo-flash { position: relative; isolation: isolate; animation: none; }
            .mxd-projects-list__item.repo-flash::after {
                content: "";
                position: absolute;
                inset: 0 1.5rem;
                z-index: -1;
                pointer-events: none;
                background: color-mix(in srgb, var(--accent) 25%, transparent);
                animation: repo-row-flash 1.8s ease-out forwards;
            }
            @keyframes repo-row-flash {
                0% { opacity: 1; }
                100% { opacity: 0; }
            }
            .dashboard-pagination-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1rem;
                flex-wrap: wrap;
                padding: 2rem 0;
            }
            .dashboard-pagination { display: flex; align-items: center; gap: 1rem; }
            .dashboard-per-page { display: flex; align-items: center; gap: 0.8rem; font-size: 1.8rem; color: var(--t-medium); }
            .dashboard-connect-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: min(60vh, 48rem);
                padding: 2rem 1.5rem;
                text-align: center;
                opacity: 0.6;
            }
            .dashboard-connect-empty p { margin: 0; }
        `}</style>
    );
}

function ScreenshotPicker({
    screenshots,
    setScreenshots,
    background,
    setBackground,
    actions,
}: {
    screenshots: string[];
    background: string | null;
    setBackground: (color: string | null) => void;
    setScreenshots: (update: (prev: string[]) => string[]) => void;
    actions?: import('react').ReactNode;
}) {
    const [selectedScreenshot, setSelectedScreenshot] = useState(0);
    const activeScreenshot = Math.min(selectedScreenshot, Math.max(0, screenshots.length - 1));
    const removeScreenshot = (index: number) => {
        setSelectedScreenshot(Math.max(0, Math.min(index < activeScreenshot ? activeScreenshot - 1 : activeScreenshot, screenshots.length - 2)));
        setScreenshots(prev => prev.filter((_, i) => i !== index));
    };
    const addScreenshots = (files: FileList | null) => {
        for (const file of Array.from(files ?? []).slice(0, MAX_SCREENSHOTS - screenshots.length)) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result;
                if (typeof result === "string") setScreenshots((prev) => [...prev, result].slice(0, MAX_SCREENSHOTS));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="modal-field modal-screenshot-field">
            {screenshots.length > 0 && <div className="screenshot-preview" style={{ backgroundColor: background || "#000" }}><img src={screenshots[activeScreenshot]} alt={`Listing preview, screenshot ${activeScreenshot + 1} of ${screenshots.length}`} /></div>}
            {screenshots.length > 0 && (
                <div className="screenshot-thumbs" role="group" aria-label="Listing screenshot previews">
                    {screenshots.map((src, i) => (
                        <div key={i} className="screenshot-thumb">
                            <button type="button" className="screenshot-select" aria-label={`Preview screenshot ${i + 1}${i === 0 ? ', listing cover' : ''}`} aria-pressed={i === activeScreenshot} onClick={() => setSelectedScreenshot(i)}><img src={src} alt="" /></button>
                            {i === 0 && <span className="screenshot-cover-badge">Cover</span>}
                            <button
                                type="button"
                                className="screenshot-remove"
                                aria-label={`Remove screenshot ${i + 1}`}
                                onClick={() => removeScreenshot(i)}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <div className="screenshot-background">{screenshots.length > 0 && <button type="button" className="modal-link-btn" disabled={activeScreenshot === 0} onClick={() => {
                const selected = activeScreenshot;
                setScreenshots(prev => selected < prev.length ? [prev[selected], ...prev.filter((_, i) => i !== selected)] : prev);
                setSelectedScreenshot(0);
            }}>{activeScreenshot === 0 ? 'Current cover' : 'Set as cover'}</button>}<label>Background color <input type="color" aria-label="Screenshot background color" value={background || '#000000'} onChange={e => setBackground(e.target.value)} /></label><button type="button" className="modal-link-btn" disabled={!background} onClick={() => setBackground(null)}>Use default</button></div>
            <span className="modal-label">
                Screenshots <span className="hint" style={{ fontSize: "1.4rem" }}>({screenshots.length}/{MAX_SCREENSHOTS})</span>
            </span>
            <div className="screenshot-action-row">
            {screenshots.length < MAX_SCREENSHOTS && (
                <label className="btn btn-anim btn-default btn-outline btn-small screenshot-upload-btn">
                    <span className="btn-caption">+ Add images</span>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={(e) => {
                            addScreenshots(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </label>
            )}
            {actions}
            </div>

        </div>
    );
}

export function ListModal({
    repo,
    listing,
    onClose,
    onSaved,
    onUnlisted,
}: {
    repo: Repo;
    listing: Listing | undefined;
    onClose: () => void;
    onSaved: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
}) {
    const account = useActiveAccount();
    const connectModal = useConnectModal();
    const [connectingWallet, setConnectingWallet] = useState(false);
    const useConnectedWallet = async () => {
        if (account) { setPayoutAddress(account.address); clearFieldError("listing-payout-address"); return; }
        setConnectingWallet(true);
        try {
            const wallet = await connectModal.connect({ client: thirdwebClient, wallets: thirdwebWallets, chain: arcTestnet, appMetadata: thirdwebAppMetadata, theme: thirdwebTheme });
            const connected = wallet.getAccount();
            if (connected) { setPayoutAddress(connected.address); clearFieldError("listing-payout-address"); }
        } catch { /* Closing the wallet picker leaves the payout address unchanged. */ }
        finally { setConnectingWallet(false); }
    };
    const isEdit = !!listing;
    const [price, setPrice] = useState(listing?.price ?? "$0.05");
    const [payoutAddress, setPayoutAddress] = useState(listing?.payoutAddress ?? "");
    const [resolved, setResolved] = useState<string | "loading" | "error" | null>(null);
    const [detailsTab, setDetailsTab] = useState<"general" | "access" | "screenshots">("general");
    const [accessPolicy, setAccessPolicy] = useState<AccessPolicy>(() => {
        const policy = listing?.accessPolicy ?? DEFAULT_ACCESS_POLICY;
        return { ...policy, acceptedTokens: PAYMENT_TOKENS.filter(token => token === "USDC" || acceptedPaymentTokens(policy).includes(token)) };
    });
    const selectedTokens = acceptedPaymentTokens(accessPolicy);
    const toggleCurrency = (currency: PaymentToken) => {
        if (currency === "USDC") return;
        const tokens = selectedTokens.includes(currency) ? selectedTokens.filter(token => token !== currency) : [...selectedTokens, currency];
        setAccessPolicy({ ...accessPolicy, acceptedTokens: tokens });
        clearFieldError("listing-currencies");
    };
    const [description, setDescription] = useState(listing?.sellerDescription ?? "");
    const [demoUrl, setDemoUrl] = useState(listing ? listing.demoUrl ?? "" : normalizeDemoUrl(repo.homepage) ?? "");
    const [screenshotBackground, setScreenshotBackground] = useState<string | null>(listing?.screenshotBackground ?? null);
    const [screenshots, setScreenshots] = useState<string[]>(listing?.screenshots ?? []);
    const [error, setError] = useState<{ message: string; id: number; field?: string } | null>(null);
    const [invalidFields, setInvalidFields] = useState<string[]>([]);
    const dismissError = useCallback(() => setError(null), []);
    const clearFieldError = (field: string) => setInvalidFields(fields => fields.filter(value => value !== field));
    const showError = (message: string, fields: string[] = []) => {
        setInvalidFields(fields);
        if (fields.length) setDetailsTab(["delivery-mode", "listing-currencies"].includes(fields[0]) ? "access" : "general");
        setError(previous => ({ message, id: (previous?.id ?? 0) + 1, field: fields[0] }));
    };
    useEffect(() => {
        if (error?.field) document.getElementById(error.field)?.focus();
    }, [error]);
    const [submitting, setSubmitting] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [confirmingUnlist, setConfirmingUnlist] = useState(false);
    const [unlisting, setUnlisting] = useState(false);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    // Live-preview ENS (.eth) / ArcNS (.arc, .circle) resolution as the seller types.
    useEffect(() => {
        const trimmed = payoutAddress.trim();
        if (!trimmed || EVM_ADDRESS_PATTERN.test(trimmed) || !/\.(eth|arc|circle)$/i.test(trimmed)) {
            setResolved(null);
            return;
        }
        let cancelled = false;
        setResolved("loading");
        const timer = setTimeout(async () => {
            try {
                const address = await resolveName(trimmed);
                if (!cancelled) setResolved(address);
            } catch {
                if (!cancelled) setResolved("error");
            }
        }, 500);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [payoutAddress]);

    const generateWithAi = async () => {
        if (aiBusy) return;
        setAiBusy(true);
        try {
            setDescription(await generateRepoDescription(repo.fullName));
        } catch (err) {
            showError(err instanceof Error ? err.message : "Failed to generate a description");
        } finally {
            setAiBusy(false);
        }
    };

    const submit = async () => {
        if (submitting) return;
        const normalizedDemoUrl = normalizeDemoUrl(demoUrl);
        const fields: string[] = [];
        const messages: string[] = [];
        if (!/^\$\d+(\.\d{1,2})?$/.test(price.trim()) || Number(price.trim().slice(1)) <= 0) {
            fields.push("listing-price");
            messages.push('Enter a price greater than $0, such as $1.50.');
        }
        const payout = payoutAddress.trim();
        if (!payout || (!EVM_ADDRESS_PATTERN.test(payout) && !/\.(eth|arc|circle)$/i.test(payout))) {
            fields.push("listing-payout-address");
            messages.push("Enter a payout wallet address or an .eth, .arc or .circle name.");
        } else if (resolved === "error") {
            fields.push("listing-payout-address");
            messages.push("Could not resolve the payout name. Check it or enter a wallet address.");
        }
        if (demoUrl.trim() && !normalizedDemoUrl) {
            fields.push("listing-demo-url");
            messages.push("Enter a valid HTTP or HTTPS demo URL.");
        }
        if (!selectedTokens.length) {
            fields.push("listing-currencies");
            messages.push("Select at least one payment currency.");
        }
        if (fields.length) { showError(messages.join(" "), fields); return; }
        setSubmitting(true);
        setError(null);
        setInvalidFields([]);
        try {
            // No PATCH endpoint exists server-side — "editing" is delete-then-recreate under
            // the same repoFullName, which is functionally equivalent from the seller's POV.
            if (isEdit && listing) await deleteListing(listing.id);
            const saved = await createListing({
                repoFullName: repo.fullName,
                demoUrl: normalizedDemoUrl ?? "",
                accessPolicy,
                price: price.trim(),
                payoutAddress: payout,
                sellerDescription: description.trim() || undefined,
                screenshots: screenshots.length > 0 ? screenshots : undefined,
                screenshotBackground,
            });
            onSaved(saved);
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to save listing";
            const fields: string[] = [];
            if (/price/i.test(message)) fields.push("listing-price");
            if (/payout|resolve|\b(?:ENS|ArcNS)\b/i.test(message)) fields.push("listing-payout-address");
            if (/demo URL/i.test(message)) fields.push("listing-demo-url");
            if (/description/i.test(message)) fields.push("listing-description");
            if (/payment currenc|x402 requires USDC/i.test(message)) fields.push("listing-currencies");
            if (/delivery terms|access window|purchase channel/i.test(message)) fields.push("delivery-mode");
            showError(message.replaceAll("payoutAddress", "Payout address").replaceAll("repoFullName", "Repository"), fields);
        } finally {
            setSubmitting(false);
        }
    };

    const unlist = async () => {
        if (!listing) return;
        setUnlisting(true);
        setError(null);
        try {
            await deleteListing(listing.id);
            onUnlisted(listing.id);
            onClose();
        } catch (err) {
            showError(err instanceof Error ? err.message : "Failed to unlist");
        } finally {
            setUnlisting(false);
        }
    };

    const formActions = (
                        <div className="modal-footer">
                            <button type="button" className="btn btn-anim btn-default btn-outline btn-small" onClick={onClose}>
                                <span className="btn-caption">Cancel</span>
                            </button>
                            <button
                                type="button"
                                className="btn btn-anim btn-default btn-accent btn-small"
                                disabled={submitting || resolved === "loading"}
                                onClick={submit}
                            >
                                <span className="btn-caption">
                                    {submitting ? (isEdit ? "Saving…" : "Listing…") : isEdit ? "Save changes" : "Confirm"}
                                </span>
                            </button>
                        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
                    <i className="ph ph-x" />
                </button>
                <div className="modal-grid">
                    {/* Left: which repo this actually is — the row you clicked isn't visible once the modal is open */}
                    <div className="modal-repo-details">
                        <p className="hint" style={{ margin: 0, fontSize: "1.5rem" }}>Listing</p>
                        <h2 style={{ margin: "0.2rem 0 1rem" }}>{repo.name}</h2>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.4rem" }}>
                            {repo.language && <span className="tag tag-default tag-outline">{repo.language}</span>}
                            <a
                                className="tag tag-default tag-outline repo-github-pill"
                                href={repo.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${repo.fullName} on GitHub`}
                                title="Open repository on GitHub"
                            >
                                {repo.private ? "Private" : "Public"}
                            </a>
                        </div>
                        <p className="hint modal-repo-detail-line" style={{ fontSize: "1.5rem", lineHeight: 1.5, marginTop: "1.6rem" }}>
                            <i className="ph ph-text-align-left" aria-hidden="true" />
                            <span>{repo.description || "No description on GitHub."}</span>
                        </p>
                        {repo.updatedAt && <p className="hint modal-repo-detail-line" style={{ fontSize: "1.4rem", marginTop: "2.4rem" }}><i className="ph ph-calendar-blank" aria-hidden="true" /><span>Updated {new Date(repo.updatedAt).toLocaleDateString()}</span></p>}
                        <hr className="listing-sidebar-divider" style={{ marginTop: "2.4rem" }} />
                        <div className="listing-sidebar-navigation">
                        <div className="listing-details-tabs" role="tablist" aria-label="Listing details">
                            {(["general", "access", "screenshots"] as const).map(tab => <button key={tab} type="button" role="tab" id={`listing-${tab}-tab`} aria-controls={`listing-${tab}-panel`} aria-selected={detailsTab === tab} tabIndex={detailsTab === tab ? 0 : -1} onClick={() => setDetailsTab(tab)} onKeyDown={event => {
                                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                                event.preventDefault();
                                const tabs = ["general", "access", "screenshots"] as const;
                                const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % tabs.length];
                                setDetailsTab(next);
                                document.getElementById(`listing-${next}-tab`)?.focus();
                            }}><i className={`ph ph-${tab === "general" ? "text-align-left" : tab === "access" ? "lock-simple" : "images"}`} aria-hidden="true" /><span>{tab === "general" ? "General Details" : tab === "access" ? "Access Details" : "Screenshots"}</span></button>)}
                        </div>
                        </div>
                        {isEdit && (
                            <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid var(--st-muted)" }}>
                                {!confirmingUnlist ? (
                                    <button
                                        type="button"
                                        className="btn btn-anim btn-default btn-outline btn-small"
                                        style={{ width: "100%", color: "#ff6b6b", borderColor: "#ff6b6b" }}
                                        onClick={() => setConfirmingUnlist(true)}
                                    >
                                        <span className="btn-caption">Unlist Repository</span>
                                    </button>
                                ) : (
                                    <div style={{ marginTop: "1rem" }}>
                                        <p className="hint" style={{ fontSize: "1.4rem", margin: "0 0 1rem" }}>
                                            Remove this listing? Buyers won't be able to find or buy it anymore.
                                        </p>
                                        <div style={{ display: "flex", gap: "0.8rem" }}>
                                            <button
                                                type="button"
                                                className="btn btn-anim btn-default btn-small"
                                                style={{ flex: 1, background: "#ff6b6b", borderColor: "#ff6b6b", color: "#fff" }}
                                                disabled={unlisting}
                                                onClick={unlist}
                                            >
                                                <span className="btn-caption">{unlisting ? "Unlisting…" : "Yes, unlist"}</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-anim btn-default btn-outline btn-small"
                                                style={{ flex: 1 }}
                                                disabled={unlisting}
                                                onClick={() => setConfirmingUnlist(false)}
                                            >
                                                <span className="btn-caption">Cancel</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: the actual form */}
                    <div className="modal-body">
                        <h2 style={{ margin: "0 0 1.6rem", fontSize: "2.4rem", color: "var(--t-bright)" }}>
                            {isEdit ? "Edit listing" : "List for sale"}
                        </h2>
                        <div className="listing-details-panels">
                        <div role="tabpanel" id="listing-general-panel" aria-labelledby="listing-general-tab" hidden={detailsTab !== "general"}>
                        <div className="modal-field">
                            <div className="listing-price-heading">
                            <label className="modal-label" htmlFor="listing-price">Price</label>
                            <div className="listing-price-presets" role="group" aria-label="Proposed price">
                                <span className="hint">Proposed price</span>
                                {["$0.05", "$1.00", "$5.00", "$10.00", "$25.00"].map(preset => <button key={preset} type="button" disabled={submitting} aria-pressed={price === preset} onClick={() => { setPrice(preset); clearFieldError("listing-price"); }}>{preset}</button>)}
                            </div>
                            </div>
                            <input
                                id="listing-price"
                                aria-invalid={invalidFields.includes("listing-price")}
                                className="agent-input"
                                placeholder="$0.05"
                                value={price}
                                onChange={(e) => { setPrice(e.target.value); clearFieldError("listing-price"); }}
                            />
                            <p className="hint">Publisher fee: 0.5% of each sale. Collected automatically at contract checkout; x402 fees are settled from My Portfolio. Buyers pay your listed price.</p>

                        </div>

                        <div className="modal-field">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                                <label className="modal-label" htmlFor="listing-payout-address">Payout address</label>
                                <button type="button" className="modal-link-btn modal-generate-btn" disabled={submitting || connectingWallet} onClick={useConnectedWallet}>
                                    <i className="ph ph-wallet" aria-hidden="true" />{connectingWallet ? "Connecting…" : "Use connected wallet"}
                                </button>
                            </div>
                            <input
                                id="listing-payout-address"
                                aria-invalid={invalidFields.includes("listing-payout-address") || resolved === "error"}
                                className="agent-input"
                                placeholder="0x… address, name.eth, or name.arc"
                                value={payoutAddress}
                                onChange={(e) => { setPayoutAddress(e.target.value); clearFieldError("listing-payout-address"); }}
                            />
                            {resolved === "loading" && <span className="hint" style={{ fontSize: "1.5rem" }}>Resolving…</span>}
                            {resolved && resolved !== "loading" && resolved !== "error" && (
                                <span className="hint" style={{ fontSize: "1.5rem" }}>
                                    → <code>{resolved}</code>
                                </span>
                            )}
                        </div>

                        <label className="modal-field">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                                <span className="modal-label">Description</span>
                                <div style={{ display: "flex", gap: "1.2rem", flexShrink: 0 }}>
                                    <button type="button" className="modal-link-btn modal-generate-btn" disabled={aiBusy} aria-busy={aiBusy} onClick={generateWithAi}>
                                        {aiBusy ? <><span className="modal-generate-spinner" aria-hidden="true" />Generating…</> : <><i className="ph ph-sparkle" aria-hidden="true" />Generate with AI</>}
                                    </button>

                                </div>
                            </div>
                            <textarea
                                id="listing-description"
                                aria-invalid={invalidFields.includes("listing-description")}
                                className="agent-input"
                                rows={2}
                                placeholder={aiBusy ? "Writing your description from the README…" : "Describe what buyers get…"}
                                value={description}
                                onChange={(e) => { setDescription(e.target.value); clearFieldError("listing-description"); }}
                            />
                        </label>

                        <div className="modal-field">
                            <label className="modal-label" htmlFor="listing-demo-url">Live preview / Demo link</label>
                            <input id="listing-demo-url" aria-invalid={invalidFields.includes("listing-demo-url")} className="agent-input" type="url" placeholder="https://your-demo.com" value={demoUrl} onChange={event => { setDemoUrl(event.target.value); clearFieldError("listing-demo-url"); }} disabled={submitting} />
                        </div>
                        {formActions}
                        </div>
                        <div role="tabpanel" id="listing-screenshots-panel" aria-labelledby="listing-screenshots-tab" hidden={detailsTab !== "screenshots"}>
                            <p className="hint">Add up to {MAX_SCREENSHOTS} screenshots. The first image is your listing cover. Remove an image to replace it.</p>
                            <ScreenshotPicker background={screenshotBackground} setBackground={setScreenshotBackground} screenshots={screenshots} setScreenshots={setScreenshots} actions={formActions} />
                        </div>
                        <div role="tabpanel" id="listing-access-panel" aria-labelledby="listing-access-tab" hidden={detailsTab !== "access"}>
                        <div className="modal-field modal-delivery-terms">
                            <label className="modal-label" htmlFor="purchase-channel">Purchase channels</label>
                            <div className="modal-select-wrap"><select id="purchase-channel" className="agent-input" value={accessPolicy.checkout ?? "both"} disabled={submitting} onChange={event => setAccessPolicy({ ...accessPolicy, checkout: event.target.value as AccessPolicy["checkout"] })}>
                                <option value="both">Both · wallet and x402</option>
                                <option value="x402">x402 only · agent checkout</option>
                                <option value="wallet">Wallet only · direct checkout</option>
                            </select></div>
                            <p className="hint">Controls the payment method. Wallet checkout does not verify that the buyer is human, and people can also use x402.</p>
                            <span className="modal-label" id="listing-currencies-label">Accepted currencies</span>
                            <div id="listing-currencies" className="listing-currency-picker" role="group" aria-labelledby="listing-currencies-label" aria-invalid={invalidFields.includes("listing-currencies")} tabIndex={-1}>
                                {PAYMENT_TOKENS.map(currency => <button key={currency} type="button" className={`listing-currency-card${currency === "USDC" ? " is-required" : ""}`} aria-label={currency === "USDC" ? "USDC (required)" : currency} aria-pressed={selectedTokens.includes(currency)} disabled={submitting || currency === "USDC"} onClick={() => toggleCurrency(currency)}>
                                    <img src={`/icons/${currency.toLowerCase()}.svg`} width="48" height="48" alt="" />
                                    <span>{currency}</span>
                                    <i className={`ph ${selectedTokens.includes(currency) ? "ph-check-circle" : "ph-circle"}`} aria-hidden="true" />
                                </button>)}
                            </div>
                            <label className="modal-label" htmlFor="delivery-mode">Delivery terms</label>
                            <div className="modal-select-wrap"><select id="delivery-mode" aria-invalid={invalidFields.includes("delivery-mode")} className="agent-input" value={accessPolicy.mode} disabled={submitting} onChange={event => { setAccessPolicy({ ...accessPolicy, mode: event.target.value as AccessPolicy["mode"] }); clearFieldError("delivery-mode"); }}>
                                <option value="window">Timed access · clone and ZIP with retries</option>
                                <option value="single_download">One-time ZIP download</option>
                                <option value="permanent">Permanent access · no expiry</option>
                            </select></div>
                            {accessPolicy.mode !== "permanent" && <><label className="modal-label" htmlFor="delivery-window">Access expires after purchase</label>
                            <div className="modal-select-wrap"><select id="delivery-window" className="agent-input" value={accessPolicy.minutes} disabled={submitting} onChange={event => setAccessPolicy({ ...accessPolicy, minutes: Number(event.target.value) })}>
                                {ACCESS_WINDOWS.map(minutes => <option key={minutes} value={minutes}>{accessWindowLabel(minutes)}</option>)}
                            </select></div></>}
                            <p className="hint">{accessPolicyLabel(accessPolicy)} Files already downloaded remain with the buyer.</p>
                        </div>
                        {formActions}
                        </div>
                        </div>
                        {error && <Toast key={error.id} message={error.message} onDismiss={dismissError} />}

                    </div>
                </div>
            </div>
        </div>
    );
}

function Pagination({
    page,
    pageCount,
    onGoToPage,
}: {
    page: number;
    pageCount: number;
    onGoToPage: (p: number) => void;
}) {
    if (pageCount <= 1) return null;
    return (
        <div className="dashboard-pagination">
            <button
                type="button"
                className="btn btn-anim btn-default btn-outline btn-small"
                onClick={() => onGoToPage(page <= 1 ? pageCount : page - 1)}
            >
                <span className="btn-caption">Prev</span>
            </button>
            <span className="hint" style={{ fontSize: "1.8rem" }}>
                Page {page} of {pageCount}
            </span>
            <button
                type="button"
                className="btn btn-anim btn-default btn-outline btn-small"
                onClick={() => onGoToPage(page >= pageCount ? 1 : page + 1)}
            >
                <span className="btn-caption">Next</span>
            </button>
        </div>
    );
}

function TagsColumn({ repo }: { repo: Repo }) {
    return (
        <div className="col-6 col-md-6 col-xl-2 mxd-grid-item no-margin">
            <div className="mxd-projects-list__tagslist">
                <ul>
                    <li><p className="t-small">{repo.language || "Repo"}</p></li>
                    <li><p className="t-small">{repo.private ? "Private" : "Public"}</p></li>
                </ul>
            </div>
        </div>
    );
}

function PrivateRepoRow({
    repo,
    listing,
    highlighted,
    onOpen,
}: {
    repo: Repo;
    listing: Listing | undefined;
    highlighted?: boolean;
    onOpen: () => void;
}) {
    const thumb = thumbFor(repo, listing);
    return (
        <div
            className={`mxd-projects-list__item repos-row-clickable ${highlighted ? "repo-flash" : ""}`}
            onClick={onOpen}
        >
            <div className="mxd-projects-list__border" />
            <div className="mxd-projects-list__inner">
                <div className="container-fluid px-0">
                    <div className="row gx-0">
                        <div className="col-12 col-xl-6 mxd-grid-item no-margin">
                            <div className="mxd-projects-list__title">
                                <div className="mxd-projects-list__icon"><i className="ph ph-arrow-right" /></div>
                                <p>{repo.name}</p>
                            </div>
                            <div className="mxd-projects-list__image">
                                <img src={thumb} alt={repo.name} />
                            </div>
                        </div>
                        <TagsColumn repo={repo} />
                        <div className="col-6 col-md-6 col-xl-2 mxd-grid-item no-margin">
                            <div className="mxd-projects-list__date repo-row-price">
                                {listing ? (
                                    <span className="tag tag-default tag-permanent">${Number(listing.price.replace("$", "")).toFixed(2)}</span>
                                ) : (
                                    <span className="repo-row-price-empty" aria-label="Not listed">—</span>
                                )}
                            </div>
                        </div>
                        <div className="col-6 col-md-6 col-xl-2 mxd-grid-item no-margin">
                            <div className="mxd-projects-list__date">
                                {listing ? (
                                    <button type="button" className="btn btn-anim btn-default btn-outline">
                                        <span className="btn-caption">Edit It</span>
                                    </button>
                                ) : (
                                    <button type="button" className="btn btn-anim btn-default btn-accent">
                                        <span className="btn-caption">List it</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mxd-projects-list__border" />
        </div>
    );
}

function PublicRepoRow({
    repo,
    highlighted,
    onOpen,
}: {
    repo: Repo;
    highlighted?: boolean;
    onOpen: () => void;
}) {
    const thumb = thumbFor(repo, undefined);

    return (
        <div className={`mxd-projects-list__item ${highlighted ? "repo-flash" : ""}`}>
            <div className="mxd-projects-list__border" />
            <div className="mxd-projects-list__inner">
                <div className="container-fluid px-0">
                    <div className="row gx-0">
                        <div className="col-12 col-xl-8 mxd-grid-item no-margin">
                            <div className="mxd-projects-list__title">
                                <div className="mxd-projects-list__icon"><i className="ph ph-arrow-right" /></div>
                                <p>{repo.name}</p>
                            </div>
                            <div className="mxd-projects-list__image">
                                <img src={thumb} alt={repo.name} />
                            </div>
                        </div>
                        <TagsColumn repo={repo} />
                        <div className="col-6 col-md-6 col-xl-2 mxd-grid-item no-margin">
                            <div className="mxd-projects-list__date">
                                <button
                                    type="button"
                                    className="btn btn-anim btn-default btn-outline"
                                    onClick={onOpen}
                                >
                                    <span className="btn-caption">Make private</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mxd-projects-list__border" />
        </div>
    );
}

export function DashboardPage({
    me,
    repos,
    reposError,
    listingByRepo,
    onListed,
    onUnlisted,
    onMadePrivate,
    highlightedRepo,
}: {
    me: Me;
    repos: Repo[] | null;
    reposError: string | null;
    listingByRepo: Map<string, Listing>;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
    highlightedRepo?: string | null;
}) {
    const [view, setView] = useState<"private" | "public">("private");
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);
    const [privacyRepo, setPrivacyRepo] = useState<Repo | null>(null);
    const [modalRepo, setModalRepo] = useState<Repo | null>(null);
    const [connectingGithub, setConnectingGithub] = useState(false);

    useEffect(() => {
        const reset = () => setConnectingGithub(false);
        window.addEventListener("pageshow", reset);
        return () => window.removeEventListener("pageshow", reset);
    }, []);

    // Org-owned repos aren't the signed-in account's to sell — the server already asks
    // GitHub for owner-affiliated repos only, but this filters defensively in case that
    // ever changes (isOrgOwned comes straight from GitHub's owner.type).
    const ownedRepos = useMemo(() => (repos ?? []).filter((r) => !r.isOrgOwned), [repos]);
    const privateRepos = useMemo(() => ownedRepos.filter((r) => r.private), [ownedRepos]);
    const publicRepos = useMemo(() => ownedRepos.filter((r) => !r.private), [ownedRepos]);
    const currentRepos = view === "private" ? privateRepos : publicRepos;
    const pageCount = Math.max(1, Math.ceil(currentRepos.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageStart = (currentPage - 1) * pageSize;
    const pageItems = currentRepos.slice(pageStart, pageStart + pageSize);

    useEffect(() => {
        setPage((p) => Math.min(p, pageCount));
    }, [pageCount]);


    if (me.authenticated && repos === null && !reposError) return <PageLoading label="Loading repositories…" />;

    return (
        <div className="mxd-section overflow-hidden dashboard-section"><div className="mxd-container grid-container">
            <DashboardStyle /><div className="mxd-block">

            <div className="mxd-section-title dashboard-heading">
                <div className="container-fluid p-0">
                    <div className="row g-0 dashboard-heading-row">
                        <div className={`col-12 ${me.authenticated ? "col-xl-8" : ""} mxd-grid-item no-margin`}>
                            <div className="mxd-section-title__hrtitle">
                                <h1>Your repositories</h1>
                            </div>
                        </div>
                        {me.authenticated && (
                            <div className="col-12 col-xl-4 mxd-grid-item no-margin">
                                <div className="mxd-section-title__hrcontrols pre-title">
                                    <RepoVisibilitySelect value={view} onChange={value => {setView(value); setPage(1)}} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            </div><div className="mxd-block">
            {!me.authenticated && (
                <div className="dashboard-connect-empty" aria-busy={connectingGithub}>
                    {connectingGithub ? (
                        <p role="status">Connecting…</p>
                    ) : (
                        <p>
                            <a
                                href="/api/auth/github/login"
                                onClick={(event) => {
                                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                    flushSync(() => setConnectingGithub(true));
                                }}
                            >
                                Connect with GitHub
                            </a>
                            {" "}to see your repositories here.
                        </p>
                    )}
                </div>
            )}
            {me.authenticated && reposError && <p className="error">{reposError}</p>}

            {me.authenticated && repos && (
                <>
                    {view === "public" && (
                        <p className="hint" style={{ margin: "0 0 2rem", fontSize: "1.4rem" }}>
                            Public repos can't be sold as-is — anyone can already clone them. Convert to private first.
                        </p>
                    )}

                    {ownedRepos.length === 0 ? (
                        <p className="hint" style={{ opacity: 0.6, padding: "2rem 0" }}>
                            No repositories found on your GitHub account.
                        </p>
                    ) : (
                        <>
                            <div className="mxd-projects-list">
                                {pageItems.length === 0 ? (
                                    <p className="hint" style={{ opacity: 0.6, padding: "2rem 0" }}>
                                        No {view} repos {view === "private" ? "yet" : "found"}.
                                    </p>
                                ) : view === "private" ? (
                                    pageItems.map((repo) => (
                                        <PrivateRepoRow
                                            key={repo.id}
                                            repo={repo}
                                            listing={listingByRepo.get(repo.fullName)}
                                            highlighted={highlightedRepo?.toLowerCase() === repo.fullName.toLowerCase()}
                                            onOpen={() => setModalRepo(repo)}
                                        />
                                    ))
                                ) : (
                                    pageItems.map((repo) => (
                                        <PublicRepoRow
                                            key={repo.id}
                                            repo={repo}
                                            highlighted={highlightedRepo?.toLowerCase() === repo.fullName.toLowerCase()}
                                            onOpen={() => setPrivacyRepo(repo)}
                                        />
                                    ))
                                )}
                            </div>

                            <div className="dashboard-pagination-row">
                                <Pagination page={currentPage} pageCount={pageCount} onGoToPage={setPage} />
                                <label className="dashboard-per-page">
                                    Per page
                                    <span className="pill-select-wrap">
                                        <select
                                            className="pill-select"
                                            value={pageSize}
                                            onChange={(e) => {
                                                setPageSize(Number(e.target.value) || 10);
                                                setPage(1);
                                            }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </span>
                                </label>
                            </div>
                        </>
                    )}
                </>
            )}

            </div>
            {privacyRepo && <MakePrivateModal repo={privacyRepo} onClose={() => setPrivacyRepo(null)} onSuccess={() => {onMadePrivate(privacyRepo.id); setPage(1)}} />}
            {modalRepo && (
                <ListModal
                    repo={modalRepo}
                    listing={listingByRepo.get(modalRepo.fullName)}
                    onClose={() => setModalRepo(null)}
                    onSaved={onListed}
                    onUnlisted={onUnlisted}
                />
            )}
        </div></div>
    );
}
