import { useEffect, useState } from "react";
import { fetchMe, fetchRepos, githubLoginUrl, logout, type Me, type Repo } from "./api";
import "./App.css";

function App() {
    const [me, setMe] = useState<Me | null>(null);
    const [repos, setRepos] = useState<Repo[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchMe().then(setMe);
    }, []);

    useEffect(() => {
        if (!me?.authenticated) return;
        fetchRepos()
            .then(setRepos)
            .catch(() => setError("Could not load repositories."));
    }, [me]);

    if (me === null) {
        return (
            <main className="shell">
                <p>Loading…</p>
            </main>
        );
    }

    if (!me.authenticated) {
        return (
            <main className="shell">
                <div className="card">
                    <h1>margit</h1>
                    <p>Connect your GitHub account to get started.</p>
                    <a className="btn-github" href={githubLoginUrl()}>
                        Connect with GitHub
                    </a>
                </div>
            </main>
        );
    }

    return (
        <main className="shell">
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
                {error && <p className="error">{error}</p>}
                {repos === null && !error && <p>Loading repositories…</p>}
                {repos && (
                    <ul className="repo-list">
                        {repos.map((repo) => (
                            <li key={repo.id} className="repo-row">
                                <a href={repo.htmlUrl} target="_blank" rel="noreferrer">
                                    {repo.fullName}
                                </a>
                                {repo.private && <span className="badge">private</span>}
                                {repo.language && <span className="lang">{repo.language}</span>}
                                <span className="stars">★ {repo.stargazersCount}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}

export default App;
