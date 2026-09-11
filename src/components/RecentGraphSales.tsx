import { useEffect, useState } from 'react';
import type { GraphActivity } from '../../shared/graphActivity';

export function RecentGraphSales({wide = false}: {wide?: boolean}) {
    const [activity, setActivity] = useState<GraphActivity | null>(null);
    const [loading, setLoading] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        fetch('/api/activity/recent-sales', {signal: controller.signal})
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(setActivity)
            .catch(() => { if (!controller.signal.aborted) setActivity({available: false, message: 'Activity is temporarily unavailable.', sales: []}); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [revision]);
    const groups = [
        {title: 'Still in catalog', sales: activity?.sales.filter(sale => sale.inCatalog === true) ?? []},
        {title: 'No longer in catalog', sales: activity?.sales.filter(sale => sale.inCatalog !== true) ?? []},
    ];
    return <section className={wide ? "graph-sales graph-sales-wide" : "graph-sales mxd-sidebar__widget bg-base-tint radius-m"} aria-label="Recently sold">
        <div className="graph-sales-heading"><div className="widget__title"><p>Recently sold</p></div><button type="button" className="agent-icon-btn" aria-label="Refresh recent sales" title="Refresh recent sales" disabled={loading} onClick={() => setRevision(n => n + 1)}><i className={`ph ph-arrows-clockwise${loading ? " is-spinning" : ""}`} aria-hidden="true" /></button></div>
        <p className="hint">Powered by <a href="https://thegraph.com/explorer/subgraphs/DHMqTopWEHw2GuyFtwoGfH2Tizh1cskeiG7X6MTCk3Sn?view=Query" target="_blank" rel="noreferrer">The Graph ↗</a> · Arc testnet contract-checkout activity. Circle Gateway x402 purchases are not included.</p>
        {activity?.indexedBlock != null && <p className="hint">Indexed through block {activity.indexedBlock.toLocaleString()}</p>}
        {!activity ? <div className="graph-sales-loading" role="status" aria-label="Loading sales"><span className="agent-loading-spinner" aria-hidden="true" /></div> : !activity.available ? <p role="status">{activity.message}</p> : !activity.sales.length ? <p>No indexed contract sales yet.</p> :
        <div className="graph-sales-list">{groups.filter(group => group.sales.length > 0).map(group => <section key={group.title} className="graph-sales-group" aria-label={group.title}>
            {group.sales.map(sale => <article key={sale.id}>
            <div>{sale.inCatalog && sale.repository ? <a href={`/${sale.repository}`}>{sale.repository}</a> : <strong>{sale.repository ?? "Listing no longer in catalog"}</strong>}<p>{Number(sale.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {sale.currency}</p></div>
            <div><time dateTime={sale.timestamp}>{new Date(sale.timestamp).toLocaleString()}</time><p><a className="graph-transaction-link" href={`https://testnet.arcscan.app/tx/${sale.transactionHash}`} target="_blank" rel="noreferrer">Verify transaction ↗</a></p></div>
        </article>)}
        </section>)}</div>}
    </section>;
}
