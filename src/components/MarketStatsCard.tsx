import { useEffect, useState } from 'react';
import type { GraphLeaderboard } from '../../shared/graphLeaderboard';

export function MarketStatsCard() {
    const [data, setData] = useState<GraphLeaderboard | null>(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/activity/leaderboards?period=all', { signal: controller.signal })
            .then(response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
            .then((result: GraphLeaderboard) => { if (!controller.signal.aborted) setData(result); })
            .catch(() => {})
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, []);
    return <section className="mxd-sidebar__widget bg-base-tint radius-m market-stats-card" aria-label="Catalog statistics">
        <div className="widget__title"><p>Catalog statistics</p></div>
        {loading ? <div className="market-stats-loading" role="status" aria-label="Loading catalog statistics"><span className="agent-loading-spinner" aria-hidden="true" /></div> : data?.available ? <dl className="market-stats-grid">
            {([['Purchases', data.purchases], ['Repos sold', data.repositories], ['Buyer wallets', data.uniqueBuyers], ['Seller wallets', data.uniqueSellers]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}
        </dl> : <p className="t-small">Statistics are temporarily unavailable.</p>}
        <p className="market-stats-note">Powered by The Graph · Arc testnet<br />Contract checkouts · <a className="graph-transaction-link" href="https://thegraph.com/explorer/subgraphs/DHMqTopWEHw2GuyFtwoGfH2Tizh1cskeiG7X6MTCk3Sn?view=Query" target="_blank" rel="noreferrer">Check subgraph ↗</a>{data?.capped && <><br />Latest 1,000 purchases.</>}</p>
        <div className="market-stats-footer"><a className="market-stats-link graph-transaction-link" href="/leaderboards">View all statistics ↗</a></div>
    </section>;
}
