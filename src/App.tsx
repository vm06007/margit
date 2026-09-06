import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getContract, prepareContractCall, readContract, sendTransaction, waitForReceipt } from "thirdweb";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { shortenAddress, toUnits } from "thirdweb/utils";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { BatchEvmScheme } from "@circle-fin/x402-batching/client";
import {
    createListing,
    deleteListing,
    downloadZip,
    fetchAgentWallet,
    fetchListings,
    fetchMe,
    fetchRepos,
    fetchUnlockRequirements,
    githubLoginUrl,
    logout,
    makeRepoPrivate,
    resolveArcNsReverse,
    resolveName,
    revokeGithubAccess,
    sendAgentMessage,
    type AgentPurchase,
    type AgentWallet,
    type Listing,
    type Me,
    type Repo,
    type UnlockRequirement,
} from "./api";
import { arcTestnet, thirdwebAppMetadata, thirdwebClient, thirdwebTheme, thirdwebWallets } from "./lib/thirdweb";
import "./App.css";

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

type PaymentToken = "USDC" | "EURC";
const ARC_TOKEN_ADDRESSES: Record<PaymentToken, string> = { USDC: ARC_USDC_ADDRESS, EURC: ARC_EURC_ADDRESS };

function formatUsdc(amount: string): string {
    return `${(Number(amount) / 1_000_000).toFixed(2)} USDC`;
}

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/** Minimal client-side router — just two routes, no need for a routing library. */
function useRoute(): [string, (path: string) => void] {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const onPopState = () => setPath(window.location.pathname);
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const navigate = (to: string) => {
        window.history.pushState({}, "", to);
        setPath(to);
    };

    return [path, navigate];
}

function NavLink({ to, path, navigate, children }: { to: string; path: string; navigate: (p: string) => void; children: ReactNode }) {
    const active = path === to;
    return (
        <a
            href={to}
            className={`nav-link ${active ? "nav-link-active" : ""}`}
            onClick={(e) => {
                e.preventDefault();
                navigate(to);
            }}
        >
            {children}
        </a>
    );
}

function NavBar({
    path,
    navigate,
    me,
    onLogout,
    onToggleAgent,
}: {
    path: string;
    navigate: (p: string) => void;
    me: Me;
    onLogout: () => void;
    onToggleAgent: () => void;
}) {
    const account = useActiveAccount();
    const [arcName, setArcName] = useState<string | null>(null);

    useEffect(() => {
        setArcName(null);
        if (!account) return;
        let cancelled = false;
        resolveArcNsReverse(account.address).then((name) => {
            if (!cancelled) setArcName(name);
        });
        return () => {
            cancelled = true;
        };
    }, [account]);

    return (
        <header className="topbar">
            <div className="nav">
                <a
                    href="/"
                    className="brand"
                    onClick={(e) => {
                        e.preventDefault();
                        navigate("/");
                    }}
                >
                    margit
                </a>
                <NavLink to="/profile" path={path} navigate={navigate}>
                    My Repos
                </NavLink>
                <NavLink to="/catalog" path={path} navigate={navigate}>
                    Catalog
                </NavLink>
            </div>
            <div className="nav-right">
                <button type="button" className="btn btn-outline nav-agent-btn" onClick={onToggleAgent}>
                    <RobotIcon /> Agent
                </button>
                {me.authenticated && <ProfileDropdown me={me} onLogout={onLogout} />}
                <ConnectButton
                    client={thirdwebClient}
                    wallets={thirdwebWallets}
                    chain={arcTestnet}
                    appMetadata={thirdwebAppMetadata}
                    theme={thirdwebTheme}
                    connectButton={{ label: "Connect Wallet", className: "nav-connect-btn" }}
                    detailsButton={{
                        displayBalanceToken: { [arcTestnet.id]: ARC_USDC_ADDRESS },
                        className: "nav-connect-btn",
                        connectedAccountName: account
                            ? (arcName ?? shortenAddress(account.address))
                            : undefined,
                    }}
                />
            </div>
        </header>
    );
}

function ProfileDropdown({ me, onLogout }: { me: Me; onLogout: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const revoke = async () => {
        if (
            !confirm(
                "This revokes margit's GitHub access entirely — you'll need to re-approve on next sign-in. Continue?",
            )
        ) {
            return;
        }
        try {
            await revokeGithubAccess();
        } catch {
            // Session is destroyed server-side either way; fall through to local logout.
        }
        setOpen(false);
        onLogout();
    };

    return (
        <div className="profile-dropdown" ref={ref}>
            <button type="button" className="profile-trigger" onClick={() => setOpen((v) => !v)}>
                {me.avatarUrl && <img src={me.avatarUrl} alt="" className="avatar" />}
                <span>{me.name ?? me.login}</span>
            </button>
            {open && (
                <div className="profile-menu">
                    <div className="profile-menu-header">
                        <p className="hint">Signed in as</p>
                        <p>{me.login}</p>
                    </div>
                    <a
                        href={`https://github.com/${me.login}`}
                        target="_blank"
                        rel="noreferrer"
                        className="profile-menu-item github-icon-link"
                    >
                        <GitHubIcon /> GitHub profile
                    </a>
                    <button
                        type="button"
                        className="profile-menu-item"
                        onClick={() => {
                            setOpen(false);
                            onLogout();
                        }}
                    >
                        <LogoutIcon /> Log out
                    </button>
                    <button type="button" className="profile-menu-item profile-menu-danger btn-icon" onClick={revoke}>
                        <TrashIcon /> Revoke GitHub access
                    </button>
                </div>
            )}
        </div>
    );
}

const MAX_SCREENSHOTS = 4;

function ListingModal({
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

function RepoGroup({
    label,
    repos,
    children,
}: {
    label: string;
    repos: Repo[];
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
                ) : (
                    <ul className="repo-list">{repos.map(children)}</ul>
                ))}
        </div>
    );
}

function ListingPanel({
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
    const unlockUrl = `${window.location.origin}/api/listings/unlock?id=${listing.id}`;

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
                <code>{listing.payoutAddress}</code>
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
                    onClick={() => navigate(`/repo/${listing.repoFullName}`)}
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

function RepoRow({
    repo,
    listing,
    onListed,
    onUnlisted,
    onMadePrivate,
    navigate,
}: {
    repo: Repo;
    listing: Listing | undefined;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
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
        <li className="repo-card">
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

function WelcomePage({ me, navigate }: { me: Me; navigate: (p: string) => void }) {
    return (
        <div className="welcome">
            <h1>margit</h1>
            <p className="welcome-tagline">
                Sell access to your private GitHub repos. Get paid in USDC on Arc — buyers, human or AI agent, pay
                once and get an authenticated clone URL.
            </p>

            <div className="welcome-actions">
                {me.authenticated ? (
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/profile")}>
                        Go to My Repos
                    </button>
                ) : (
                    <a className="btn btn-primary" href={githubLoginUrl()}>
                        Connect with GitHub
                    </a>
                )}
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate("/catalog")}
                >
                    Browse Catalog
                </button>
            </div>

            <div className="welcome-steps">
                <div className="welcome-step">
                    <span className="welcome-step-num">1</span>
                    <div>
                        <strong>Connect GitHub</strong>
                        <p className="hint">Sign in to see your repos — nothing is listed automatically.</p>
                    </div>
                </div>
                <div className="welcome-step">
                    <span className="welcome-step-num">2</span>
                    <div>
                        <strong>List a private repo</strong>
                        <p className="hint">Set a price and your Arc payout address (0x, ENS, or ArcNS name).</p>
                    </div>
                </div>
                <div className="welcome-step">
                    <span className="welcome-step-num">3</span>
                    <div>
                        <strong>Get paid, agents included</strong>
                        <p className="hint">
                            A real x402 paywall on Arc testnet — any AI agent can discover, pay, and clone
                            autonomously.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DashboardPage({
    me,
    repos,
    reposError,
    listingByRepo,
    onListed,
    onUnlisted,
    onMadePrivate,
    navigate,
}: {
    me: Me;
    repos: Repo[] | null;
    reposError: string | null;
    listingByRepo: Map<string, Listing>;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
}) {
    const [filter, setFilter] = useState("");

    const filteredRepos = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return repos ?? [];
        return (repos ?? []).filter((r) => r.name.toLowerCase().includes(q));
    }, [repos, filter]);

    const personalRepos = useMemo(() => filteredRepos.filter((r) => !r.isOrgOwned), [filteredRepos]);
    const privateRepos = useMemo(() => personalRepos.filter((r) => r.private), [personalRepos]);
    const publicRepos = useMemo(() => personalRepos.filter((r) => !r.private), [personalRepos]);

    const orgGroups = useMemo(() => {
        const map = new Map<string, Repo[]>();
        for (const repo of filteredRepos) {
            if (!repo.isOrgOwned) continue;
            const group = map.get(repo.ownerLogin) ?? [];
            group.push(repo);
            map.set(repo.ownerLogin, group);
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [filteredRepos]);

    if (!me.authenticated) {
        return <WelcomePage me={me} navigate={navigate} />;
    }

    const renderRow = (repo: Repo) => (
        <RepoRow
            key={repo.id}
            repo={repo}
            listing={listingByRepo.get(repo.fullName)}
            onListed={onListed}
            onUnlisted={onUnlisted}
            onMadePrivate={onMadePrivate}
            navigate={navigate}
        />
    );

    return (
        <section>
            <h2>Your repositories</h2>
            {reposError && <p className="error">{reposError}</p>}
            {repos === null && !reposError && <p className="hint">Loading repositories…</p>}

            {repos && (
                <>
                    <input
                        className="input filter-input"
                        placeholder="Filter by name…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />

                    <RepoGroup label="Private" repos={privateRepos}>
                        {renderRow}
                    </RepoGroup>

                    <RepoGroup label="Public" repos={publicRepos}>
                        {renderRow}
                    </RepoGroup>

                    {orgGroups.map(([org, orgRepos]) => (
                        <RepoGroup key={org} label={org} repos={orgRepos}>
                            {renderRow}
                        </RepoGroup>
                    ))}
                </>
            )}
        </section>
    );
}

function unlockDetailsNode(result: UnlockRequirement | string | "loading" | undefined): ReactNode {
    if (!result || result === "loading") return null;
    return (
        <div className="unlock-details">
            {typeof result === "string" ? (
                <span className="error">{result}</span>
            ) : (
                <span>
                    Real x402 challenge: pay {formatUsdc(result.amount)} to <code>{result.payTo}</code> on{" "}
                    <code>{result.network}</code>. Wallet payment isn't wired up yet — this previews the actual
                    on-chain requirements.
                </span>
            )}
        </div>
    );
}

function GitHubIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}

function EyeIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

function CopyIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

/** Shown after a successful purchase — the clone URL plus copy/download shortcuts. */
function CloneResult({ cloneUrl, repoFullName }: { cloneUrl: string; repoFullName: string }) {
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const repoName = repoFullName.split("/")[1] ?? repoFullName;

    const copyCommand = async () => {
        await navigator.clipboard.writeText(`git clone ${cloneUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const download = async () => {
        setDownloadError(null);
        setDownloading(true);
        try {
            await downloadZip(cloneUrl, repoName);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="buy-result">
            <p className="hint">Purchased — clone URL:</p>
            <code>{cloneUrl}</code>
            <div className="clone-actions">
                <button type="button" className="btn btn-primary btn-small" disabled={downloading} onClick={download}>
                    <DownloadIcon /> {downloading ? "Downloading…" : "Download ZIP"}
                </button>
                <button type="button" className="btn btn-outline btn-small" onClick={copyCommand}>
                    <CopyIcon /> {copied ? "Copied!" : "Copy Command"}
                </button>
            </div>
            {downloadError && <p className="error">{downloadError}</p>}
        </div>
    );
}

function RobotIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <circle cx="8" cy="16" r="0.5" fill="currentColor" />
            <circle cx="16" cy="16" r="0.5" fill="currentColor" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

interface AgentMessage {
    role: "user" | "assistant";
    text: string;
    purchase?: AgentPurchase;
}

function AgentSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [wallet, setWallet] = useState<AgentWallet | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        fetchAgentWallet()
            .then(setWallet)
            .catch(() => setWallet({ error: "Could not load agent wallet" }));
    }, [open]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, sending]);

    const send = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setInput("");
        setError(null);
        setMessages((prev) => [...prev, { role: "user", text }]);
        setSending(true);
        try {
            const res = await sendAgentMessage(text);
            setMessages((prev) => [...prev, { role: "assistant", text: res.reply, purchase: res.purchase }]);
            if (res.purchase) {
                fetchAgentWallet()
                    .then(setWallet)
                    .catch(() => undefined);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "The agent didn't respond");
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <div className={`agent-scrim ${open ? "open" : ""}`} onClick={onClose} />
            <aside className={`agent-sidebar ${open ? "open" : ""}`}>
                <div className="agent-header">
                    <div>
                        <h3>
                            <RobotIcon /> margit agent
                        </h3>
                        {wallet?.address ? (
                            <p className="hint">
                                {shortenAddress(wallet.address)} · {Number(wallet.usdc ?? "0").toFixed(2)} USDC ·{" "}
                                {Number(wallet.eurc ?? "0").toFixed(2)} EURC
                            </p>
                        ) : wallet?.error ? (
                            <p className="hint">{wallet.error}</p>
                        ) : (
                            <p className="hint">Loading wallet…</p>
                        )}
                    </div>
                    <button type="button" className="btn-icon-plain" onClick={onClose} aria-label="Close agent">
                        <CloseIcon />
                    </button>
                </div>
                <div className="agent-messages" ref={scrollRef}>
                    {messages.length === 0 && (
                        <p className="hint agent-empty">
                            Ask me to find a repo, or tell me to buy one — I have my own funded wallet and can pay
                            for it directly.
                        </p>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`agent-message agent-message-${m.role}`}>
                            <p>{m.text}</p>
                            {m.purchase && (
                                <CloneResult cloneUrl={m.purchase.cloneUrl} repoFullName={m.purchase.repoFullName} />
                            )}
                        </div>
                    ))}
                    {sending && <p className="hint agent-typing">Thinking…</p>}
                </div>
                {error && <p className="error agent-error">{error}</p>}
                <form
                    className="agent-input-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                >
                    <input
                        type="text"
                        className="input"
                        placeholder="Ask the agent to find or buy a repo…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={sending}
                    />
                    <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                        Send
                    </button>
                </form>
            </aside>
        </>
    );
}

function PublisherLink({ login, navigate }: { login: string; navigate: (p: string) => void }) {
    return (
        <a
            href={`/publisher/${login}`}
            className="publisher-link"
            onClick={(e) => {
                e.preventDefault();
                navigate(`/publisher/${login}`);
            }}
        >
            {login}
        </a>
    );
}

function useUnlockPreview() {
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

function ViewToggle({ view, setView }: { view: "cards" | "list"; setView: (v: "cards" | "list") => void }) {
    return (
        <div className="view-toggle">
            <button
                type="button"
                className={`view-toggle-btn ${view === "cards" ? "view-toggle-btn-active" : ""}`}
                onClick={() => setView("cards")}
            >
                Cards
            </button>
            <button
                type="button"
                className={`view-toggle-btn ${view === "list" ? "view-toggle-btn-active" : ""}`}
                onClick={() => setView("list")}
            >
                List
            </button>
        </div>
    );
}

function ListingGrid({
    listings,
    view,
    navigate,
    unlockResults,
    onPreview,
    showOwner = true,
}: {
    listings: Listing[];
    view: "cards" | "list";
    navigate: (p: string) => void;
    unlockResults: Record<string, UnlockRequirement | string | "loading">;
    onPreview: (id: string) => void;
    showOwner?: boolean;
}) {
    if (view === "list") {
        return (
            <ul className="repo-list">
                {listings.map((listing) => (
                    <li key={listing.id} className="repo-card">
                        <div className="repo-row">
                            <a
                                className="repo-name"
                                href={`/repo/${listing.repoFullName}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    navigate(`/repo/${listing.repoFullName}`);
                                }}
                            >
                                {listing.repoFullName}
                            </a>
                            {showOwner && (
                                <span className="tag tag-muted">
                                    by <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                                </span>
                            )}
                            {listing.language && <span className="tag">{listing.language}</span>}
                            <span className="badge badge-listed">{listing.price}</span>
                            <button
                                type="button"
                                className="btn btn-outline"
                                disabled={unlockResults[listing.id] === "loading"}
                                onClick={() => onPreview(listing.id)}
                            >
                                {unlockResults[listing.id] === "loading" ? "Checking…" : "Unlock"}
                            </button>
                        </div>
                        {unlockDetailsNode(unlockResults[listing.id])}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="catalog-grid">
            {listings.map((listing) => (
                <div key={listing.id} className="listing-card">
                    {showOwner && (
                        <div className="listing-card-owner">
                            <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                            <a
                                href={`https://github.com/${listing.ownerLogin}`}
                                target="_blank"
                                rel="noreferrer"
                                className="github-icon-link"
                                title="GitHub profile"
                            >
                                <GitHubIcon />
                            </a>
                        </div>
                    )}
                    <a
                        className="listing-card-title"
                        href={`/repo/${listing.repoFullName}`}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(`/repo/${listing.repoFullName}`);
                        }}
                    >
                        {listing.repoFullName.split("/")[1]}
                    </a>
                    <p className="listing-card-desc">
                        {listing.sellerDescription ?? listing.description ?? "No description"}
                    </p>
                    <div className="listing-card-tags">
                        {listing.language && <span className="tag">{listing.language}</span>}
                        {listing.stargazersCount > 0 && (
                            <span className="tag tag-muted">★ {listing.stargazersCount}</span>
                        )}
                    </div>
                    <div className="listing-card-footer">
                        <span className="listing-card-price">{listing.price}</span>
                        <button
                            type="button"
                            className="btn btn-outline"
                            disabled={unlockResults[listing.id] === "loading"}
                            onClick={() => onPreview(listing.id)}
                        >
                            {unlockResults[listing.id] === "loading" ? "Checking…" : "Unlock"}
                        </button>
                    </div>
                    {unlockDetailsNode(unlockResults[listing.id])}
                </div>
            ))}
        </div>
    );
}

function CatalogPage({
    listings,
    listingsError,
    navigate,
}: {
    listings: Listing[] | null;
    listingsError: string | null;
    navigate: (p: string) => void;
}) {
    const [unlockResults, previewUnlock] = useUnlockPreview();
    const [view, setView] = useState<"cards" | "list">("cards");

    return (
        <section>
            <div className="catalog-header">
                <div>
                    <h2>Catalog</h2>
                    <p className="hint">
                        Repos for sale, paid in USDC on Arc testnet. Anyone — human or agent — can unlock.
                    </p>
                </div>
                {listings && listings.length > 0 && <ViewToggle view={view} setView={setView} />}
            </div>

            {listingsError && <p className="error">{listingsError}</p>}
            {listings === null && !listingsError && <p className="hint">Loading catalog…</p>}
            {listings && listings.length === 0 && <p className="hint">No listings yet.</p>}

            {listings && listings.length > 0 && (
                <ListingGrid
                    listings={listings}
                    view={view}
                    navigate={navigate}
                    unlockResults={unlockResults}
                    onPreview={previewUnlock}
                />
            )}
        </section>
    );
}

function StarRating({ average, count }: { average: number; count: number }) {
    const rounded = Math.round(average);
    return (
        <span className="star-rating" title={count > 0 ? `${average.toFixed(1)} / 5 from ${count} review${count !== 1 ? "s" : ""}` : "No reviews yet"}>
            {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < rounded ? "star star-filled" : "star"}>
                    ★
                </span>
            ))}
            <span className="star-rating-count">{count > 0 ? `${average.toFixed(1)} (${count})` : "No reviews yet"}</span>
        </span>
    );
}

/**
 * Placeholder — no backend yet. Reviews will be gated on a verified purchase
 * (a receipt issued on successful unlock, so both humans and agents can
 * review without needing a margit/GitHub account), rating + comment, with a
 * best-effort self-declared "agent" flag until something like ERC-8004
 * provides real verification.
 */
function ReviewsSection({ subject }: { subject: string }) {
    return (
        <div className="reviews-section">
            <div className="reviews-header">
                <h3>Reviews</h3>
                <StarRating average={0} count={0} />
            </div>
            <p className="hint">No reviews yet for {subject}.</p>
            <div className="reviews-cta">
                <button type="button" className="btn btn-outline" disabled>
                    Leave a review
                </button>
                <span className="hint">Only buyers who've unlocked can review — not wired up yet.</span>
            </div>
        </div>
    );
}

function PublisherPage({
    login,
    listings,
    navigate,
}: {
    login: string;
    listings: Listing[] | null;
    navigate: (p: string) => void;
}) {
    const [unlockResults, previewUnlock] = useUnlockPreview();
    const [view, setView] = useState<"cards" | "list">("cards");

    const authorListings = useMemo(
        () => (listings ?? []).filter((l) => l.ownerLogin.toLowerCase() === login.toLowerCase()),
        [listings, login],
    );

    return (
        <section>
            <button type="button" className="btn btn-ghost back-link" onClick={() => navigate("/catalog")}>
                ← Back to catalog
            </button>
            <div className="catalog-header">
                <div>
                    <h2>{login}</h2>
                    <p className="hint">
                        <a
                            href={`https://github.com/${login}`}
                            target="_blank"
                            rel="noreferrer"
                            className="github-icon-link publisher-github-link"
                        >
                            <GitHubIcon /> Profile
                        </a>
                    </p>
                    <p className="hint">
                        {authorListings.length} listing{authorListings.length !== 1 ? "s" : ""} for sale.
                    </p>
                    <StarRating average={0} count={0} />
                </div>
                {authorListings.length > 0 && <ViewToggle view={view} setView={setView} />}
            </div>
            {listings === null ? (
                <p className="hint">Loading…</p>
            ) : authorListings.length === 0 ? (
                <p className="hint">No listings from {login}.</p>
            ) : (
                <ListingGrid
                    listings={authorListings}
                    view={view}
                    navigate={navigate}
                    unlockResults={unlockResults}
                    onPreview={previewUnlock}
                    showOwner={false}
                />
            )}
            <ReviewsSection subject={login} />
        </section>
    );
}

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

function RepoDetailPage({
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

function App() {
    const [path, navigate] = useRoute();
    const [me, setMe] = useState<Me | null>(null);
    const [repos, setRepos] = useState<Repo[] | null>(null);
    const [reposError, setReposError] = useState<string | null>(null);
    const [listings, setListings] = useState<Listing[] | null>(null);
    const [listingsError, setListingsError] = useState<string | null>(null);
    const [agentOpen, setAgentOpen] = useState(false);

    useEffect(() => {
        fetchMe().then(setMe);
    }, []);

    useEffect(() => {
        if (!me?.authenticated) return;
        fetchRepos()
            .then(setRepos)
            .catch(() => setReposError("Could not load repositories."));
    }, [me]);

    useEffect(() => {
        fetchListings()
            .then(setListings)
            .catch(() => setListingsError("Could not load the catalog."));
    }, []);

    const listingByRepo = useMemo(() => {
        const map = new Map<string, Listing>();
        for (const listing of listings ?? []) map.set(listing.repoFullName, listing);
        return map;
    }, [listings]);

    if (me === null) {
        return (
            <main className="shell">
                <p className="hint">Loading…</p>
            </main>
        );
    }

    const publisherMatch = path.match(/^\/publisher\/([^/]+)$/);
    const repoMatch = path.match(/^\/repo\/([^/]+)\/([^/]+)$/);

    return (
        <main className="shell">
            <NavBar
                path={path}
                navigate={navigate}
                me={me}
                onLogout={() => logout().then(() => setMe({ authenticated: false }))}
                onToggleAgent={() => setAgentOpen((v) => !v)}
            />
            <AgentSidebar open={agentOpen} onClose={() => setAgentOpen(false)} />
            {repoMatch ? (
                <RepoDetailPage owner={repoMatch[1]} name={repoMatch[2]} listings={listings} navigate={navigate} />
            ) : publisherMatch ? (
                <PublisherPage login={publisherMatch[1]} listings={listings} navigate={navigate} />
            ) : path === "/catalog" ? (
                <CatalogPage listings={listings} listingsError={listingsError} navigate={navigate} />
            ) : path === "/profile" ? (
                <DashboardPage
                    me={me}
                    repos={repos}
                    reposError={reposError}
                    listingByRepo={listingByRepo}
                    navigate={navigate}
                    onListed={(listing) => setListings((prev) => [...(prev ?? []), listing])}
                    onUnlisted={(id) => setListings((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                    onMadePrivate={(repoId) =>
                        setRepos((prev) => prev?.map((r) => (r.id === repoId ? { ...r, private: true } : r)) ?? null)
                    }
                />
            ) : (
                <WelcomePage me={me} navigate={navigate} />
            )}
        </main>
    );
}

export default App;
