import { useEffect, useMemo, useState } from "react";
import {
    createListing,
    fetchListings,
    fetchMe,
    fetchRepos,
    fetchUnlockRequirements,
    githubLoginUrl,
    logout,
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
        <li className="listing-form-row">
            <input
                className="listing-input"
                placeholder="$0.05"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
            />
            <input
                className="listing-input listing-input-address"
                placeholder="0x… your Arc payout address"
                value={payoutAddress}
                onChange={(e) => setPayoutAddress(e.target.value)}
            />
            <button type="button" className="btn-list" disabled={submitting} onClick={submit}>
                {submitting ? "Listing…" : "Confirm"}
            </button>
            <button type="button" className="btn-logout" onClick={onCancel}>
                Cancel
            </button>
            {error && <span className="error">{error}</span>}
        </li>
    );
}

function App() {
    const [me, setMe] = useState<Me | null>(null);
    const [repos, setRepos] = useState<Repo[] | null>(null);
    const [reposError, setReposError] = useState<string | null>(null);
    const [listings, setListings] = useState<Listing[] | null>(null);
    const [listingsError, setListingsError] = useState<string | null>(null);
    const [openFormFor, setOpenFormFor] = useState<string | null>(null);
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

    const reloadListings = () => {
        fetchListings()
            .then(setListings)
            .catch(() => setListingsError("Could not load the catalog."));
    };

    useEffect(() => {
        reloadListings();
    }, []);

    const listingByRepo = useMemo(() => {
        const map = new Map<string, Listing>();
        for (const listing of listings ?? []) map.set(listing.repoFullName, listing);
        return map;
    }, [listings]);

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
                <p>Loading…</p>
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
                            className="btn-logout"
                            onClick={() => logout().then(() => setMe({ authenticated: false }))}
                        >
                            Log out
                        </button>
                    </header>

                    <section>
                        <h2>Your repositories</h2>
                        {reposError && <p className="error">{reposError}</p>}
                        {repos === null && !reposError && <p>Loading repositories…</p>}
                        {repos && (
                            <ul className="repo-list">
                                {repos.map((repo) => {
                                    const existing = listingByRepo.get(repo.fullName);
                                    return (
                                        <li key={repo.id} className="repo-row">
                                            <a href={repo.htmlUrl} target="_blank" rel="noreferrer">
                                                {repo.fullName}
                                            </a>
                                            {repo.private && <span className="badge">private</span>}
                                            {repo.language && <span className="lang">{repo.language}</span>}
                                            <span className="stars">★ {repo.stargazersCount}</span>
                                            {existing ? (
                                                <span className="badge badge-listed">listed @ {existing.price}</span>
                                            ) : openFormFor === repo.fullName ? null : (
                                                <button
                                                    type="button"
                                                    className="btn-list"
                                                    onClick={() => setOpenFormFor(repo.fullName)}
                                                >
                                                    List for sale
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {repos?.map(
                            (repo) =>
                                openFormFor === repo.fullName && (
                                    <ul className="repo-list" key={`form-${repo.id}`}>
                                        <ListingForm
                                            repoFullName={repo.fullName}
                                            onCancel={() => setOpenFormFor(null)}
                                            onCreated={(listing) => {
                                                setOpenFormFor(null);
                                                setListings((prev) => [...(prev ?? []), listing]);
                                            }}
                                        />
                                    </ul>
                                ),
                        )}
                    </section>
                </>
            ) : (
                <div className="card">
                    <h1>margit</h1>
                    <p>Connect your GitHub account to list a repo for sale.</p>
                    <a className="btn-github" href={githubLoginUrl()}>
                        Connect with GitHub
                    </a>
                </div>
            )}

            <section>
                <h2>Catalog</h2>
                <p className="hint">Repos for sale, paid in USDC on Arc testnet. Anyone — human or agent — can unlock.</p>
                {listingsError && <p className="error">{listingsError}</p>}
                {listings === null && !listingsError && <p>Loading catalog…</p>}
                {listings && listings.length === 0 && <p className="hint">No listings yet.</p>}
                {listings && listings.length > 0 && (
                    <ul className="repo-list">
                        {listings.map((listing) => {
                            const result = unlockResults[listing.id];
                            return (
                                <li key={listing.id} className="repo-row-wrap">
                                    <div className="repo-row">
                                        <span>{listing.repoFullName}</span>
                                        <span className="badge badge-listed">{listing.price}</span>
                                        <span className="lang">by {listing.ownerLogin}</span>
                                        <button
                                            type="button"
                                            className="btn-list"
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
