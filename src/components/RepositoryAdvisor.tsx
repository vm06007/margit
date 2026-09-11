import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './RepositoryAdvisor.css';

const advisorSuggestions = [
    ['Hackathon starter', 'A TypeScript project for a hackathon that I can quickly understand, customize, and demo. Prioritize clear functionality and identify any missing setup or licensing information.'],
    ['AI developer tool', 'A TypeScript tool that uses AI to help fix dependency vulnerabilities through GitHub pull requests.'],
    ['AI summaries', 'A tool that uses AI to summarize text or documents, with a simple interface I can adapt for my project.'],
    ['Web3 project', 'A JavaScript or TypeScript Web3 project with wallet integration that I can customize. Explain what the listing actually supports and any missing details.'],
] as const;

type Result = { output: string; recipe: string; duration_ms: number; completed_at: string };
function StructuredResult({ value, depth = 0 }: { value: unknown; depth?: number }) {
    if (value === null || value === undefined) return <span>Not provided</span>;
    if (typeof value !== 'object') return <span>{String(value)}</span>;
    if (depth > 8) return <pre>{JSON.stringify(value, null, 2)}</pre>;
    if (Array.isArray(value)) return <ul>{value.map((item, i) => <li key={i}><StructuredResult value={item} depth={depth + 1} /></li>)}</ul>;
    return <dl>{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd><StructuredResult value={item} depth={depth + 1} /></dd></div>)}</dl>;
}
function Advice({ output }: { output: string }) {
    const plain = output.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');
    try { const parsed: unknown = JSON.parse(plain); return <StructuredResult value={parsed} />; }
    catch { return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{output}</ReactMarkdown>; }
}
export function RepositoryAdvisor() {
    const [open, setOpen] = useState(false);
    const dialog = useRef<HTMLDialogElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const requirementsField = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (!open) return;
        dialog.current?.showModal();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = overflow; dialog.current?.close(); trigger.current?.focus(); };
    }, [open]);
    const [requirements, setRequirements] = useState('');
    const [budget, setBudget] = useState('50');
    const [comparisons, setComparisons] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<Result | null>(null);
    return <section className="repository-advisor" aria-label="Repository finder">
        <h3 className="advisor-card-title">Repository advisor</h3>
        <button ref={trigger} type="button" className="btn btn-default btn-small btn-accent advisor-launch" aria-haspopup="dialog" onClick={() => setOpen(true)}><span className="btn-caption">Can’t find the right repo? Find with AI</span></button>
        <div className="market-stats-footer"><a className="market-stats-link graph-transaction-link" href="https://bazantic.com" target="_blank" rel="noopener noreferrer">Powered by Bazantic ↗</a></div>
        {open && createPortal(<dialog ref={dialog} className="advisor-modal" aria-labelledby="advisor-title" aria-describedby="advisor-description" onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false); } }}>
        <div className="advisor-modal-header"><div><p className="advisor-eyebrow">Powered by Bazantic · Margit + GitHub</p><h2 id="advisor-title">Find your next repository</h2></div><button type="button" className="advisor-close" aria-label="Close repository finder" onClick={() => setOpen(false)}>×</button></div>
        <p id="advisor-description" className="advisor-intro">Tell us what you’re building. We’ll compare repositories by fit and budget.</p><form onSubmit={async event => {
            event.preventDefault(); if (busy) return;
            setBusy(true); setError(''); setResult(null);
            try {
                const response = await fetch('/api/recipe-advisor', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirements, max_budget_usd: Number(budget), ...(comparisons.trim() ? { comparison_repositories: comparisons.trim() } : {}) }), signal: AbortSignal.timeout(85_000) });
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || 'Could not retrieve advice.');
                setResult(body);
            } catch (failure) { setError(failure instanceof Error && failure.name === 'TimeoutError' ? 'The request timed out. Please try again.' : failure instanceof Error ? failure.message : 'Could not retrieve advice.'); }
            finally { setBusy(false); }
        }}>
            <label htmlFor="advisor-requirements">What do you want to build?</label><div className="advisor-suggestions" role="group" aria-label="Suggested project requirements">{advisorSuggestions.map(([label, prompt]) => <button type="button" key={label} disabled={busy} aria-pressed={requirements === prompt} onClick={() => { setRequirements(prompt); requirementsField.current?.focus(); }}>{label}</button>)}</div><textarea ref={requirementsField} id="advisor-requirements" autoFocus required minLength={10} maxLength={2000} rows={3} value={requirements} onChange={e => setRequirements(e.target.value)} placeholder="A TypeScript tool that uses AI to fix dependency vulnerabilities through GitHub pull requests." />
            <div className="advisor-fields"><div><label htmlFor="advisor-budget">Repository budget (USD)</label><input id="advisor-budget" type="number" min="0" max="1000000" step="0.01" required value={budget} onChange={e => setBudget(e.target.value)} /></div><div><label htmlFor="advisor-comparisons">Public GitHub comparisons (optional)</label><input id="advisor-comparisons" maxLength={500} value={comparisons} onChange={e => setComparisons(e.target.value)} placeholder="owner/repo, owner/another-repo" /><small>Up to three public repositories. Leave blank for catalog-only advice.</small></div></div>
            <p className="advisor-disclosure">Your request is sent to Bazantic. This researches options; it does not buy repositories. Seller claims and reuse rights still need verification.</p>
            <button className="btn btn-default btn-small btn-accent advisor-submit" disabled={busy} type="submit">{busy ? 'Comparing repositories…' : 'Get advice'}</button>
            <span role="status" aria-live="polite">{busy ? ' Usually takes 20–60 seconds.' : ''}</span>
        </form>
        {error && <p className="advisor-error" role="alert">{error}</p>}
        {result && <article className="advisor-result"><header className="advisor-result-header"><h3>Your repository matches</h3><p className="advisor-eyebrow">Powered by Bazantic · {(result.duration_ms / 1000).toFixed(1)} seconds</p></header><div className="advisor-result-body"><Advice output={result.output} /></div><footer className="advisor-result-footer"><a href="https://margit.sh/catalog" target="_blank" rel="noopener noreferrer">Browse current listings ↗</a><a href="https://bazantic.com/dashboard/recipes/margit-repository-advisor" target="_blank" rel="noopener noreferrer">View Recipe ↗</a></footer></article>}
        </dialog>, document.body)}
    </section>;
}
