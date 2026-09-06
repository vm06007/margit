import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    createListing,
    deleteListing,
    fetchListings,
    fetchMe,
    fetchRepos,
    fetchUnlockRequirements,
    githubLoginUrl,
    logout,
    makeRepoPrivate,
    resolveName,
    type Listing,
    type Me,
    type Repo,
    type UnlockRequirement,
} from "./api";
import "./App.css";

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
}: {
    path: string;
    navigate: (p: string) => void;
    me: Me;
    onLogout: () => void;
}) {
    return (
        <header className="topbar">
            <div className="nav">
                <span className="brand">margit</span>
                <NavLink to="/" path={path} navigate={navigate}>
                    My Repos
                </NavLink>
                <NavLink to="/catalog" path={path} navigate={navigate}>
                    Catalog
                </NavLink>
            </div>
            {me.authenticated && (
                <div className="user">
                    {me.avatarUrl && <img src={me.avatarUrl} alt="" className="avatar" />}
                    <span>{me.name ?? me.login}</span>
                    <button type="button" className="btn btn-ghost" onClick={onLogout}>
                        Log out
                    </button>
                </div>
            )}
        </header>
    );
}

function ListingForm({
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

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const listing = await createListing({ repoFullName, price, payoutAddress });
            onCreated(listing);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create listing");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="listing-form">
            <div className="listing-form-fields">
                <input
                    className="input"
                    placeholder="$0.05"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                />
                <input
                    className="input input-address"
                    placeholder="0x… address, name.eth, or name.arc"
                    value={payoutAddress}
                    onChange={(e) => setPayoutAddress(e.target.value)}
                />
                <button
                    type="button"
                    className="btn btn-primary"
                    disabled={submitting || resolved === "loading"}
                    onClick={submit}
                >
                    {submitting ? "Listing…" : "Confirm"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    Cancel
                </button>
            </div>
            {resolved === "loading" && <p className="hint">Resolving…</p>}
            {resolved === "error" && <p className="error">Could not resolve that name.</p>}
            {resolved && resolved !== "loading" && resolved !== "error" && (
                <p className="hint">
                    → <code>{resolved}</code>
                </p>
            )}
            {error && <p className="error">{error}</p>}
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

function ListingPanel({ listing, onUnlisted }: { listing: Listing; onUnlisted: (id: string) => void }) {
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
                <a
                    className="btn btn-outline"
                    href={`https://github.com/${listing.repoFullName}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Open repo ↗
                </a>
                <button type="button" className="btn btn-ghost" disabled={unlisting} onClick={unlist}>
                    {unlisting ? "Unlisting…" : "Unlist"}
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
}: {
    repo: Repo;
    listing: Listing | undefined;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
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
            <div className="repo-row">
                <a className="repo-name" href={repo.htmlUrl} target="_blank" rel="noreferrer">
                    {repo.name}
                </a>
                {repo.private && <span className="tag tag-muted">private</span>}
                {repo.language && <span className="tag">{repo.language}</span>}
                <span className="tag tag-muted">★ {repo.stargazersCount}</span>

                {listing ? (
                    <button
                        type="button"
                        className="badge badge-listed badge-button"
                        onClick={() => setManageOpen((v) => !v)}
                    >
                        listed @ {listing.price} {manageOpen ? "▴" : "▾"}
                    </button>
                ) : repo.isOrgOwned ? null : repo.private ? (
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
                <ListingForm
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
                    onUnlisted={(id) => {
                        setManageOpen(false);
                        onUnlisted(id);
                    }}
                />
            )}
        </li>
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
}: {
    me: Me;
    repos: Repo[] | null;
    reposError: string | null;
    listingByRepo: Map<string, Listing>;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
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
        return (
            <div className="card">
                <h1>margit</h1>
                <p className="hint">Connect your GitHub account to list a repo for sale.</p>
                <a className="btn btn-primary" href={githubLoginUrl()}>
                    Connect with GitHub
                </a>
            </div>
        );
    }

    const renderRow = (repo: Repo) => (
        <RepoRow
            key={repo.id}
            repo={repo}
            listing={listingByRepo.get(repo.fullName)}
            onListed={onListed}
            onUnlisted={onUnlisted}
            onMadePrivate={onMadePrivate}
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

function CatalogPage({
    listings,
    listingsError,
    navigate,
}: {
    listings: Listing[] | null;
    listingsError: string | null;
    navigate: (p: string) => void;
}) {
    const [unlockResults, setUnlockResults] = useState<Record<string, UnlockRequirement | string | "loading">>({});
    const [view, setView] = useState<"cards" | "list">("cards");

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

    return (
        <section>
            <div className="catalog-header">
                <div>
                    <h2>Catalog</h2>
                    <p className="hint">
                        Repos for sale, paid in USDC on Arc testnet. Anyone — human or agent — can unlock.
                    </p>
                </div>
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
            </div>

            {listingsError && <p className="error">{listingsError}</p>}
            {listings === null && !listingsError && <p className="hint">Loading catalog…</p>}
            {listings && listings.length === 0 && <p className="hint">No listings yet.</p>}

            {listings && listings.length > 0 && view === "cards" && (
                <div className="catalog-grid">
                    {listings.map((listing) => (
                        <div key={listing.id} className="listing-card">
                            <div className="listing-card-owner">
                                <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                                <a
                                    href={`https://github.com/${listing.ownerLogin}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="tag tag-muted"
                                >
                                    GitHub ↗
                                </a>
                            </div>
                            <a
                                className="listing-card-title"
                                href={`https://github.com/${listing.repoFullName}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {listing.repoFullName.split("/")[1]}
                            </a>
                            <p className="listing-card-desc">{listing.description ?? "No description"}</p>
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
                                    onClick={() => previewUnlock(listing.id)}
                                >
                                    {unlockResults[listing.id] === "loading" ? "Checking…" : "Unlock"}
                                </button>
                            </div>
                            {unlockDetailsNode(unlockResults[listing.id])}
                        </div>
                    ))}
                </div>
            )}

            {listings && listings.length > 0 && view === "list" && (
                <ul className="repo-list">
                    {listings.map((listing) => (
                        <li key={listing.id} className="repo-card">
                            <div className="repo-row">
                                <a
                                    className="repo-name"
                                    href={`https://github.com/${listing.repoFullName}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {listing.repoFullName}
                                </a>
                                <span className="tag tag-muted">
                                    by <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                                </span>
                                <span className="badge badge-listed">{listing.price}</span>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    disabled={unlockResults[listing.id] === "loading"}
                                    onClick={() => previewUnlock(listing.id)}
                                >
                                    {unlockResults[listing.id] === "loading" ? "Checking…" : "Unlock"}
                                </button>
                            </div>
                            {unlockDetailsNode(unlockResults[listing.id])}
                        </li>
                    ))}
                </ul>
            )}
        </section>
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
    const authorListings = useMemo(
        () => (listings ?? []).filter((l) => l.ownerLogin.toLowerCase() === login.toLowerCase()),
        [listings, login],
    );

    return (
        <section>
            <button type="button" className="btn btn-ghost back-link" onClick={() => navigate("/catalog")}>
                ← Back to catalog
            </button>
            <h2>{login}</h2>
            <p className="hint">
                <a href={`https://github.com/${login}`} target="_blank" rel="noreferrer">
                    GitHub profile ↗
                </a>
            </p>
            <p className="hint">
                Ratings & reviews aren't built yet — worth doing properly on ERC-8004's Reputation Registry rather
                than a bespoke system. {authorListings.length} listing{authorListings.length !== 1 ? "s" : ""} for
                sale.
            </p>
            {listings === null ? (
                <p className="hint">Loading…</p>
            ) : authorListings.length === 0 ? (
                <p className="hint">No listings from {login}.</p>
            ) : (
                <ul className="repo-list">
                    {authorListings.map((listing) => (
                        <li key={listing.id} className="repo-card">
                            <div className="repo-row">
                                <a
                                    className="repo-name"
                                    href={`https://github.com/${listing.repoFullName}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {listing.repoFullName}
                                </a>
                                {listing.language && <span className="tag">{listing.language}</span>}
                                <span className="badge badge-listed">{listing.price}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
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

    return (
        <main className="shell">
            <NavBar
                path={path}
                navigate={navigate}
                me={me}
                onLogout={() => logout().then(() => setMe({ authenticated: false }))}
            />
            {publisherMatch ? (
                <PublisherPage login={publisherMatch[1]} listings={listings} navigate={navigate} />
            ) : path === "/catalog" ? (
                <CatalogPage listings={listings} listingsError={listingsError} navigate={navigate} />
            ) : (
                <DashboardPage
                    me={me}
                    repos={repos}
                    reposError={reposError}
                    listingByRepo={listingByRepo}
                    onListed={(listing) => setListings((prev) => [...(prev ?? []), listing])}
                    onUnlisted={(id) => setListings((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                    onMadePrivate={(repoId) =>
                        setRepos((prev) => prev?.map((r) => (r.id === repoId ? { ...r, private: true } : r)) ?? null)
                    }
                />
            )}
        </main>
    );
}

export default App;
