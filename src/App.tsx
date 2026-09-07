import { useEffect, useMemo, useState } from "react";
import { fetchListings, fetchMe, fetchRepos, logout, type AgentListingChange, type Listing, type Me, type Repo } from "./api";
import { SiteHeader } from "./components/layout/SiteHeader";
import { BackToTop } from "./components/layout/BackToTop";
import { SiteFooter } from "./components/layout/SiteFooter";
import { CatalogCTA } from "./components/layout/CatalogCTA";
import { useSiteMotion } from "./hooks/useSiteMotion";
import type { MouseEvent } from "react";
import { AgentSidebar } from "./components/AgentSidebar";
import { useRoute } from "./hooks/useRoute";
import { WelcomePage } from "./pages/WelcomePage";
import { DashboardPage, DashboardStyle, ListModal } from "./pages/DashboardPage";
import { CatalogPage } from "./pages/CatalogPage";
import { PublisherPage } from "./pages/PublisherPage";
import { RepoDetailPage } from "./pages/RepoDetailPage";


const AGENT_OPEN_STORAGE_KEY = "margit:agent-open";

function App() {
    const [path, navigate] = useRoute();
    const [me, setMe] = useState<Me | null>(null);
    const [editingListing, setEditingListing] = useState<Listing | null>(null);
    const [repos, setRepos] = useState<Repo[] | null>(null);
    const [reposError, setReposError] = useState<string | null>(null);
    const [listings, setListings] = useState<Listing[] | null>(null);
    const [listingsError, setListingsError] = useState<string | null>(null);
    const [agentOpen, setAgentOpen] = useState(() => localStorage.getItem(AGENT_OPEN_STORAGE_KEY) === "1");
    const [highlightedRepo, setHighlightedRepo] = useState<string | null>(null);

    useEffect(() => {
        localStorage.setItem(AGENT_OPEN_STORAGE_KEY, agentOpen ? "1" : "0");
    }, [agentOpen]);

    const handleAgentListingChange = (change: AgentListingChange) => {
        if (change.type === "listed" && change.listing) {
            const newListing = change.listing;
            setListings((prev) => [...(prev ?? []).filter((l) => l.id !== newListing.id), newListing]);
        } else if (change.type === "unlisted") {
            setListings((prev) => prev?.filter((l) => l.repoFullName.toLowerCase() !== change.repoFullName.toLowerCase()) ?? null);
        }
        setHighlightedRepo(change.repoFullName);
        setTimeout(() => {
            setHighlightedRepo((current) => (current === change.repoFullName ? null : current));
        }, 1800);
    };

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

    useSiteMotion(path);

    const publisherMatch = path.match(/^\/publisher\/([^/]+)$/);
    // Bare owner/name (no "/repo/" prefix) — checked after publisherMatch/catalog/profile
    // below so those reserved single-segment paths keep winning over a same-shaped repo URL.
    const repoMatch = path.match(/^\/([^/]+)\/([^/]+)$/);

    const editingRepo = repos?.find(repo => repo.fullName.toLowerCase() === editingListing?.repoFullName.toLowerCase());
    const saveListing = (listing: Listing) => setListings(prev => [...(prev ?? []).filter(item => item.repoFullName.toLowerCase() !== listing.repoFullName.toLowerCase()), listing]);
    const home = path === "/";
    const viewer = me ?? { authenticated: false };
    const routeClick = (event: MouseEvent<HTMLDivElement>) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
        const url = new URL(anchor.href);
        if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.hash || url.pathname.endsWith(".html")) return;
        event.preventDefault();
        navigate(url.pathname);
    };
    return (
        <div id="app-row" className={`site-app ${home ? "site-home" : "site-inner"}`} onClick={routeClick}>
            <div id={home ? "home-page-wrap" : "mxd-page-wrap"} className="site-page-wrap">
                <SiteHeader key={path} home={home}
                    path={path}
                    me={viewer}
                    onLogout={() => logout().then(() => setMe({ authenticated: false }))}
                    agentOpen={agentOpen}
                    onToggleAgent={() => setAgentOpen((v) => !v)}
                />
                <main id="mxd-page-content" className={`mxd-page-content ${home ? "" : "inner-page-content"}`}>
                {publisherMatch ? (
                    <PublisherPage login={publisherMatch[1]} listings={listings} navigate={navigate} />
                ) : path === "/catalog" ? (
                    <CatalogPage me={viewer} onEdit={setEditingListing} listings={listings} listingsError={listingsError} navigate={navigate} />
                ) : (path === "/works" || path === "/profile") ? (
                    <DashboardPage
                        me={viewer}
                        repos={repos}
                        reposError={reposError}
                        listingByRepo={listingByRepo}
                        navigate={navigate}
                        onListed={saveListing}
                        onUnlisted={(id) => setListings((prev) => prev?.filter((l) => l.id !== id) ?? null)}
                        onMadePrivate={(repoId) =>
                            setRepos((prev) => prev?.map((r) => (r.id === repoId ? { ...r, private: true } : r)) ?? null)
                        }
                        highlightedRepo={highlightedRepo}
                    />
                ) : repoMatch ? (
                    <RepoDetailPage key={path} owner={repoMatch[1]} name={repoMatch[2]} listings={listings} navigate={navigate} />
                ) : (
                    <WelcomePage me={viewer} navigate={navigate} listings={listings} listingsError={listingsError} />
                )}
                {path === "/catalog" && <CatalogCTA />}
                </main>
                {path !== "/works" && path !== "/profile" && !(repoMatch && !publisherMatch) && <SiteFooter variant={home ? "home" : path === "/catalog" ? "catalog" : "works"} />}
            </div>
            <AgentSidebar
                open={!home && agentOpen}
                onClose={() => setAgentOpen(false)}
                onListingChange={handleAgentListingChange}
            />
            <BackToTop path={path} />
            {editingListing && viewer.authenticated && <>
                <DashboardStyle />
                {editingRepo ? <ListModal
                    key={editingListing.id}
                    repo={editingRepo}
                    listing={editingListing}
                    onClose={() => setEditingListing(null)}
                    onSaved={saveListing}
                    onUnlisted={id => setListings(prev => prev?.filter(item => item.id !== id) ?? null)}
                /> : <div className="modal-overlay" onClick={() => setEditingListing(null)}>
                    <div className="modal" role="dialog" aria-modal="true" aria-label="Edit listing" onClick={event => event.stopPropagation()}>
                        <button className="modal-close" aria-label="Close" onClick={() => setEditingListing(null)}>×</button>
                        <p role="status">{reposError || (repos ? 'This repository is no longer available to your GitHub account.' : 'Loading your repository…')}</p>
                    </div>
                </div>}
            </>}
        </div>
    );
}

export default App;
