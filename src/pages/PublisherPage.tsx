import { useMemo, useState } from "react";
import type { Listing } from "../api";
import { useUnlockPreview } from "../hooks/useUnlockPreview";
import { GitHubIcon } from "../components/icons";
import { ListingGrid, ViewToggle } from "../components/ListingCard";
import { StarRating } from "../components/StarRating";
import { ReviewsSection } from "../components/ReviewsSection";

export function PublisherPage({
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
