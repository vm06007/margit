import {useEffect, useState} from 'react';
import type {ActivityPeriod, GraphLeaderboard, LeaderboardRow} from '../../shared/graphLeaderboard';
const explorer = 'https://thegraph.com/explorer/subgraphs/DHMqTopWEHw2GuyFtwoGfH2Tizh1cskeiG7X6MTCk3Sn?view=Query';
const short = (address: string) => `${address.slice(0,6)}…${address.slice(-4)}`;
function Volumes({values}: {values: LeaderboardRow['volumes']}) {
    return <span className="leaderboard-volumes">{values.length ? values.map(v => <span key={v.currency}><img src={`/icons/${v.currency.toLowerCase()}.svg`} alt="" />{Number(v.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:v.currency === 'cirBTC' ? 8 : 2})} {v.currency}</span>) : '—'}</span>;
}
export function LeaderboardsPage() {
    const [period,setPeriod] = useState<ActivityPeriod>('all');
    const [tab,setTab] = useState<'repos'|'buyers'|'sellers'>('repos');
    const [data,setData] = useState<GraphLeaderboard | null>(null);
    const [loading,setLoading] = useState(true);
    const [error,setError] = useState('');
    const [revision,setRevision] = useState(0);
    useEffect(()=>{
        const controller = new AbortController();
        setLoading(true); setData(null); setError('');
        fetch(`/api/activity/leaderboards?period=${period}`,{signal:controller.signal})
            .then(r=>{if(!r.ok)throw new Error('Unable to load leaderboards.');return r.json();})
            .then((result:GraphLeaderboard)=>{if (!controller.signal.aborted) setData(result);})
            .catch(()=>{if(!controller.signal.aborted)setError('Unable to reach the activity service. Try refreshing.');})
            .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
        return ()=>controller.abort();
    },[period,revision]);
    const rows = data?.[tab] ?? [];
    const peak = Math.max(1,...(data?.daily.map(d=>d.purchases) ?? []));
    return <div className="leaderboard-page mxd-container">
        <header className="leaderboard-intro">
            <p className="leaderboard-eyebrow">Market activity · Arc testnet</p>
            <h1>Leaderboards</h1>
            <p>Discover the most purchased repos and the wallets behind their sales.</p>
            <a href={explorer} target="_blank" rel="noreferrer">Powered by The Graph ↗</a>
        </header>
        <div className="leaderboard-toolbar">
            <div className="leaderboard-switch" role="group" aria-label="Activity period">{([['all','Indexed history'],['30d','Last 30 days'],['7d','Last 7 days']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={period===value} onClick={()=>setPeriod(value)}>{label}</button>)}</div>
            <button className="btn btn-default btn-outline btn-small" disabled={loading} onClick={()=>setRevision(n=>n+1)}><i className="ph ph-arrows-clockwise" aria-hidden="true" /> Refresh</button>
        </div>
        <p className="leaderboard-coverage">Contract-checkout purchases only. Circle Gateway x402 purchases are excluded. Rankings count purchases, not project quality. Buyer and seller identities are public wallet addresses.</p>
        {loading ? <div className="leaderboard-loading" role="status" aria-label="Loading leaderboards"><span className="agent-loading-spinner" aria-hidden="true" /></div> : error || !data?.available ? <div className="leaderboard-panel" role="status">{error || data?.message || 'The Graph is unavailable.'}</div> : <>
            <div className="leaderboard-metrics">{[['Purchases',data.purchases],['Buyer wallets',data.uniqueBuyers],['Seller wallets',data.uniqueSellers],['Repositories sold',data.repositories]].map(([label,value])=><div className="leaderboard-panel" key={label}><span>{label}</span><strong>{Number(value).toLocaleString()}</strong></div>)}</div>
            <div className="leaderboard-panel leaderboard-volume-panel"><div><h2>Gross sales volume</h2><p>Each currency shown separately, before fees.</p></div><Volumes values={data.volumes} /></div>
            <section className="leaderboard-panel">
                <div className="leaderboard-chart-heading"><h2>Purchase activity</h2><span>Last 30 UTC calendar days · selected period</span></div>
                <div className="leaderboard-chart" role="img" aria-label={`Purchase activity: ${data.daily.map(d=>`${d.date}: ${d.purchases}`).join('; ')}`}>
                    {data.daily.map(d=><div key={d.date} className="leaderboard-chart-column" title={`${d.date}: ${d.purchases} purchases`}><span style={{height:`${d.purchases/peak*100}%`,minHeight:d.purchases ? '4px' : '2px',opacity:d.purchases ? 1 : .15}} /></div>)}
                </div>
                <div className="leaderboard-chart-axis"><span>{data.daily[0]?.date}</span><span>{data.daily.at(-1)?.date}</span></div>
            </section>
            <section className="leaderboard-panel">
                <div className="leaderboard-switch" role="group" aria-label="Leaderboard type">{([['repos','Top repos'],['buyers','Top buyers'],['sellers','Top sellers']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>setTab(value)}>{label}</button>)}</div>
                <p className="leaderboard-coverage">Ranked by purchase count, then unique {tab==='buyers'?'seller':'buyer'} wallets. Showing up to 20 entries.</p>
                {!rows.length ? <p className="leaderboard-empty">No indexed purchases in this period.</p> : <div className="leaderboard-rows">{rows.slice(0,20).map((row,i)=><article className="leaderboard-row" key={row.id}>
                    <span className="leaderboard-rank">{String(i+1).padStart(2,'0')}</span>
                    <div className="leaderboard-identity">{tab==='repos' ? row.name && row.inCatalog ? <a href={`/${row.name}`}>{row.name}</a> : <span>{row.name ?? 'Listing no longer in catalog'}</span> : <a title={row.id} href={`https://testnet.arcscan.app/address/${row.id}`} target="_blank" rel="noreferrer">{short(row.id)} ↗</a>}
                        <small>{row.uniqueCounterparties} unique {tab==='buyers'?'seller':'buyer'} {row.uniqueCounterparties===1?'wallet':'wallets'}{tab==='repos' && !row.inCatalog && row.name ? ' · No longer listed' : ''}</small>
                    </div>
                    <div className="leaderboard-count"><strong>{row.purchases}</strong><small>{row.purchases===1?'purchase':'purchases'}</small></div>
                    <Volumes values={row.volumes} />
                    <a className="leaderboard-evidence" href={`https://testnet.arcscan.app/tx/${row.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`Verify a transaction for rank ${i+1}`}>Verify ↗</a>
                </article>)}</div>}
            </section>
            <p className="leaderboard-coverage">{data.capped ? 'Limited sample: latest 1,000 indexed purchases. Older sales may change these rankings.' : `${data.sampleSize} indexed purchase events examined.`} {data.indexedBlock != null && <>Indexed through <a href={`https://testnet.arcscan.app/block/${data.indexedBlock}`} target="_blank" rel="noreferrer">block {data.indexedBlock.toLocaleString()}</a>.</>} Retrieved {new Date(data.generatedAt).toLocaleString()}.</p>
            <div className="leaderboard-toolbar"><a href="/catalog" className="btn btn-default btn-accent">Browse catalog ↗</a><a href={`/api/activity/leaderboards?period=${period}`} target="_blank" rel="noreferrer">View source data ↗</a></div>
        </>}
    </div>;
}
