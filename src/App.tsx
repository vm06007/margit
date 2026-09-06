import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
    createListing,
    fetchListings,
    fetchMe,
    fetchRepos,
    fetchUnlockRequirements,
    githubLoginUrl,
    logout,
    makeRepoPrivate,
    type Listing,
    type Me,
    type Repo,
    type UnlockRequirement,
} from "./api";
import "./App.css";

function formatUsdc(amount: string): string {
    return `${(Number(amount) / 1_000_000).toFixed(2)} USDC`;
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
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

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
                    placeholder="0x… your Arc payout address"
                    value={payoutAddress}
                    onChange={(e) => setPayoutAddress(e.target.value)}
                />
                <button type="button" className="btn btn-primary" disabled={submitting} onClick={submit}>
                    {submitting ? "Listing…" : "Confirm"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCancel}>
                    Cancel
                </button>
            </div>
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

function RepoRow({
    repo,
    listing,
    onListed,
    onMadePrivate,
}: {
    repo: Repo;
    listing: Listing | undefined;
    onListed: (listing: Listing) => void;
    onMadePrivate: (repoId: number) => void;
}) {
    const [formOpen, setFormOpen] = useState(false);
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
                {repo.language && <span className="tag">{repo.language}</span>}
                <span className="tag tag-muted">★ {repo.stargazersCount}</span>

                {listing ? (
                    <span className="badge badge-listed">listed @ {listing.price}</span>
                ) : repo.private ? (
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
        </li>
    );
}

function App() {
    const [me, setMe] = useState<Me | null>(null);
    const [repos, setRepos] = useState<Repo[] | null>(null);
    const [reposError, setReposError] = useState<string | null>(null);
    const [listings, setListings] = useState<Listing[] | null>(null);
    const [listingsError, setListingsError] = useState<string | null>(null);
    const [unlockResults, setUnlockResults] = useState<Record<string, UnlockRequirement | string | "loading">>({});

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

    const privateRepos = useMemo(() => repos?.filter((r) => r.private) ?? [], [repos]);
    const publicRepos = useMemo(() => repos?.filter((r) => !r.private) ?? [], [repos]);

    const setRepoPrivate = (repoId: number) => {
        setRepos((prev) => prev?.map((r) => (r.id === repoId ? { ...r, private: true } : r)) ?? null);
    };

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

    if (me === null) {
        return (
            <main className="shell">
                <p className="hint">Loading…</p>
            </main>
        );
    }

    return (
        <main className="shell">
            {me.authenticated ? (
                <>
                    <header className="topbar">
                        <div className="user">
                            {me.avatarUrl && <img src={me.avatarUrl} alt="" className="avatar" />}
                            <span>{me.name ?? me.login}</span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => logout().then(() => setMe({ authenticated: false }))}
                        >
                            Log out
                        </button>
                    </header>

                    <section>
                        <h2>Your repositories</h2>
                        {reposError && <p className="error">{reposError}</p>}
                        {repos === null && !reposError && <p className="hint">Loading repositories…</p>}

                        {repos && (
                            <>
                                <RepoGroup label="Private" repos={privateRepos}>
                                    {(repo) => (
                                        <RepoRow
                                            key={repo.id}
                                            repo={repo}
                                            listing={listingByRepo.get(repo.fullName)}
                                            onListed={(listing) => setListings((prev) => [...(prev ?? []), listing])}
                                            onMadePrivate={setRepoPrivate}
                                        />
                                    )}
                                </RepoGroup>

                                <RepoGroup label="Public" repos={publicRepos}>
                                    {(repo) => (
                                        <RepoRow
                                            key={repo.id}
                                            repo={repo}
                                            listing={listingByRepo.get(repo.fullName)}
                                            onListed={(listing) => setListings((prev) => [...(prev ?? []), listing])}
                                            onMadePrivate={setRepoPrivate}
                                        />
                                    )}
                                </RepoGroup>
                            </>
                        )}
                    </section>
                </>
            ) : (
                <div className="card">
                    <h1>margit</h1>
                    <p className="hint">Connect your GitHub account to list a repo for sale.</p>
                    <a className="btn btn-primary" href={githubLoginUrl()}>
                        Connect with GitHub
                    </a>
                </div>
            )}

            <section>
                <h2>Catalog</h2>
                <p className="hint">Repos for sale, paid in USDC on Arc testnet. Anyone — human or agent — can unlock.</p>
                {listingsError && <p className="error">{listingsError}</p>}
                {listings === null && !listingsError && <p className="hint">Loading catalog…</p>}
                {listings && listings.length === 0 && <p className="hint">No listings yet.</p>}
                {listings && listings.length > 0 && (
                    <ul className="repo-list">
                        {listings.map((listing) => {
                            const result = unlockResults[listing.id];
                            return (
                                <li key={listing.id} className="repo-card">
                                    <div className="repo-row">
                                        <span className="repo-name repo-name-static">{listing.repoFullName}</span>
                                        <span className="tag tag-muted">by {listing.ownerLogin}</span>
                                        <span className="badge badge-listed">{listing.price}</span>
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            disabled={result === "loading"}
                                            onClick={() => previewUnlock(listing.id)}
                                        >
                                            {result === "loading" ? "Checking…" : "Unlock"}
                                        </button>
                                    </div>
                                    {result && result !== "loading" && (
                                        <div className="unlock-details">
                                            {typeof result === "string" ? (
                                                <span className="error">{result}</span>
                                            ) : (
                                                <span>
                                                    Real x402 challenge: pay {formatUsdc(result.amount)} to{" "}
                                                    <code>{result.payTo}</code> on <code>{result.network}</code>.
                                                    Wallet payment isn't wired up yet — this previews the actual
                                                    on-chain requirements.
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </main>
    );
}

export default App;
