import { type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { githubLoginUrl, type Listing, type Me } from "../api";

/**
 * Homepage — a faithful React port of the finished design/behavior prototyped in
 * public/landing/index.html (a static copy of the "Rayo" vendor template, made dynamic
 * against this same backend). The vendor CSS (main.min.css/plugins.min.css/loader.css) is
 * loaded globally in src/main.tsx, so classes below (mxd-*, hero-00-*, tag-*, btn-*) are the
 * real vendor classes, not invented ones.
 *
 * index.html itself is a heavily-modified vendor "agency portfolio" template — most of its
 * mid-body is unmodified vendor demo/marketing filler (a fake "inner pages" screen gallery
 * with dead links to pages that don't exist in this app, a blog/portfolio demo-card pair, a
 * device-responsiveness promo, a features showcase with mismatched vendor tags, a
 * dummyimage.com-backed "got feedback" banner, decorative marquees, an ambient stock video).
 * None of that is real margit content, so none of it is ported here — only the hero, the
 * real CTAs, the "how it works" steps, the live recent-listings grid, and the real footer.
 *
 * Also intentionally NOT ported: index.html's own header/hamburger/full-screen mega-menu —
 * the real app's <NavBar> (rendered once by App.tsx around every page, this one included)
 * already provides real navigation, so recreating the vendor's decorative GSAP menu overlay
 * here would just be a second, dead copy of the same links.
 */

const FALLBACK_ACCENT = "#9F8BE7";
const FALLBACK_ADDITIONAL = "#DDF160";

const MARQUEE_DIVIDER = (
    <svg viewBox="0 0 80 80" fill="currentColor" aria-hidden="true">
        <path
            fill="currentColor"
            d="M78.4,38.4c0,0-11.8,0-15.8,0c-1.6,0-4.8-0.2-7.1-0.8c-2.3-0.6-4.3-0.8-6.3-2.4c-2-1.2-3.5-3.2-4.7-4.8
            c-1.2-1.6-1.6-3.6-2-5.5c-0.3-1.5-0.7-4.3-0.8-5.9c-0.2-4.3,0-17.4,0-17.4C41.8,0.8,41,0,40.2,0s-1.6,0.8-1.6,1.6c0,0,0,13.1,0,17.4
            c0,1.6-0.6,4.3-0.8,5.9c-0.3,2-0.8,4-2,5.5c-1.2,2-2.8,3.6-4.7,4.8s-4,1.8-6.3,2.4c-1.9,0.5-4.7,0.6-6.7,0.8c-3.9,0.4-16.6,0-16.6,0
            C0.8,38.4,0,39.2,0,40c0,0.8,0.8,1.6,1.6,1.6c0,0,12.2,0,16.6,0c1.6,0,4.8,0.3,6.7,0.8c2.3,0.6,4.3,0.8,6.3,2.4
            c1.6,1.2,3.2,2.8,4.3,4.4c1.2,2,2.1,3.9,2.4,6.3c0.2,1.7,0.7,4.7,0.8,6.7c0.2,4,0,16.2,0,16.2c0,0.8,0.8,1.6,1.6,1.6
            s1.6-0.8,1.6-1.6c0,0,0-12.3,0-16.2c0-1.6,0.5-5.1,0.8-6.7c0.5-2.3,0.8-4.4,2.4-6.3c1.2-1.6,2.8-3.2,4.3-4.4c2-1.2,3.9-2,6.3-2.4
            c1.8-0.3,5.1-0.7,7.1-0.8c3.5-0.2,15.8,0,15.8,0c0.8,0,1.6-0.8,1.6-1.6C80,39.2,79.2,38.4,78.4,38.4C78.4,38.4,78.4,38.4,78.4,38.4z"
        />
    </svg>
);

/** The vendor's hero-00 marquee pill needs several repeats of its two phrases to fill the
    pill width at every breakpoint (it's designed to loop via GSAP, which isn't loaded here —
    see the note on `.marquee-left--gsap` below — so a static repeated row stands in for it). */
const MARQUEE_PHRASES = ["your work", "your code", "your work", "your code", "your work", "your code"];

function HeroMarquee() {
    return (
        <div className="mxd-hero-00__marquee">
            {/* The vendor's own `.marquee-left--gsap` modifier applies a permanent
                `translate: calc(-100% + 100vw)` meant to be animated back by GSAP on load;
                since app.min.js (the vendor's animation bundle) is intentionally never loaded
                in the real app, that class is dropped here — otherwise the whole marquee
                would render permanently shifted off-screen instead of just non-animated. */}
            <div className="marquee">
                <div className="marquee__toleft marquee-flex">
                    {MARQUEE_PHRASES.map((phrase, i) => (
                        <div className="marquee__item item-regular text" key={i}>
                            <p>{phrase}</p>
                            {MARQUEE_DIVIDER}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function repoName(listing: Listing): string {
    return listing.repoFullName.split("/")[1] || listing.repoFullName;
}

function mediaStyle(listing: Listing, altIndex: number): CSSProperties {
    const shot = listing.screenshots[0];
    if (shot) {
        return { backgroundImage: `url(${shot})`, backgroundSize: "cover", backgroundPosition: "center" };
    }
    return { background: altIndex % 2 === 0 ? FALLBACK_ACCENT : FALLBACK_ADDITIONAL };
}

function ConnectOrProfileButton({
    me,
    navigate,
    className,
}: {
    me: Me;
    navigate: (p: string) => void;
    className: string;
}) {
    return me.authenticated ? (
        <button type="button" className={className} onClick={() => navigate("/works")}>
            <span className="btn-caption">Go to My Repos</span>
            <i className="ph-bold ph-arrow-up-right" />
        </button>
    ) : (
        <a className={className} href={githubLoginUrl()}>
            <span className="btn-caption">Connect with GitHub</span>
            <i className="ph-bold ph-github-logo" />
        </a>
    );
}

export function WelcomePage({
    me,
    navigate,
    listings = null,
    listingsError = null,
}: {
    me: Me;
    navigate: (p: string) => void;
    /** Optional so DashboardPage's own logged-out fallback (`<WelcomePage me={me} navigate={navigate} />`,
        which has no listings of its own to forward) still compiles — it just renders the
        Recent Listings section's "Loading…" state in that path instead of real data. */
    listings?: Listing[] | null;
    listingsError?: string | null;
}) {
    const recentThree = (listings ?? []).slice(0, 3);

    const goTo = (path: string) => (e: ReactMouseEvent) => {
        e.preventDefault();
        navigate(path);
    };

    return (
        <>
            {/* These rules exist only in index.html's own page-scoped <style> block, not in the
                vendor CSS files themselves — small layout glue for content this page adds that
                the vendor template didn't have a built-in slot for (the hero CTA row, the
                ETHGlobal promo card, the 3-step grid, the footer's copyright line). */}
            <style>{`
                .welcome-hero-actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1.6rem;
                    justify-content: center;
                    margin-top: 4.4rem;
                }
                .welcome-promo-card {
                    max-width: 620px;
                    margin: 3.2rem auto 0;
                    padding: 2rem 2.6rem;
                    text-align: center;
                }
                .welcome-promo-card p {
                    margin: 0;
                }
                .welcome-steps-row {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 2.4rem;
                }
                @media (max-width: 960px) {
                    .welcome-steps-row {
                        grid-template-columns: 1fr;
                    }
                }
                .welcome-step-num {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 4rem;
                    height: 4rem;
                    border-radius: 50%;
                    background: var(--base-opp);
                    color: var(--t-opp-bright);
                    font-weight: var(--fw-semibold);
                    margin-bottom: 1.6rem;
                }
                .welcome-footer-bottom {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 0.6rem;
                    margin-top: 4rem;
                    padding-top: 2.4rem;
                    border-top: 1px solid var(--st-muted);
                }
            `}</style>

            {/* Hero Section — real: the "your work"/"your code" marquee pill behind the big
                two-line title, the real tagline, and the real primary CTAs. The vendor's own
                floating 3D-object hero images (hero-00-image) are decorative filler and are
                dropped. */}
            <div className="mxd-section mxd-hero-section">
                <div className="mxd-hero-00">
                    <div className="mxd-hero-00__wrap">
                        <div className="mxd-hero-00__top">
                            <div className="mxd-hero-00__title-wrap">
                                <HeroMarquee />
                                <h1 className="hero-00-title">
                                    <span className="hero-00-title__row">
                                        <em className="hero-00-title__item">Sell</em>
                                        <em className="hero-00-title__item title-item-transparent">your work</em>
                                    </span>
                                    <span className="hero-00-title__row">
                                        <em className="hero-00-title__item title-item-image">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" aria-hidden="true">
                                                <path d="M19.6,9.6h-3.9c-.4,0-1.8-.2-1.8-.2-.6,0-1.1-.2-1.6-.6-.5-.3-.9-.8-1.2-1.2-.3-.4-.4-.9-.5-1.4,0,0,0-1.1-.2-1.5V.4c0-.2-.2-.4-.4-.4s-.4.2-.4.4v4.4c0,.4-.2,1.5-.2,1.5,0,.5-.2,1-.5,1.4-.3.5-.7.9-1.2,1.2s-1,.5-1.6.6c0,0-1.2,0-1.7.2H.4c-.2,0-.4.2-.4.4s.2.4.4.4h4.1c.4,0,1.7.2,1.7.2.6,0,1.1.2,1.6.6.4.3.8.7,1.1,1.1.3.5.5,1,.6,1.6,0,0,0,1.3.2,1.7v4.1c0,.2.2.4.4.4s.4-.2.4-.4v-4.1c0-.4.2-1.7.2-1.7,0-.6.2-1.1.6-1.6.3-.4.7-.8,1.1-1.1.5-.3,1-.5,1.6-.6,0,0,1.3,0,1.8-.2h3.9c.2,0,.4-.2.4-.4s-.2-.4-.4-.4h0Z" />
                                            </svg>
                                        </em>
                                        <em className="hero-00-title__item">with agents</em>
                                    </span>
                                </h1>
                            </div>
                        </div>
                        <div className="mxd-hero-00__bottom">
                            <div className="hero-00-manifest">
                                <p className="mxd-manifest">
                                    Margit is a marketplace for GitHub repositories. Get paid in USDC or EURC on Arc —
                                    buyers, human or AI agent, pay once and get an authenticated clone.
                                </p>
                            </div>
                            <div className="welcome-hero-actions">
                                <ConnectOrProfileButton
                                    me={me}
                                    navigate={navigate}
                                    className="btn btn-anim btn-default btn-large btn-additional slide-right"
                                />
                                <a
                                    className="btn btn-anim btn-default btn-large btn-outline slide-right-up"
                                    href="/catalog"
                                    onClick={goTo("/catalog")}
                                >
                                    <span className="btn-caption">Browse Catalog</span>
                                    <i className="ph-bold ph-arrow-up-right" />
                                </a>
                            </div>
                            <div className="welcome-promo-card bg-base-tint radius-m">
                                <p>
                                    👋 Built for ETHGlobal ETHOnline 2026
                                    <br />
                                    Sell repos to humans or AI agents, paid in USDC/EURC on Arc Blockchain.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* How It Works — real: the same 3 steps as the previous stub, given the vendor's
                three-tone feature-card treatment (bg-base-tint/bg-accent/bg-additional) instead
                of a plain list. index.html has no equivalent section of its own to port
                verbatim (its "Features" sections are vendor marketing filler — see the file
                header comment) — the vendor card *component* is reused here for real content. */}
            <div className="mxd-section padding-default">
                <div className="mxd-container grid-container">
                    <div className="mxd-block">
                        <div className="mxd-section-title pre-grid">
                            <div className="mxd-section-title__text">
                                <h2>How it works</h2>
                            </div>
                        </div>
                    </div>
                    <div className="mxd-block">
                        <div className="welcome-steps-row">
                            <div className="mxd-features-cards__inner bg-base-tint radius-l padding-4">
                                <span className="welcome-step-num">1</span>
                                <h3>Connect GitHub</h3>
                                <p>Sign in to see your repos — nothing is listed automatically.</p>
                            </div>
                            <div className="mxd-features-cards__inner bg-accent radius-l padding-4">
                                <span className="welcome-step-num opposite">2</span>
                                <h3 className="opposite">List a private repo</h3>
                                <p className="t-opposite">
                                    Set a price and your Arc payout address (0x, ENS, or ArcNS name).
                                </p>
                            </div>
                            <div className="mxd-features-cards__inner bg-additional radius-l padding-4">
                                <span className="welcome-step-num opposite">3</span>
                                <h3 className="opposite">Get paid, agents included</h3>
                                <p className="t-opposite">
                                    A real x402 paywall on Arc testnet — any AI agent can discover, pay, and clone
                                    autonomously.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Demo CTA — real: index.html's own "List your first repo" call-to-action,
                made conditional the same way the hero CTA is (a signed-in seller doesn't need
                to be told to connect GitHub again). */}
            <div className="mxd-section padding-default">
                <div className="mxd-container">
                    <div className="mxd-block">
                        <div className="mxd-demo-cta">
                            <div className="mxd-demo-cta__caption">
                                <h2 className="h2-small">List your first repo and let agents find it.</h2>
                            </div>
                            <div className="mxd-demo-cta__btn">
                                <ConnectOrProfileButton
                                    me={me}
                                    navigate={navigate}
                                    className="btn btn-anim btn-default btn-large btn-additional slide-right"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Listings — real: index.html fetches /api/listings client-side and renders
                up to 3 cards; the real app already lifts that same data to App.tsx (shared with
                CatalogPage), so it arrives here as a prop instead of a second fetch. */}
            <div className="mxd-section padding-blog">
                <div className="mxd-container grid-container">
                    <div className="mxd-block">
                        <div className="mxd-section-title pre-grid">
                            <div className="container-fluid p-0">
                                <div className="row g-0">
                                    <div className="col-12 col-xl-5 mxd-grid-item no-margin">
                                        <div className="mxd-section-title__hrtitle">
                                            <h2>Recent listings</h2>
                                        </div>
                                    </div>
                                    <div className="col-12 col-xl-4 mxd-grid-item no-margin">
                                        <div className="mxd-section-title__hrdescr">
                                            <p>
                                                Private repos for sale right now — paid in USDC or EURC on Arc,
                                                unlockable by a human or an AI agent.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="col-12 col-xl-3 mxd-grid-item no-margin">
                                        <div className="mxd-section-title__hrcontrols">
                                            <a
                                                className="btn btn-anim btn-default btn-outline slide-right-up"
                                                href="/catalog"
                                                onClick={goTo("/catalog")}
                                            >
                                                <span className="btn-caption">Browse Catalog</span>
                                                <i className="ph-bold ph-arrow-up-right" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mxd-block">
                        <div className="mxd-blog-preview">
                            <div className="container-fluid p-0">
                                <div className="row g-0">
                                    {listingsError ? (
                                        <p className="hint" style={{ opacity: 0.6 }}>
                                            Could not load the catalog.
                                        </p>
                                    ) : listings === null ? (
                                        <p className="hint" style={{ opacity: 0.6 }}>
                                            Loading…
                                        </p>
                                    ) : recentThree.length === 0 ? (
                                        <p className="hint" style={{ opacity: 0.6 }}>
                                            No listings yet — be the first to list a repo.
                                        </p>
                                    ) : (
                                        recentThree.map((listing, i) => {
                                            const href = `/${listing.repoFullName}`;
                                            return (
                                                <div
                                                    className="col-12 col-xl-4 mxd-blog-preview__item mxd-grid-item"
                                                    key={listing.id}
                                                >
                                                    <a className="mxd-blog-preview__media" href={href} onClick={goTo(href)}>
                                                        <div
                                                            className="mxd-blog-preview__image"
                                                            style={mediaStyle(listing, i)}
                                                        />
                                                        <div className="mxd-preview-hover">
                                                            <i className="mxd-preview-hover__icon">
                                                                <img src="/landing/img/icons/icon-eye.svg" alt="" />
                                                            </i>
                                                        </div>
                                                        <div className="mxd-blog-preview__tags">
                                                            <span className="tag tag-default tag-permanent">
                                                                {listing.language || "Repo"}
                                                            </span>
                                                            <span className="tag tag-default tag-permanent">
                                                                {listing.price}
                                                            </span>
                                                        </div>
                                                    </a>
                                                    <div className="mxd-blog-preview__data">
                                                        <a href={href} onClick={goTo(href)}>
                                                            {repoName(listing)}
                                                        </a>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer — real: "Powered By"/"Marketplace"/"For Agents" link groups, the ETHGlobal
                blurb, and the credit line, all hand-fixed in index.html this session. The
                vendor's own giant "ETHGLOBAL ETHONLINE 2026" wordmark banner and back-to-top
                button are cosmetic flourishes and are left out in favor of a leaner footer. */}
            <footer className="mxd-demo-footer">
                <div className="mxd-container grid-container">
                    <div className="mxd-block">
                        <div className="container-fluid p-0">
                            <div className="row g-0">
                                <div className="col-12 col-xl-3 mxd-demo-footer__item mxd-grid-item">
                                    <div className="mxd-demo-footer__logo">
                                        <a href="/" className="mxd-logo" onClick={goTo("/")}>
                                            <span className="mxd-logo__text" style={{ fontSize: "4rem" }}>
                                                Margit
                                            </span>
                                        </a>
                                    </div>
                                    <div className="mxd-demo-footer__slogan">
                                        <p className="t-small t-bright">
                                            👋 Built for ETHGlobal ETHOnline 2026 — sell repos to humans or AI agents,
                                            paid in USDC/EURC on Arc Blockchain.
                                        </p>
                                    </div>
                                    <div className="mxd-demo-footer__btn">
                                        <a
                                            className="btn btn-anim btn-default btn-small btn-accent slide-right"
                                            href="/catalog"
                                            onClick={goTo("/catalog")}
                                        >
                                            <span className="btn-caption">Catalog</span>
                                            <i className="ph ph-shopping-cart-simple" />
                                        </a>
                                        <a
                                            className="btn btn-anim btn-default btn-small btn-outline slide-right-up"
                                            href="/works"
                                            onClick={goTo("/works")}
                                        >
                                            <span className="btn-caption">My Repos</span>
                                            <i className="ph ph-arrow-up-right" />
                                        </a>
                                    </div>
                                </div>
                                <div className="col-12 col-xl-9 mxd-demo-footer__item">
                                    <nav className="mxd-demo-footer__nav">
                                        <div className="container-fluid p-0">
                                            <div className="row g-0">
                                                <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                                                    <div className="mxd-footer-nav__block">
                                                        <div className="mxd-footer-nav__title">
                                                            <p className="t-140 t-bright t-caption">Marketplace</p>
                                                        </div>
                                                        <div className="mxd-footer-nav__list">
                                                            <ul>
                                                                <li>
                                                                    <a href="/" onClick={goTo("/")}>
                                                                        Home
                                                                    </a>
                                                                </li>
                                                                <li>
                                                                    <a href="/catalog" onClick={goTo("/catalog")}>
                                                                        Catalog
                                                                    </a>
                                                                </li>
                                                                <li>
                                                                    <a href="/works" onClick={goTo("/works")}>
                                                                        My Repos
                                                                    </a>
                                                                </li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                                                    <div className="mxd-footer-nav__block">
                                                        <div className="mxd-footer-nav__title">
                                                            <p className="t-140 t-bright t-caption">For Agents</p>
                                                        </div>
                                                        <div className="mxd-footer-nav__list">
                                                            <ul>
                                                                <li>
                                                                    <a href={githubLoginUrl()}>Connect GitHub</a>
                                                                </li>
                                                                <li>
                                                                    <a
                                                                        href="https://github.com/vm06007/margit"
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        GitHub Source
                                                                    </a>
                                                                </li>
                                                                <li>
                                                                    <a
                                                                        href="https://bazantic.com"
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        Bazantic
                                                                    </a>
                                                                </li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                                                    <div className="mxd-footer-nav__block">
                                                        <div className="mxd-footer-nav__title">
                                                            <p className="t-140 t-bright t-caption">Powered By</p>
                                                        </div>
                                                        <div className="mxd-footer-nav__list">
                                                            <ul>
                                                                <li>
                                                                    <a
                                                                        href="https://arc.io"
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        Arc
                                                                    </a>
                                                                </li>
                                                                <li>
                                                                    <a
                                                                        href="https://circle.com"
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        Circle (USDC/EURC)
                                                                    </a>
                                                                </li>
                                                                <li>
                                                                    <a
                                                                        href="https://openrouter.ai"
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                    >
                                                                        OpenRouter
                                                                    </a>
                                                                </li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </nav>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mxd-block">
                        <div className="welcome-footer-bottom">
                            <i className="ph ph-copyright" />
                            <span>
                                2026 by{" "}
                                <a href="https://github.com/vm06007" target="_blank" rel="noreferrer">
                                    Vitalik Marinčenko
                                </a>
                            </span>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
}
