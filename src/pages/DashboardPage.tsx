import { ACCESS_WINDOWS, DEFAULT_ACCESS_POLICY, accessPolicyLabel, accessWindowLabel, type AccessPolicy } from "../../shared/accessPolicy";
import { MakePrivateModal } from "../components/MakePrivateModal";
import { RepoVisibilitySelect } from "../components/RepoVisibilitySelect";
import { normalizeDemoUrl } from "../../shared/demoUrl";
import { useEffect, useMemo, useState } from "react";
import {
    createListing,
    deleteListing,
    fetchRepoReadme,
    generateRepoDescription,
    resolveName,
    type Listing,
    type Me,
    type Repo,
} from "../api";


/**
 * Dashboard ("My Repos") page — a faithful React port of the finished design/behavior
 * prototyped in public/landing/works2.html (a static copy of the "Rayo" vendor template,
 * made dynamic against this same backend). The vendor CSS (main.min.css/plugins.min.css/
 * loader.css) is loaded globally in src/main.tsx, so classes below (mxd-*, tag-*, btn-*)
 * are the real vendor classes. The page-scoped rules below (pill-select, modal-wide,
 * modal-grid, etc.) mirror works2.html's own inline <style> block verbatim, since those
 * rules don't exist anywhere in the vendor CSS and were hand-tuned against the vendor's
 * CSS custom properties (--base, --st-muted, --t-bright, --accent, …).
 *
 * Note: works2.html's markup includes vendor "hover-reveal"/"anim-uni-in-up"/"reveal-type"
 * classes for a cursor-following thumbnail-preview + scroll-in animation. Those classes
 * have zero rules in main.min.css — all their behavior comes from app.min.js, which (like
 * catalog2.html's port) is never loaded in the real app. They're intentionally dropped here.
 */

const MAX_SCREENSHOTS = 4;
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
            .modal-repo-thumb {
                width: 100%;
                height: 12rem;
                border-radius: 8px;
                margin-bottom: 1.6rem;
                background-size: cover;
                background-position: center;
            }
            .modal-wide .modal-body { padding: 3.2rem 2.8rem; }
            .modal-wide .modal-footer { border-top: none; padding-top: 0.4rem; }
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
            .modal-field .hint { font-size: 1.4rem !important; }
            .modal-delivery-terms { min-width: 0; }
            .modal-delivery-terms .agent-input { width: 100%; min-width: 0; }
            .listing-details-tabs { display: flex; gap: .5rem; padding: .5rem; border: 1px solid var(--t-muted); border-radius: 4rem; margin-bottom: 2.4rem; }
            .modal-repo-details .listing-details-tabs { flex-direction: column; border-radius: 2.4rem; margin-top: 0; }
            .listing-sidebar-navigation { margin-top: auto; padding-top: 2.4rem; }
            .listing-sidebar-navigation .listing-details-tabs { margin-bottom: 0; }
            .listing-sidebar-divider { width: 100%; border: 0; border-top: 1px solid var(--st-muted); margin: 1rem 0 2.4rem; }
            .listing-details-tabs button { display: flex; align-items: center; justify-content: flex-start; gap: 1rem; text-align: left; flex: 1; padding: 1.2rem 1.8rem; border: 0; border-radius: 3rem; background: transparent; color: var(--t-medium); font: inherit; font-size: 1.7rem; }
            .listing-details-tabs button i { flex-shrink: 0; font-size: 2rem; }
            .listing-details-tabs button[aria-selected="true"] { background: var(--t-bright); color: var(--base); }
            .listing-details-tabs button:focus-visible { outline: 2px solid var(--t-bright); outline-offset: 3px; }
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
            .screenshot-thumb { position: relative; width: 7rem; height: 7rem; border-radius: 8px; overflow: hidden; }
            .screenshot-thumb img { width: 100%; height: 100%; object-fit: cover; }
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
            .mxd-projects-list__item.repo-flash { animation: repo-row-flash 1.8s ease-out; }
            @keyframes repo-row-flash {
                0% { background: color-mix(in srgb, var(--accent) 25%, transparent); }
                100% { background: transparent; }
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
        `}</style>
    );
}

function ScreenshotPicker({
    screenshots,
    setScreenshots,
    actions,
}: {
    screenshots: string[];
    setScreenshots: (update: (prev: string[]) => string[]) => void;
    actions?: import('react').ReactNode;
}) {
    const addScreenshots = (files: FileList | null) => {
        for (const file of Array.from(files ?? []).slice(0, MAX_SCREENSHOTS - screenshots.length)) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result;
                if (typeof result === "string") setScreenshots((prev) => [...prev, result]);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="modal-field modal-screenshot-field">
            {screenshots.length > 0 && (
                <div className="screenshot-thumbs">
                    {screenshots.map((src, i) => (
                        <div key={i} className="screenshot-thumb">
                            <img src={src} alt="" />
                            <button
                                type="button"
                                className="screenshot-remove"
                                onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
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
    const isEdit = !!listing;
    const [price, setPrice] = useState(listing?.price ?? "$0.05");
    const [payoutAddress, setPayoutAddress] = useState(listing?.payoutAddress ?? "");
    const [resolved, setResolved] = useState<string | "loading" | "error" | null>(null);
    const [detailsTab, setDetailsTab] = useState<"general" | "access">("general");
    const [accessPolicy, setAccessPolicy] = useState<AccessPolicy>(listing?.accessPolicy ?? DEFAULT_ACCESS_POLICY);
    const [description, setDescription] = useState(listing?.sellerDescription ?? "");
    const [demoUrl, setDemoUrl] = useState(listing ? listing.demoUrl ?? "" : normalizeDemoUrl(repo.homepage) ?? "");
    const [screenshots, setScreenshots] = useState<string[]>(listing?.screenshots ?? []);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [descStatus, setDescStatus] = useState<string | null>(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [readmeBusy, setReadmeBusy] = useState(false);
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

    const useReadme = async () => {
        setReadmeBusy(true);
        setDescStatus("Fetching README…");
        try {
            setDescription(await fetchRepoReadme(repo.fullName));
            setDescStatus(null);
        } catch (err) {
            setDescStatus(err instanceof Error ? err.message : "Failed to fetch README");
        } finally {
            setReadmeBusy(false);
        }
    };

    const generateWithAi = async () => {
        setAiBusy(true);
        setDescStatus("Asking the AI to write one… (reads the README, may take a moment)");
        try {
            setDescription(await generateRepoDescription(repo.fullName));
            setDescStatus(null);
        } catch (err) {
            setDescStatus(err instanceof Error ? err.message : "Failed to generate a description");
        } finally {
            setAiBusy(false);
        }
    };

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const normalizedDemoUrl = normalizeDemoUrl(demoUrl);
            if (demoUrl.trim() && !normalizedDemoUrl) throw new Error("Enter a valid HTTP or HTTPS demo URL.");
            // No PATCH endpoint exists server-side — "editing" is delete-then-recreate under
            // the same repoFullName, which is functionally equivalent from the seller's POV.
            if (isEdit && listing) await deleteListing(listing.id);
            const saved = await createListing({
                repoFullName: repo.fullName,
                demoUrl: normalizedDemoUrl ?? "",
                accessPolicy,
                price,
                payoutAddress,
                sellerDescription: description.trim() || undefined,
                screenshots: screenshots.length > 0 ? screenshots : undefined,
            });
            onSaved(saved);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save listing");
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
            setError(err instanceof Error ? err.message : "Failed to unlist");
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
                        <div
                            className="modal-repo-thumb"
                            style={{ marginTop: "1.6rem", backgroundImage: `url(${thumbFor(repo, listing)})` }}
                        />
                        <div className="listing-sidebar-navigation">
                        <hr className="listing-sidebar-divider" />
                        <div className="listing-details-tabs" role="tablist" aria-label="Listing details">
                            {(["general", "access"] as const).map(tab => <button key={tab} type="button" role="tab" id={`listing-${tab}-tab`} aria-controls={`listing-${tab}-panel`} aria-selected={detailsTab === tab} tabIndex={detailsTab === tab ? 0 : -1} onClick={() => setDetailsTab(tab)} onKeyDown={event => {
                                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                                event.preventDefault();
                                const next = event.key === "Home" ? "general" : event.key === "End" ? "access" : tab === "general" ? "access" : "general";
                                setDetailsTab(next);
                                document.getElementById(`listing-${next}-tab`)?.focus();
                            }}><i className={`ph ph-${tab === "general" ? "text-align-left" : "lock-simple"}`} aria-hidden="true" /><span>{tab === "general" ? "General Details" : "Access Details"}</span></button>)}
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
                        <div role="tabpanel" id="listing-general-panel" aria-labelledby="listing-general-tab" hidden={detailsTab !== "general"}>
                        <label className="modal-field">
                            <span className="modal-label">Price</span>
                            <input
                                className="agent-input"
                                placeholder="$0.05"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                            />
                        </label>

                        <label className="modal-field">
                            <span className="modal-label">Payout address</span>
                            <input
                                className="agent-input"
                                placeholder="0x… address, name.eth, or name.arc"
                                value={payoutAddress}
                                onChange={(e) => setPayoutAddress(e.target.value)}
                            />
                            {resolved === "loading" && <span className="hint" style={{ fontSize: "1.5rem" }}>Resolving…</span>}
                            {resolved === "error" && (
                                <span className="hint" style={{ fontSize: "1.5rem" }}>Could not resolve that name.</span>
                            )}
                            {resolved && resolved !== "loading" && resolved !== "error" && (
                                <span className="hint" style={{ fontSize: "1.5rem" }}>
                                    → <code>{resolved}</code>
                                </span>
                            )}
                        </label>

                        <label className="modal-field">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                                <span className="modal-label">Description</span>
                                <div style={{ display: "flex", gap: "1.2rem", flexShrink: 0 }}>
                                    <button type="button" className="modal-link-btn" disabled={aiBusy} onClick={generateWithAi}>
                                        ✨ Generate with AI
                                    </button>
                                    <button type="button" className="modal-link-btn" disabled={readmeBusy} onClick={useReadme}>
                                        Use README
                                    </button>
                                </div>
                            </div>
                            <textarea
                                className="agent-input"
                                rows={4}
                                placeholder="Describe what buyers get…"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                            {descStatus && <p className="hint" style={{ fontSize: "1.4rem" }}>{descStatus}</p>}
                        </label>

                        <div className="modal-field">
                            <label className="modal-label" htmlFor="listing-demo-url">Live preview / Demo link</label>
                            <input id="listing-demo-url" className="agent-input" type="url" placeholder="https://your-demo.com" value={demoUrl} onChange={event => setDemoUrl(event.target.value)} disabled={submitting} />
                        </div>
                        <ScreenshotPicker screenshots={screenshots} setScreenshots={setScreenshots} actions={formActions} />
                        </div>
                        <div role="tabpanel" id="listing-access-panel" aria-labelledby="listing-access-tab" hidden={detailsTab !== "access"}>
                        <div className="modal-field modal-delivery-terms">
                            <label className="modal-label" htmlFor="delivery-mode">Delivery terms</label>
                            <select id="delivery-mode" className="agent-input" value={accessPolicy.mode} disabled={submitting} onChange={event => setAccessPolicy({ ...accessPolicy, mode: event.target.value as AccessPolicy["mode"] })}>
                                <option value="window">Timed access · clone and ZIP with retries</option>
                                <option value="single_download">One-time ZIP download</option>
                            </select>
                            <label className="modal-label" htmlFor="delivery-window">Access expires after purchase</label>
                            <select id="delivery-window" className="agent-input" value={accessPolicy.minutes} disabled={submitting} onChange={event => setAccessPolicy({ ...accessPolicy, minutes: Number(event.target.value) })}>
                                {ACCESS_WINDOWS.map(minutes => <option key={minutes} value={minutes}>{accessWindowLabel(minutes)}</option>)}
                            </select>
                            <p className="hint">{accessPolicyLabel(accessPolicy)} Files already downloaded remain with the buyer. Changing these terms only affects new purchases.</p>
                        </div>
                        </div>
                        {error && <p className="error" role="alert" style={{ color: "#ff6b6b", fontSize: "1.6rem" }}>{error}</p>}

                        {detailsTab === "access" && formActions}
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
                                    <span className="tag tag-default tag-permanent">{listing.price}</span>
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


    return (
        <div className="mxd-section overflow-hidden dashboard-section"><div className="mxd-container grid-container">
            <DashboardStyle /><div className="mxd-block">

            <div className="mxd-section-title dashboard-heading">
                <div className="container-fluid p-0">
                    <div className="row g-0 dashboard-heading-row">
                        <div className="col-12 col-xl-8 mxd-grid-item no-margin">
                            <div className="mxd-section-title__hrtitle">
                                <h1>Your repositories</h1>
                            </div>
                        </div>
                        <div className="col-12 col-xl-4 mxd-grid-item no-margin">
                            <div className="mxd-section-title__hrcontrols pre-title">
                                <RepoVisibilitySelect value={view} onChange={value => {setView(value); setPage(1)}} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            </div><div className="mxd-block">
            {!me.authenticated && <p style={{padding: "2rem 0", opacity: .6}}><a href="/api/auth/github/login">Connect with GitHub</a> to see your repositories here.</p>}
            {reposError && <p className="error">{reposError}</p>}
            {me.authenticated && repos === null && !reposError && <p className="hint">Loading repositories…</p>}

            {repos && (
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

            {!me.authenticated && <div className="dashboard-pagination-row"><div /><label className="dashboard-per-page">Per page <span className="pill-select-wrap"><select aria-label="Per page" className="pill-select" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></span></label></div>}
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
