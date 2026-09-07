import { useMemo, useState } from "react";
import type { Listing, Me, Repo } from "../api";
import { RepoCard, RepoGroup, RepoRow } from "../components/RepoCard";
import { ViewToggle } from "../components/ListingCard";
import { WelcomePage } from "./WelcomePage";

export function DashboardPage({
    me,
    repos,
    reposError,
    listingByRepo,
    onListed,
    onUnlisted,
    onMadePrivate,
    navigate,
    highlightedRepo,
}: {
    me: Me;
    repos: Repo[] | null;
    reposError: string | null;
    listingByRepo: Map<string, Listing>;
    onListed: (listing: Listing) => void;
    onUnlisted: (listingId: string) => void;
    onMadePrivate: (repoId: number) => void;
    navigate: (p: string) => void;
    highlightedRepo?: string | null;
}) {
    const [filter, setFilter] = useState("");
    const [view, setView] = useState<"cards" | "list">("cards");

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

    const renderRow = (repo: Repo) => {
        const commonProps = {
            repo,
            listing: listingByRepo.get(repo.fullName),
            onListed,
            onUnlisted,
            onMadePrivate,
            navigate,
            highlighted: highlightedRepo?.toLowerCase() === repo.fullName.toLowerCase(),
        };
        return view === "list" ? (
            <RepoRow key={repo.id} {...commonProps} />
        ) : (
            <RepoCard key={repo.id} {...commonProps} />
        );
    };

    return (
        <section>
            <div className="catalog-header">
                <h2>Your repositories</h2>
                {repos && repos.length > 0 && <ViewToggle view={view} setView={setView} />}
            </div>
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

                    <RepoGroup label="Private" repos={privateRepos} view={view}>
                        {renderRow}
                    </RepoGroup>

                    <RepoGroup label="Public" repos={publicRepos} view={view}>
                        {renderRow}
                    </RepoGroup>

                    {orgGroups.map(([org, orgRepos]) => (
                        <RepoGroup key={org} label={org} repos={orgRepos} view={view}>
                            {renderRow}
                        </RepoGroup>
                    ))}
                </>
            )}
        </section>
    );
}
