import { formatListingPrice } from "../lib/format";
import { RepositoryAdvisor } from '../components/RepositoryAdvisor';
import { MarketStatsCard } from "../components/MarketStatsCard";
import { RecentGraphSales } from "../components/RecentGraphSales";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { Listing, Me } from "../api";
import { listingMediaStyle } from "../components/listingMedia";

function formatListedDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Repository catalog with filtering and listing previews. */

const POSTS_PER_PAGE = 6;

// A fixed, broader set of category chips so the filter row reads like a real catalog even
// before every language has a listing — clicking one with zero current matches just shows
// the empty state below, same as a live search. Mirrors CURATED_LANGUAGES in catalog2.html.
const CURATED_LANGUAGES = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Rust",
    "Go",
    "Solidity",
    "Java",
    "Ruby",
    "Swift",
    "C++",
    "HTML",
];

// main.min.css defines --accent/--additional as CSS custom properties that flip between
// light/dark theme values via a prefers-color-scheme media query. Reusing the light-theme
// hex values directly here (rather than var(--accent)) keeps the fallback-thumbnail gradient
// simple and deterministic without needing to track the current color-scheme in JS.
const FALLBACK_ACCENT = "#9F8BE7";
const FALLBACK_ADDITIONAL = "#DDF160";

function repoName(listing: Listing): string {
    return listing.repoFullName.split("/")[1] || listing.repoFullName;
}

function mediaStyle(listing: Listing, altIndex: number): CSSProperties {
    return listingMediaStyle(listing.screenshots[0], altIndex % 2 === 0 ? FALLBACK_ACCENT : FALLBACK_ADDITIONAL, listing.screenshotBackground);
}

/** Curated + present-in-listings + "always include the newest listing's language" set. */
function languagesOf(listings: Listing[]): string[] {
    const present = new Set<string>();
    for (const l of listings) if (l.language) present.add(l.language);
    const result = [...CURATED_LANGUAGES];
    const newest = [...listings].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    if (newest?.language && !result.includes(newest.language)) result.push(newest.language);
    for (const lang of [...present].sort()) if (!result.includes(lang)) result.push(lang);
    return result;
}

/**
 * Empty active-language selection = no narrowing = show everything (only the "All" chip is
 * lit). Once narrowed, a listing with no detected language has no chip to match against, so
 * it stays excluded — same as any language outside the active set.
 */
function filterListings(listings: Listing[], activeLanguages: string[], query: string): Listing[] {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
        if (activeLanguages.length > 0 && (!l.language || !activeLanguages.includes(l.language))) return false;
        if (!q) return true;
        const haystack = `${l.repoFullName} ${l.sellerDescription ?? ""} ${l.description ?? ""}`.toLowerCase();
        return haystack.includes(q);
    });
}

function AuthorMeta({ listing }: { listing: Listing }) {
    return (
        <span className="meta-tag author-meta-tag">
            <a
                href={`/publisher/${encodeURIComponent(listing.ownerLogin)}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.7rem" }}
            >
                <img
                    src={`https://github.com/${listing.ownerLogin}.png?size=40`}
                    alt=""
                    style={{ width: "2.8rem", height: "2.8rem", borderRadius: "50%", objectFit: "cover" }}
                />
                {listing.ownerLogin}
            </a>
        </span>
    );
}

function EditListingButton({ onClick, name }: { onClick: () => void; name: string }) {
    return <button type="button" className="btn btn-default btn-outline listing-edit-button" aria-label={`Edit ${name}`} title="Edit listing" onClick={onClick}><i className="ph ph-pencil-simple" /></button>;
}

function FeaturedPost({
    listing,
    goTo,
    onEdit,
}: {
    listing: Listing;
    onEdit?: () => void;
    goTo: (path: string) => (e: ReactMouseEvent) => void;
}) {
    const href = `/${listing.repoFullName}`;
    return (
        <article className="mxd-post post-featured catalog-featured radius-m">
            <a className="post-featured__thumb" href={href} onClick={goTo(href)}>
                <div className="listing-media" style={{ width: "100%", height: "100%", ...mediaStyle(listing, 0) }} />
            </a>
            <div className="post-featured__categories">
                {listing.language && (
                    <span className="tag tag-default tag-outline-permanent tag-link-outline-premanent">
                        <a href="#0" onClick={(e) => e.preventDefault()}>
                            {listing.language}
                        </a>
                    </span>
                )}
            </div>
            <div className="post-featured__content">
                <div className="post-featured__meta">
                    <AuthorMeta listing={listing} />
                    <span className="meta-date">{formatListedDate(listing.createdAt)}</span>
                </div>
                <h2 className="post-featured__title">
                    <a href={href} onClick={goTo(href)}>
                        {repoName(listing)}
                    </a>
                </h2>
                <div className="post-featured__excerpt">
                    <p>{listing.sellerDescription || listing.description || "No description"}</p>
                </div>
                <div className="listing-card-actions">
                    <span className="tag tag-default tag-outline-permanent featured-listing-price">{formatListingPrice(listing.price)}</span>
                    {onEdit && <EditListingButton onClick={onEdit} name={repoName(listing)} />}
                </div>
            </div>
        </article>
    );
}

export function SimplePost({
    listing,
    altIndex,
    goTo,
    onEdit,
}: {
    listing: Listing;
    onEdit?: () => void;
    altIndex: number;
    goTo: (path: string) => (e: ReactMouseEvent) => void;
}) {
    const href = `/${listing.repoFullName}`;
    return (
        <article className="mxd-post post-simple">
            <a className="post-simple__thumb radius-m" href={href} onClick={goTo(href)}>
                <div className="listing-media" style={{ width: "100%", height: "100%", ...mediaStyle(listing, altIndex) }} />
                <div className="mxd-preview-hover">
                    <i className="mxd-preview-hover__icon">
                        <img src="/site/img/icons/icon-eye.svg" alt="Eye Icon" />
                    </i>
                </div>
            </a>
            <div className="post-simple__content">
                <div className="post-simple__descr">
                    <div className="post-simple__meta">
                        <AuthorMeta listing={listing} />
                        {listing.language && (
                            <span className="meta-tag">
                                <a href="#0" onClick={(e) => e.preventDefault()}>
                                    {listing.language}
                                </a>
                            </span>
                        )}
                        <span className="meta-date">{formatListedDate(listing.createdAt)}</span>
                    </div>
                    <div className="post-simple__title">
                        <h3>
                            <a href={href} onClick={goTo(href)}>
                                {repoName(listing)}
                            </a>
                        </h3>
                    </div>
                    {(listing.sellerDescription || listing.description) && (
                        <p className="listing-card-description">{listing.sellerDescription || listing.description}</p>
                    )}
                </div>
                <div className="post-simple__btn listing-card-actions">
                    <a className="btn btn-anim btn-default btn-outline slide-right-up" href={href} onClick={goTo(href)}>
                        <span className="btn-caption">Unlock — {formatListingPrice(listing.price)}</span>
                        <i className="ph ph-arrow-up-right" />
                    </a>
                    {onEdit && <EditListingButton onClick={onEdit} name={repoName(listing)} />}
                </div>
            </div>
        </article>
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
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
    return (
        <div className="mxd-blog-pagination">
            <div className="mxd-blog-pagination__inner">
                <nav className="mxd-blog-pagination__items">
                    <a
                        href="#0"
                        className={`mxd-blog-pagination__item blog-pagination-control prev btn btn-anim btn-line-small btn-bright anim-no-delay slide-left${page <= 1 ? " pagination-disabled" : ""}`}
                        aria-label="Previous Page"
                        onClick={(e) => {
                            e.preventDefault();
                            if (page > 1) onGoToPage(page - 1);
                        }}
                    >
                        <i className="ph ph-arrow-left" />
                        <span className="btn-caption">Prev</span>
                    </a>
                    {pages.map((n) => (
                        <a
                            key={n}
                            href="#0"
                            className={`mxd-blog-pagination__item blog-pagination-number btn btn-anim${n === page ? " active" : ""}`}
                            onClick={(e) => {
                                e.preventDefault();
                                onGoToPage(n);
                            }}
                        >
                            <span className="btn-caption">{n}</span>
                        </a>
                    ))}
                    <a
                        href="#0"
                        className={`mxd-blog-pagination__item blog-pagination-control next btn btn-anim btn-line-small btn-bright anim-no-delay slide-right${page >= pageCount ? " pagination-disabled" : ""}`}
                        aria-label="Next Page"
                        onClick={(e) => {
                            e.preventDefault();
                            if (page < pageCount) onGoToPage(page + 1);
                        }}
                    >
                        <span className="btn-caption">Next</span>
                        <i className="ph ph-arrow-right" />
                    </a>
                </nav>
            </div>
        </div>
    );
}

export function CatalogPage({
    agentOpen,
    me,
    onEdit,
    listings,
    listingsError,
    navigate,
}: {
    agentOpen: boolean;
    me: Me;
    onEdit: (listing: Listing) => void;
    listings: Listing[] | null;
    listingsError: string | null;
    navigate: (p: string) => void;
}) {
    const editAction = (listing: Listing) => me.authenticated && me.login?.toLowerCase() === listing.ownerLogin.toLowerCase() ? () => onEdit(listing) : undefined;
    const [activeLanguages, setActiveLanguages] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const postsRef = useRef<HTMLDivElement | null>(null);

    const allListings = useMemo(() => listings ?? [], [listings]);
    const languages = useMemo(() => languagesOf(allListings), [allListings]);
    const filtered = useMemo(
        () => filterListings(allListings, activeLanguages, query),
        [allListings, activeLanguages, query],
    );
    const [featured, ...rest] = filtered;
    const pageCount = Math.max(1, Math.ceil(rest.length / POSTS_PER_PAGE));

    // Clamp the current page if a narrower filter shrank the result set below it.
    useEffect(() => {
        setPage((p) => Math.min(p, pageCount));
    }, [pageCount]);

    const goTo = (path: string) => (e: ReactMouseEvent) => {
        e.preventDefault();
        navigate(path);
    };

    const toggleLanguage = (lang: string) => {
        setActiveLanguages((cur) => (cur.includes(lang) ? cur.filter((l) => l !== lang) : [...cur, lang]));
        setPage(1);
    };

    const selectAllLanguages = () => {
        setActiveLanguages([]);
        setPage(1);
    };

    const goToPage = (p: number) => {
        setPage(p);
        postsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const currentPage = Math.min(page, pageCount);
    const pageStart = (currentPage - 1) * POSTS_PER_PAGE;
    const pageItems = rest.slice(pageStart, pageStart + POSTS_PER_PAGE);

    const emptyMessage = query.trim()
        ? "No listings match your search."
        : activeLanguages.length === 0
          ? "No listings yet — be the first to list a repo."
          : `No ${activeLanguages.join("/")} repos listed yet — check back soon or toggle another category.`;

    return (
        <>
            {/* These four rules exist only in catalog2.html's own page-scoped <style> block, not
                in the vendor CSS files themselves — they give the "on"/"disabled" marker classes
                below a real visual instead of doing nothing. */}
            <style>{`
                .tag-link-outline.tag-link-active {
                    background-color: var(--base-opp);
                    border-color: var(--base-opp);
                }
                .tag-link-outline.tag-link-active a {
                    color: var(--t-opp-bright);
                }
                .categories__link.active-category {
                    color: var(--accent);
                    font-weight: var(--fw-semibold);
                }
                .mxd-blog-pagination__item.pagination-disabled {
                    opacity: 0.35;
                    pointer-events: none;
                }
            `}</style>

            <div className="mxd-section mxd-section-inner-headline padding-blog-default-pre-grid">
                <div className="mxd-container grid-container">
                    <div className="mxd-block">
                        <div className="container-fluid px-0">
                            <div className="row gx-0">
                                <div className="col-12" />
                                <div className="col-12 mxd-grid-item no-margin">
                                    <div className="mxd-block__content">
                                        <div className="mxd-block__inner-headline">
                                            <h1 className="inner-headline__title catalog-page-title">
                                                <span className="catalog-title-parent"><a href="/" onClick={goTo("/")}>Home</a> <span aria-hidden="true">/</span></span>{" "}
                                                <span>Catalog</span>
                                            </h1>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12" />
                            </div>
                            <div className="row g-0">
                                <div className="col-12" />
                                <div className="col-12 mxd-grid-item no-margin">
                                    <div className="inner-headline__blogtags">
                                        <span
                                            className={`tag tag-default tag-outline tag-link-outline${activeLanguages.length === 0 ? " tag-link-active" : ""}`}
                                        >
                                            <a
                                                href="#0"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    selectAllLanguages();
                                                }}
                                            >
                                                All
                                            </a>
                                        </span>
                                        {languages.map((lang) => (
                                            <span
                                                key={lang}
                                                className={`tag tag-default tag-outline tag-link-outline${activeLanguages.includes(lang) ? " tag-link-active" : ""}`}
                                            >
                                                <a
                                                    href="#0"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        toggleLanguage(lang);
                                                    }}
                                                >
                                                    {lang}
                                                </a>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mxd-section padding-default">
                <div className="mxd-container grid-container">
                    <div className="mxd-posts-area catalog-posts-area">
                        <div className="mxd-posts-container mxd-grid-item" ref={postsRef}>
                            {listingsError ? (
                                <p className="hint" style={{ opacity: 0.6 }}>
                                    Could not load the catalog.
                                </p>
                            ) : listings === null ? (
                                <div className="catalog-loading" role="status" aria-label="Loading catalog">
                                    <span className="agent-loading-spinner" aria-hidden="true" />
                                </div>
                            ) : allListings.length === 0 ? (
                                <p className="hint" style={{ opacity: 0.6 }}>
                                    No listings yet — be the first to list a repo.
                                </p>
                            ) : (
                                <>
                                    {featured && <FeaturedPost listing={featured} goTo={goTo} onEdit={editAction(featured)} />}
                                    {pageItems.map((listing, i) => (
                                        <SimplePost key={listing.id} listing={listing} altIndex={i} goTo={goTo} onEdit={editAction(listing)} />
                                    ))}
                                    {filtered.length === 0 && (
                                        <p className="hint" style={{ opacity: 0.6 }}>
                                            {emptyMessage}
                                        </p>
                                    )}
                                    {pageCount > 1 && (
                                        <Pagination page={currentPage} pageCount={pageCount} onGoToPage={goToPage} />
                                    )}
                                </>
                            )}
                        </div>

                        <div className="mxd-sidebar mxd-grid-item">
                            <div className="mxd-sidebar__widget bg-base-tint radius-m widget-search">
                                <div className="widget-search__form">
                                    <form className="form search-form" onSubmit={(e) => e.preventDefault()}>
                                        <input
                                            id="search"
                                            type="search"
                                            name="search"
                                            placeholder="Search repos…"
                                            value={query}
                                            onChange={(e) => {
                                                setQuery(e.target.value);
                                                setPage(1);
                                            }}
                                        />
                                        <button
                                            className="btn btn-form no-scale btn-absolute-right btn-muted"
                                            type="submit"
                                            aria-label="Search"
                                        >
                                            <i className="ph ph-magnifying-glass" />
                                        </button>
                                    </form>
                                </div>
                            </div>

                            <MarketStatsCard />

                            <div className="mxd-sidebar__widget bg-base-tint radius-m" style={{ display: "none" }}>
                                <div className="widget__title">
                                    <p>Categories</p>
                                </div>
                                <ul className="widget__categories">
                                    <li className="categories__item">
                                        <a
                                            href="#0"
                                            className={`categories__link${activeLanguages.length === 0 ? " active-category" : ""}`}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                selectAllLanguages();
                                            }}
                                        >
                                            All
                                        </a>
                                    </li>
                                    {languages.map((lang) => (
                                        <li key={lang} className="categories__item">
                                            <a
                                                href="#0"
                                                className={`categories__link${activeLanguages.includes(lang) ? " active-category" : ""}`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    toggleLanguage(lang);
                                                }}
                                            >
                                                {lang}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {!agentOpen && <RecentGraphSales />}

                            <div className="mxd-sidebar__widget bg-base-tint radius-m advisor-card">
                                <RepositoryAdvisor />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {agentOpen && <div className="mxd-container"><RecentGraphSales wide /></div>}
        </>
    );
}
