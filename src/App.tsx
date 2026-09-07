import { useEffect, useMemo, useState } from "react";
import { fetchListings, fetchMe, fetchRepos, logout, type AgentListingChange, type Listing, type Me, type Repo } from "./api";
import { NavBar } from "./components/NavBar";
import { AgentSidebar } from "./components/AgentSidebar";
import { useRoute } from "./hooks/useRoute";
import { WelcomePage } from "./pages/WelcomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { CatalogPage } from "./pages/CatalogPage";
import { PublisherPage } from "./pages/PublisherPage";
import { RepoDetailPage } from "./pages/RepoDetailPage";
import "./App.css";

const AGENT_OPEN_STORAGE_KEY = "margit:agent-open";

function App() {
    const [path, navigate] = useRoute();
    const [me, setMe] = useState<Me | null>(null);
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

    if (me === null) {
        return (
            <main className="shell">
                <p className="hint">Loading…</p>
            </main>
        );
    }

    const publisherMatch = path.match(/^\/publisher\/([^/]+)$/);
    // Bare owner/name (no "/repo/" prefix) — checked after publisherMatch/catalog/profile
    // below so those reserved single-segment paths keep winning over a same-shaped repo URL.
    const repoMatch = path.match(/^\/([^/]+)\/([^/]+)$/);

    return (
        <div className="app-row">
            <main className="shell">
                <NavBar
                    path={path}
                    navigate={navigate}
                    me={me}
                    onLogout={() => logout().then(() => setMe({ authenticated: false }))}
                    agentOpen={agentOpen}
                    onToggleAgent={() => setAgentOpen((v) => !v)}
                />
                {publisherMatch ? (
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
                        highlightedRepo={highlightedRepo}
                    />
                ) : repoMatch ? (
                    <RepoDetailPage owner={repoMatch[1]} name={repoMatch[2]} listings={listings} navigate={navigate} />
                ) : (
                    <WelcomePage me={me} navigate={navigate} />
                )}
            </main>
            <AgentSidebar
                open={agentOpen}
                onClose={() => setAgentOpen(false)}
                onListingChange={handleAgentListingChange}
            />
        </div>
    );
}

export default App;
