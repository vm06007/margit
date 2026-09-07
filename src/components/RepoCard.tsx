import { useEffect, useState, type ReactNode } from "react";
import {
    createListing,
    deleteListing,
    makeRepoPrivate,
    resolveArcNsReverse,
    resolveName,
    type Listing,
    type Repo,
} from "../api";
import { isRecentlyListed } from "../lib/format";
import { CardMedia } from "./CardMedia";
import { EyeIcon, GitHubIcon, TrashIcon } from "./icons";

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const MAX_SCREENSHOTS = 4;

export function ListingModal({
    repoFullName,
    onCancel,
    onCreated,
}: {
    repoFullName: string;
    onCancel: () => void;
    onCreated: (listing: Listing) => void;
}) {
    const [price, setPrice] = useState("$0.05");
    const [payoutAddress, setPayoutAddress] = useState("");
    const [resolved, setResolved] = useState<string | "loading" | "error" | null>(null);
    const [description, setDescription] = useState("");
    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Live-preview ENS (.eth) / ArcNS (.arc, .circle) resolution as the seller types.
    useEffect(() => {
        const trimmed = payoutAddress.trim();
        if (!trimmed || EVM_ADDRESS_PATTERN.test(trimmed)) {
            setResolved(null);
            return;
        }
        if (!/\.(eth|arc|circle)$/i.test(trimmed)) {
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

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const listing = await createListing({
                repoFullName,
                price,
                payoutAddress,
                sellerDescription: description.trim() || undefined,
                screenshots: screenshots.length > 0 ? screenshots : undefined,
            });
            onCreated(listing);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create listing");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>List for sale</h2>
                    <p className="hint">{repoFullName}</p>
                    <button type="button" className="modal-close" onClick={onCancel}>
                        ✕
                    </button>
                </div>

                <div className="modal-body">
                    <label className="modal-field">
                        <span className="modal-label">Price</span>
                        <input
                            className="input"
                            placeholder="$0.05"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                    </label>

                    <label className="modal-field">
                        <span className="modal-label">Payout address</span>
                        <input
                            className="input"
                            placeholder="0x… address, name.eth, or name.arc"
                            value={payoutAddress}
                            onChange={(e) => setPayoutAddress(e.target.value)}
                        />
                        {resolved === "loading" && <span className="hint">Resolving…</span>}
                        {resolved === "error" && <span className="error">Could not resolve that name.</span>}
                        {resolved && resolved !== "loading" && resolved !== "error" && (
                            <span className="hint">
                                → <code>{resolved}</code>
                            </span>
                        )}
                    </label>

                    <label className="modal-field">
                        <span className="modal-label">Description (optional — overrides the repo's own)</span>
                        <textarea
                            className="input"
                            rows={4}
                            placeholder="Describe what buyers get…"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </label>

                    <div className="modal-field">
                        <span className="modal-label">
                            Screenshots <span className="hint">({screenshots.length}/{MAX_SCREENSHOTS})</span>
                        </span>
                        {screenshots.length < MAX_SCREENSHOTS && (
                            <label className="screenshot-upload">
                                + Add images
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="sr-only"
                                    onChange={(e) => {
                                        addScreenshots(e.target.files);
                                        e.target.value = "";
                                    }}
                                />
                            </label>
                        )}
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
                    </div>

                    {error && <p className="error">{error}</p>}
                </div>

                <div className="modal-footer">
                    <button type="button" className="btn btn-ghost" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={submitting || resolved === "loading"}
                        onClick={submit}
                    >
                        {submitting ? "Listing…" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function RepoGroup({
    label,
    repos,
    view,
    children,
}: {
    label: string;
    repos: Repo[];
    view: "cards" | "list";
    children: (repo: Repo) => ReactNode;
}) {
    const [open, setOpen] = useState(true);

    return (
        <div className="repo-group">
            <button type="button" className="repo-group-label" onClick={() => setOpen((v) => !v)}>
                <span className={`chevron ${open ? "chevron-open" : ""}`}>▸</span>
                {label} <span className="count">{repos.length}</span>
            </button>
            {open &&
                (repos.length === 0 ? (
                    <p className="hint">No {label.toLowerCase()} repos.</p>
                ) : view === "list" ? (
                    <ul className="repo-list">{repos.map(children)}</ul>
                ) : (
                    <div className="catalog-grid">{repos.map(children)}</div>
                ))}
        </div>
    );
}

export function ListingPanel({
    listing,
    onUnlisted,
    navigate,
}: {
    listing: Listing;
    onUnlisted: (id: string) => void;
    navigate: (p: string) => void;
}) {
    const [copied, setCopied] = useState(false);
    const [unlisting, setUnlisting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [arcName, setArcName] = useState<string | null>(null);
    const unlockUrl = `${window.location.origin}/api/listings/unlock?id=${listing.id}`;

    useEffect(() => {
        let cancelled = false;
        setArcName(null);
        resolveArcNsReverse(listing.payoutAddress).then((name) => {
            if (!cancelled) setArcName(name);
        });
        return () => {
            cancelled = true;
        };
    }, [listing.payoutAddress]);

    const copy = () => {
        navigator.clipboard.writeText(unlockUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const unlist = async () => {
        if (!confirm(`Remove "${listing.repoFullName}" from the catalog?`)) return;
        setUnlisting(true);
        setError(null);
        try {
            await deleteListing(listing.id);
            onUnlisted(listing.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to unlist");
        } finally {
            setUnlisting(false);
        }
    };

    return (
        <div className="listing-panel">
            <div className="listing-panel-row">
                <span className="tag tag-muted">Payout</span>
                <code>{arcName ?? listing.payoutAddress}</code>
                {arcName && <span className="hint payout-address-hint">{listing.payoutAddress}</span>}
            </div>
            <div className="listing-panel-row">
                <span className="tag tag-muted">Agent unlock URL</span>
                <code className="unlock-url">{unlockUrl}</code>
                <button type="button" className="btn btn-ghost" onClick={copy}>
                    {copied ? "Copied!" : "Copy"}
                </button>
            </div>
            <div className="listing-panel-row">
                <button
                    type="button"
                    className="btn btn-outline btn-icon"
                    onClick={() => navigate(`/${listing.repoFullName}`)}
                >
                    <EyeIcon /> View in catalog
                </button>
                <a
                    className="btn btn-outline btn-icon"
                    href={`https://github.com/${listing.repoFullName}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <GitHubIcon /> Open repo
                </a>
                <button type="button" className="btn btn-ghost btn-icon" disabled={unlisting} onClick={unlist}>
                    <TrashIcon /> {unlisting ? "Unlisting…" : "Unlist"}
                </button>
            </div>
            {error && <p className="error">{error}</p>}
        </div>
    );
}

export function RepoRow({
    repo,
    listing,
    onListed,
    onUnlisted,
    onMadePrivate,
    navigate,
    highlighted,
}: {
    repo: Repo;
    listing: Listing | undefined;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
    highlighted?: boolean;
}) {
    const [formOpen, setFormOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);

    const convert = async () => {
        setConverting(true);
        setConvertError(null);
        try {
            await makeRepoPrivate(repo.fullName);
            onMadePrivate(repo.id);
        } catch (err) {
            setConvertError(err instanceof Error ? err.message : "Failed to convert");
        } finally {
            setConverting(false);
        }
    };

    return (
        <li className={`repo-card ${highlighted ? "repo-flash" : ""}`}>
            <div
                className={`repo-row ${listing ? "repo-row-clickable" : ""}`}
                onClick={() => {
                    if (listing) setManageOpen((v) => !v);
                }}
            >
                <a
                    className="repo-name"
                    href={repo.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                >
                    {repo.name}
                </a>
                <span className="repo-row-spacer" />
                {repo.private && <span className="tag tag-muted">private</span>}
                {repo.language && <span className="tag">{repo.language}</span>}
                <span className="tag tag-muted">★ {repo.stargazersCount}</span>

                {listing ? (
                    <span className="badge badge-listed">
                        listed @ {listing.price} {manageOpen ? "▴" : "▾"}
                    </span>
                ) : repo.isOrgOwned ? null : repo.private ? (
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={(e) => {
                            e.stopPropagation();
                            setFormOpen((v) => !v);
                        }}
                    >
                        {formOpen ? "Close" : "List for sale"}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={converting}
                        onClick={(e) => {
                            e.stopPropagation();
                            convert();
                        }}
                    >
                        {converting ? "Converting…" : "Make private"}
                    </button>
                )}
            </div>
            {convertError && <p className="error repo-inline-error">{convertError}</p>}
            {formOpen && !listing && (
                <ListingModal
                    repoFullName={repo.fullName}
                    onCancel={() => setFormOpen(false)}
                    onCreated={(created) => {
                        setFormOpen(false);
                        onListed(created);
                    }}
                />
            )}
            {manageOpen && listing && (
                <ListingPanel
                    listing={listing}
                    navigate={navigate}
                    onUnlisted={(id) => {
                        setManageOpen(false);
                        onUnlisted(id);
                    }}
                />
            )}
        </li>
    );
}

export function RepoCard({
    repo,
    listing,
    onListed,
    onUnlisted,
    onMadePrivate,
    navigate,
    highlighted,
}: {
    repo: Repo;
    listing: Listing | undefined;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
    highlighted?: boolean;
}) {
    const [formOpen, setFormOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [converting, setConverting] = useState(false);
    const [convertError, setConvertError] = useState<string | null>(null);

    const convert = async () => {
        setConverting(true);
        setConvertError(null);
        try {
            await makeRepoPrivate(repo.fullName);
            onMadePrivate(repo.id);
        } catch (err) {
            setConvertError(err instanceof Error ? err.message : "Failed to convert");
        } finally {
            setConverting(false);
        }
    };

    return (
        <div className={`listing-card ${highlighted ? "repo-flash" : ""}`}>
            <CardMedia
                seed={repo.fullName}
                screenshot={listing?.screenshots[0]}
                isNew={listing ? isRecentlyListed(listing.createdAt) : false}
            />
            <div className="listing-card-owner">
                <a className="listing-card-title" href={repo.htmlUrl} target="_blank" rel="noreferrer">
                    {repo.name}
                </a>
                {listing && (
                    <button
                        type="button"
                        className="btn-icon-plain"
                        onClick={() => setManageOpen((v) => !v)}
                        aria-label="Manage listing"
                    >
                        {manageOpen ? "▴" : "▾"}
                    </button>
                )}
            </div>
            <div className="listing-card-tags">
                {repo.private && <span className="tag tag-muted">private</span>}
                {repo.language && <span className="tag">{repo.language}</span>}
                <span className="tag tag-muted">★ {repo.stargazersCount}</span>
            </div>
            <div className="listing-card-footer">
                {listing ? <span className="listing-card-price">listed @ {listing.price}</span> : <span />}
                {listing ? null : repo.isOrgOwned ? null : repo.private ? (
                    <button type="button" className="btn btn-outline" onClick={() => setFormOpen((v) => !v)}>
                        {formOpen ? "Close" : "List for sale"}
                    </button>
                ) : (
                    <button type="button" className="btn btn-outline" disabled={converting} onClick={convert}>
                        {converting ? "Converting…" : "Make private"}
                    </button>
                )}
            </div>
            {convertError && <p className="error repo-inline-error">{convertError}</p>}
            {formOpen && !listing && (
                <ListingModal
                    repoFullName={repo.fullName}
                    onCancel={() => setFormOpen(false)}
                    onCreated={(created) => {
                        setFormOpen(false);
                        onListed(created);
                    }}
                />
            )}
            {manageOpen && listing && (
                <ListingPanel
                    listing={listing}
                    navigate={navigate}
                    onUnlisted={(id) => {
                        setManageOpen(false);
                        onUnlisted(id);
                    }}
                />
            )}
        </div>
    );
}
