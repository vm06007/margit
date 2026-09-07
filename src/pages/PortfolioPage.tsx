import { useEffect, useState } from 'react';
import { useActiveAccount, useConnectModal } from 'thirdweb/react';
import { arcTestnet, thirdwebAppMetadata, thirdwebClient, thirdwebTheme, thirdwebWallets } from '../lib/thirdweb';
import type { Purchase } from '../../shared/purchase';
import { CloneResult } from '../components/CloneResult';
import '../styles/repository.css';
import '../styles/portfolio.css';
interface History {wallet:string|null;seller:string|null;purchases:Purchase[];sales:Purchase[];graph?:{configured:boolean;available:boolean;ids:string[]}}
async function request<T>(path:string,body?:unknown):Promise<T> {
    const response = await fetch(`/api/portfolio${path}`, {method:body ? 'POST':'GET', credentials:'include',headers:body ? {'Content-Type':'application/json'}:undefined,body:body ? JSON.stringify(body):undefined});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Could not load portfolio');
    return result as T;
}
export function PortfolioPage() {
    const account = useActiveAccount();
    const connect = useConnectModal();
    const [history,setHistory] = useState<History|null>(null);
    const [tab,setTab] = useState<'purchases'|'sales'>('purchases');
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState<string|null>(null);
    const [access,setAccess] = useState<{id:string;cloneUrl:string;repoFullName:string}|null>(null);
    const refresh = () => request<History>('').then(setHistory);
    useEffect(() => { let active = true; request<History>('').then(data => {if(active)setHistory(data)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}; },[]);
    const signIn = async () => {
        setBusy(true);setError(null);setAccess(null);
        try {
            const signer = account ?? (await connect.connect({client:thirdwebClient,wallets:thirdwebWallets,chain:arcTestnet,theme:thirdwebTheme,appMetadata:thirdwebAppMetadata})).getAccount();
            if (!signer) return;
            const {message} = await request<{message:string}>('/challenge',{address:signer.address});
            const signature = await signer.signMessage({message});
            await request('/verify',{signature}); await refresh();
        } catch(e) {setError(e instanceof Error ? e.message:'Wallet sign-in failed')} finally {setBusy(false)}
    };
    const openAccess = async (purchase:Purchase) => {
        setBusy(true);setError(null);
        try {setAccess({id:purchase.id,...await request<{cloneUrl:string;repoFullName:string}>(`/${purchase.id}/access`)});} catch(e){setError(e instanceof Error?e.message:'Could not load access')}finally{setBusy(false)}
    };
    const rows = history?.[tab] ?? [];
    return <section className="repository-page portfolio-page">
        <header className="portfolio-header"><h1>My Portfolio</h1></header>
        <p className="hint">Your sales, purchases, and repository access in one place.</p>
        <div className="portfolio-toolbar">
            <div className="repository-payment-tabs" role="group" aria-label="Portfolio view">{(['purchases','sales'] as const).map(value=><button key={value} onClick={()=>{setTab(value);setAccess(null)}} aria-pressed={tab===value}>{value==='purchases'?'Purchases':'Sales'}</button>)}</div>
        </div>
        {tab==='purchases' && history && (!history.wallet || (account && history.wallet.toLowerCase() !== account.address.toLowerCase())) && <p className="hint">To view purchases for your wallet, <button type="button" className="portfolio-verify-link" disabled={busy} onClick={signIn}>{busy ? 'verifying…' : 'verify wallet ownership'}</button>.</p>}
        {history?.wallet && <p className="hint">Verified wallet: {history.wallet.slice(0,8)}…{history.wallet.slice(-6)}</p>}
        {tab==='sales' && !history?.seller && <p>Connect GitHub to view your sales. <a href="/api/auth/github/login">Connect GitHub ↗</a></p>}
        {error && <p className="error" role="alert">{error}</p>}
        {history && <div className="portfolio-totals"><span><strong>{rows.length}</strong> {tab==='sales'?'sales':'purchases'}</span>{(['USDC','EURC'] as const).map(currency=><span key={currency}><strong>{rows.filter(p=>p.currency===currency).reduce((sum,p)=>sum+Number(p.amount),0).toFixed(2)}</strong> {currency} {tab==='sales'?'earned':'spent'}</span>)}</div>}
        {!history ? <p role="status">Loading portfolio…</p> : !rows.length ? <p className="hint">No {tab} recorded yet. History starts with purchases made after this feature was added.</p> : <div className="portfolio-table-wrap"><table><thead><tr><th>Repository</th><th>Amount</th><th>Payment</th><th>Date</th><th>{tab==='sales'?'Buyer':'Access'}</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}>
            <td><a href={`/${p.repoFullName}`}>{p.repoFullName}</a></td><td>{p.amount} {p.currency}</td><td><div className="portfolio-payment-label"><span>{p.channel==='x402'?'x402':p.checkoutContract?'Margit checkout':'Wallet'}</span>{p.transactionHash && <a className="portfolio-explorer-link" href={`${arcTestnet.blockExplorers?.[0]?.url}/tx/${p.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`View transaction for ${p.repoFullName} on Arc explorer`} title="View transaction on Arc explorer">↗</a>}</div>{p.status==='gateway_accepted' && <small>Gateway accepted</small>}{p.onchainPurchaseId && <small>{history.graph?.ids.includes(p.id) ? 'Indexed by The Graph' : history.graph?.configured ? history.graph.available ? 'Awaiting indexer' : 'Indexer temporarily unavailable' : 'Graph indexing not configured'}</small>}</td><td>{new Date(p.createdAt).toLocaleDateString()}</td>
            <td>{tab==='sales'?`${p.buyerWallet.slice(0,8)}…${p.buyerWallet.slice(-6)}`:Date.parse(p.expiresAt)<=Date.now()?'Expired':<><button className="btn btn-outline" disabled={busy} onClick={()=>openAccess(p)}>Get code</button><small>Until {new Date(p.expiresAt).toLocaleString()}{p.accessPolicy.mode==='single_download'?' · One download start':''}</small></>}</td>
        </tr>)}</tbody></table></div>}
        {access && tab==='purchases' && <div className="portfolio-access"><h3>{access.repoFullName}</h3><p className="hint">Original purchase access. Opening it does not extend expiry or reset a one-time download.</p><CloneResult key={access.id} cloneUrl={access.cloneUrl} repoFullName={access.repoFullName}/></div>}
    </section>;
}
