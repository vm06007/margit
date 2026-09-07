import type { MouseEvent } from "react";
import type { Listing } from "../api";
import { SimplePost } from "./CatalogPage";
import { StarRating } from "../components/StarRating";
import { ReviewsSection } from "../components/ReviewsSection";
import "../styles/repository.css";

export function PublisherPage({ login, listings, navigate }: {login:string; listings:Listing[] | null; navigate:(p:string)=>void}) {
    const repos = (listings ?? []).filter(l => l.ownerLogin.toLowerCase() === login.toLowerCase());
    const goTo = (path:string) => (e:MouseEvent) => {if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(path)};
    return <section className="repository-page publisher-page">
        <div className="repository-meta"><a href="/catalog">Catalog</a><span>/</span><span>Publisher</span></div>
        <header className="publisher-headline"><img src={`https://github.com/${encodeURIComponent(login)}.png?size=240`} alt="" /><div><p className="repository-eyebrow">Publisher on Margit</p><h1>{login}</h1><a className="publisher-github" href={`https://github.com/${encodeURIComponent(login)}`} target="_blank" rel="noreferrer">View GitHub profile ↗</a></div></header>
        <div className="publisher-stats"><span><strong>{listings === null ? "—" : repos.length}</strong> listed repositories</span><div className="publisher-overall-rating"><span>Overall rating</span><StarRating average={0} count={0} /></div></div>
        <h2 className="publisher-repositories-title">Repositories</h2>
        {listings === null ? <p>Loading repositories…</p> : repos.length === 0 ? <p>No repositories listed by this publisher yet.</p> : <div className="publisher-repositories">{repos.map((listing,i) => <SimplePost key={listing.id} listing={listing} altIndex={i} goTo={goTo} />)}</div>}
        <ReviewsSection subject={login} />
    </section>;
}
