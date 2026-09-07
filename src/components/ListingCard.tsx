import type { MouseEvent as ReactMouseEvent } from "react";
import type { Listing, UnlockRequirement } from "../api";
import { formatListedDate, isRecentlyListed } from "../lib/format";
import { unlockDetailsNode } from "../hooks/useUnlockPreview";
import { CardMedia } from "./CardMedia";
import { GitHubIcon } from "./icons";

export function PublisherLink({ login, navigate }: { login: string; navigate: (p: string) => void }) {
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

export function ViewToggle({ view, setView }: { view: "cards" | "list"; setView: (v: "cards" | "list") => void }) {
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

export function ListingRow({
    listing,
    navigate,
    showOwner,
    unlockResults,
    onPreview,
}: {
    listing: Listing;
    navigate: (p: string) => void;
    showOwner?: boolean;
    unlockResults: Record<string, UnlockRequirement | string | "loading">;
    onPreview: (id: string) => void;
}) {
    const goToRepo = (e: ReactMouseEvent) => {
        e.preventDefault();
        navigate(`/${listing.repoFullName}`);
    };
    return (
        <article className="post-simple">
            <a className="post-simple__thumb" href={`/${listing.repoFullName}`} onClick={goToRepo}>
                <CardMedia
                    seed={listing.repoFullName}
                    screenshot={listing.screenshots[0]}
                    isNew={isRecentlyListed(listing.createdAt)}
                />
            </a>
            <div className="post-simple__content">
                <div className="post-simple__descr">
                    <div className="post-simple__meta">
                        {showOwner && (
                            <span className="meta-tag">
                                <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                            </span>
                        )}
                        {listing.language && <span className="meta-tag">{listing.language}</span>}
                        {listing.stargazersCount > 0 && <span className="meta-tag">★ {listing.stargazersCount}</span>}
                        <span className="meta-date">{formatListedDate(listing.createdAt)}</span>
                    </div>
                    <div className="post-simple__title">
                        <h3>
                            <a href={`/${listing.repoFullName}`} onClick={goToRepo}>
                                {listing.repoFullName.split("/")[1]}
                            </a>
                        </h3>
                    </div>
                    <p className="post-simple__excerpt">
                        {listing.sellerDescription ?? listing.description ?? "No description"}
                    </p>
                </div>
                <div className="post-simple__btn-row">
                    <span className="post-simple__price">{listing.price}</span>
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
        </article>
    );
}

export function FeaturedListingCard({
    listing,
    navigate,
    unlockResults,
    onPreview,
}: {
    listing: Listing;
    navigate: (p: string) => void;
    unlockResults: Record<string, UnlockRequirement | string | "loading">;
    onPreview: (id: string) => void;
}) {
    const goToRepo = (e: ReactMouseEvent) => {
        e.preventDefault();
        navigate(`/${listing.repoFullName}`);
    };
    return (
        <article className="post-featured">
            <a className="post-featured__thumb" href={`/${listing.repoFullName}`} onClick={goToRepo}>
                <CardMedia
                    seed={listing.repoFullName}
                    screenshot={listing.screenshots[0]}
                    isNew={isRecentlyListed(listing.createdAt)}
                />
            </a>
            <div className="post-featured__content">
                <div className="post-simple__meta">
                    <span className="meta-tag">
                        <PublisherLink login={listing.ownerLogin} navigate={navigate} />
                    </span>
                    {listing.language && <span className="meta-tag">{listing.language}</span>}
                    <span className="meta-date">{formatListedDate(listing.createdAt)}</span>
                </div>
                <h2 className="post-featured__title">
                    <a href={`/${listing.repoFullName}`} onClick={goToRepo}>
                        {listing.repoFullName.split("/")[1]}
                    </a>
                </h2>
                <p className="post-featured__excerpt">
                    {listing.sellerDescription ?? listing.description ?? "No description"}
                </p>
                <div className="post-simple__btn-row">
                    <span className="post-simple__price">{listing.price}</span>
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
        </article>
    );
}

export function ListingGrid({
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
            <div className="post-list">
                {listings.map((listing) => (
                    <ListingRow
                        key={listing.id}
                        listing={listing}
                        navigate={navigate}
                        showOwner={showOwner}
                        unlockResults={unlockResults}
                        onPreview={onPreview}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="catalog-grid">
            {listings.map((listing) => (
                <div key={listing.id} className="listing-card">
                    <CardMedia
                        seed={listing.repoFullName}
                        screenshot={listing.screenshots[0]}
                        isNew={isRecentlyListed(listing.createdAt)}
                    />
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
                        href={`/${listing.repoFullName}`}
                        onClick={(e) => {
                            e.preventDefault();
                            navigate(`/${listing.repoFullName}`);
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
