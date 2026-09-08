import { sortPortfolio, type PortfolioSort, type PortfolioSortKey } from "../lib/portfolioSort";
import { resolveArcNsReverse } from "../api";
import { getContract, prepareContractCall, sendTransaction, waitForReceipt } from 'thirdweb';
import { checkoutAbi } from '../../shared/checkout';
import { moneyUnits, sellerFeeId, type FeeSummary } from '../../shared/fees';
import { useEffect, useRef, useState } from 'react';
import { useActiveAccount, useConnectModal } from 'thirdweb/react';
import { arcTestnet, thirdwebAppMetadata, thirdwebClient, thirdwebTheme, thirdwebWallets } from '../lib/thirdweb';
import type { Purchase } from '../../shared/purchase';
import { PageLoading } from '../components/PageLoading';
import { CloneResult } from '../components/CloneResult';
import '../styles/repository.css';
import '../styles/portfolio.css';
interface History {fees:FeeSummary[];wallet:string|null;seller:string|null;purchases:Purchase[];sales:Purchase[];graph?:{configured:boolean;available:boolean;ids:string[]}}
async function request<T>(path:string,body?:unknown):Promise<T> {
    const response = await fetch(`/api/portfolio${path}`, {method:body ? 'POST':'GET', credentials:'include',headers:body ? {'Content-Type':'application/json'}:undefined,body:body ? JSON.stringify(body):undefined});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Could not load portfolio');
    return result as T;
}
const purchaseDateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const relativeTimeFormat = new Intl.RelativeTimeFormat('en-US', { numeric: 'always' });
function relativePurchaseTime(createdAt: string, now: number) {
    const seconds = (Date.parse(createdAt) - now) / 1000;
    if (Math.abs(seconds) < 60) return 'Just now';
    const [divisor, unit] = Math.abs(seconds) < 3600 ? [60, 'minute'] as const : Math.abs(seconds) < 86400 ? [3600, 'hour'] as const : [86400, 'day'] as const;
    return relativeTimeFormat.format(Math.trunc(seconds / divisor), unit);
}

function PortfolioRepository({ purchase }: { purchase: Purchase }) {
    const [owner, ...nameParts] = purchase.repoFullName.split('/');
    const name = nameParts.join('/');
    const publisher = purchase.seller;
    return <>
        <div className="portfolio-repository-name">
            <a href={`/publisher/${encodeURIComponent(owner)}`} title={`View ${owner}'s catalog`}>{owner}/</a>
            <a href={`/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`}>{name}</a>
        </div>
        <small className="portfolio-repository-publisher">
            By <a href={`https://github.com/${encodeURIComponent(publisher)}`} target="_blank" rel="noopener noreferrer">
                <img src={`https://github.com/${encodeURIComponent(publisher)}.png?size=40`} width="20" height="20" alt="" loading="lazy" />
                {publisher}
            </a>
        </small>
    </>;
}

export function PortfolioPage() {
    const account = useActiveAccount();
    const connect = useConnectModal();
    const [history,setHistory] = useState<History|null>(null);
    const [tab,setTab] = useState<'purchases'|'sales'>('purchases');
    const [sort, setSort] = useState<PortfolioSort>({ key: 'date', direction: 'desc' });
    const [earningsOpen, setEarningsOpen] = useState(false);
    const [buyerNames, setBuyerNames] = useState<Record<string, string | null>>({});
    const buyerLookups = useRef(new Map<string, Promise<string | null>>());
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        if (tab !== 'sales' || !history) return;
        let active = true;
        const addresses = [...new Set(history.sales.map(purchase => purchase.buyerWallet.toLowerCase()))];
        void Promise.all(addresses.map(async address => {
            let lookup = buyerLookups.current.get(address);
            if (!lookup) {
                lookup = resolveArcNsReverse(address).catch(() => null);
                buyerLookups.current.set(address, lookup);
            }
            return [address, await lookup] as const;
        })).then(entries => { if (active) setBuyerNames(Object.fromEntries(entries)); });
        return () => { active = false; };
    }, [history, tab]);

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
    const feePaymentKey = 'margit:fee-payment:' + history?.seller?.toLowerCase();
    const pendingFee = history?.seller ? localStorage.getItem(feePaymentKey) : null;
    const settleFees = async () => {
        if (!history?.seller) return;
        setBusy(true); setError(null);
        try {
            let hash = localStorage.getItem(feePaymentKey);
            if (!hash) {
                const payment = await request<{contract:string;sellerId:`0x${string}`;amount:string}>('/fees/prepare',{});
                if (payment.sellerId !== sellerFeeId(history.seller)) throw new Error('Publisher changed. Refresh before paying.');
                if (moneyUnits(payment.amount) <= 0n) {await refresh(); return;}
                const signer = account ?? (await connect.connect({client:thirdwebClient,wallets:thirdwebWallets,chain:arcTestnet,theme:thirdwebTheme,appMetadata:thirdwebAppMetadata})).getAccount();
                if (!signer) return;
                // Check storage before broadcasting so receipt recovery can persist.
                localStorage.setItem(feePaymentKey + ':ready','1');
                const contract = getContract({client:thirdwebClient,chain:arcTestnet,address:payment.contract,abi:checkoutAbi});
                const transaction = prepareContractCall({contract,method:'payDeferredFees',params:[payment.sellerId],value:moneyUnits(payment.amount)*10n**12n});
                const sent = await sendTransaction({account:signer,transaction});
                hash = sent.transactionHash;
                localStorage.setItem(feePaymentKey,hash);
                localStorage.removeItem(feePaymentKey + ':ready');
            }
            const receipt = await waitForReceipt({client:thirdwebClient,chain:arcTestnet,transactionHash:hash as `0x${string}`});
            if (receipt.status !== 'success') {localStorage.removeItem(feePaymentKey);throw new Error('Fee payment failed.');}
            await request('/fees/confirm',{transactionHash:hash});
            localStorage.removeItem(feePaymentKey);
            await refresh();
        } catch(e){setError(e instanceof Error?e.message:'Could not settle fees');} finally {setBusy(false);}
    };
    const rows = sortPortfolio(history?.[tab] ?? [], sort, buyerNames);
    const columns: { key: PortfolioSortKey; label: string }[] = [
        { key: 'repository', label: 'Repository' }, { key: 'amount', label: 'Amount' },
        { key: 'payment', label: 'Payment' }, { key: 'date', label: 'Date' },
        tab === 'sales' ? { key: 'buyer', label: 'Buyer' } : { key: 'access', label: 'Access' },
    ];
    const changeSort = (key: PortfolioSortKey) => setSort(current => ({ key, direction: current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : key === 'date' || key === 'amount' ? 'desc' : 'asc' }));
    return <section className="repository-page portfolio-page">
        <header className="portfolio-header"><h1>My Portfolio</h1></header>
        <p className="hint">Your sales, purchases, and repository access in one place.</p>
        <div className="portfolio-toolbar">
            <div className="repository-payment-tabs" role="group" aria-label="Portfolio view">{(['purchases','sales'] as const).map(value=><button key={value} onClick={()=>{setTab(value);setAccess(null);setSort({key:'date',direction:'desc'})}} aria-pressed={tab===value}>{value==='purchases'?'Purchases':'Sales'}</button>)}</div>
        </div>
        {tab==='purchases' && history && (!history.wallet || (account && history.wallet.toLowerCase() !== account.address.toLowerCase())) && <p className="hint portfolio-verify-prompt">To view purchases for your wallet, <button type="button" className="portfolio-verify-link" disabled={busy} onClick={signIn}>{busy ? 'verifying…' : 'verify wallet ownership'}</button>.</p>}
        {history?.wallet && <p className="hint">Verified wallet: {history.wallet.slice(0,8)}…{history.wallet.slice(-6)}</p>}
        {tab==='sales' && !history?.seller && <p>Connect GitHub to view your sales. <a href="/api/auth/github/login">Connect GitHub ↗</a></p>}
        {error && <p className="error" role="alert">{error}</p>}
        {history && <div className="portfolio-totals">{(['USDC','EURC'] as const).map(currency=><span className="portfolio-total" key={currency}><img className="portfolio-token-icon" src={`/icons/${currency.toLowerCase()}.svg`} width="32" height="32" alt="" /><strong>{rows.filter(p=>p.currency===currency).reduce((sum,p)=>sum+Number(p.amount),0).toFixed(2)}</strong><span className="portfolio-total-label">{currency} {tab==='sales'?'gross sales':'spent'}</span></span>)}<span className="portfolio-total"><i className={`ph ${tab==='sales'?'ph-tag':'ph-shopping-cart'}`} aria-hidden="true" /><strong>{rows.length}</strong><span className="portfolio-total-label">{tab==='sales'?'sales':'purchases'}</span></span></div>}
        {tab==='sales' && history?.seller && <section className={`portfolio-fees${earningsOpen ? ' is-open' : ''}`} aria-labelledby="publisher-earnings-heading">
            <h3 id="publisher-earnings-heading" className="portfolio-fees-heading"><button type="button" className="portfolio-fees-summary" aria-expanded={earningsOpen} aria-controls="publisher-earnings-content" onClick={() => setEarningsOpen(open => !open)}>Publisher earnings<i className="ph ph-caret-down" aria-hidden="true" /></button></h3>
            <div id="publisher-earnings-content" className="portfolio-fees-reveal" aria-hidden={!earningsOpen} inert={!earningsOpen}><div className="portfolio-fees-clip"><div className="portfolio-fees-content">
            <p className="hint">0.5% per sale. Contract fees are collected automatically; x402 fees are paid separately. Buyers pay the listed price.</p>
            {history.fees?.map(fee=><div className="portfolio-fee-currency" key={fee.currency}>
                <h4>{fee.currency}</h4>
                <dl className="portfolio-fee-grid">
                    <div><dt>Gross sales</dt><dd>{fee.gross}</dd></div>
                    <div><dt>Net earnings</dt><dd>{fee.net}</dd></div>
                    <div><dt>Collected at checkout</dt><dd>{fee.collected}</dd></div>
                    <div><dt>x402 fees accrued</dt><dd>{fee.deferred}</dd></div>
                    <div><dt>x402 fees paid</dt><dd>{fee.paid}</dd></div>
                    <div><dt>Fees owed</dt><dd>{fee.owed}</dd></div>
                    {moneyUnits(fee.credit)>0n && <div><dt>Fee credit</dt><dd>{fee.credit}</dd></div>}
                </dl>
                {fee.currency==='USDC' && (moneyUnits(fee.owed)>0n || pendingFee) && <button className="btn btn-primary" disabled={busy} onClick={settleFees}>{busy?'Confirming…':pendingFee?'Recover fee payment':'Pay '+fee.owed+' USDC fees'}</button>}
            </div>)}
            <p className="hint">Fees apply to sales made after launch. Prior sales remain fee-free. Network gas is separate.</p>
            </div></div></div>
        </section>}
        {!history ? (error ? null : <PageLoading label="Loading portfolio…" />) : !rows.length ? <p className="hint portfolio-empty" role="status">No {tab} recorded yet. History starts with purchases made after this feature was added.</p> : <div className="portfolio-table-wrap"><table><thead><tr>{columns.map(column => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button className="portfolio-sort-button" type="button" onClick={() => changeSort(column.key)} title={column.key === 'access' ? 'Sort by access expiry' : column.key === 'amount' ? 'Sort by token amount' : `Sort by ${column.label.toLowerCase()}`}><span>{column.label}</span><i aria-hidden="true" className={`ph ${sort.key === column.key ? sort.direction === 'asc' ? 'ph-arrow-up' : 'ph-arrow-down' : 'ph-arrows-down-up'}`} /></button></th>)}</tr></thead><tbody>{rows.map(p=><tr key={p.id}>
            <td><PortfolioRepository purchase={p} /></td><td>{p.amount} {p.currency}{tab==='sales' && (p.platformFee !== undefined && moneyUnits(p.platformFee)>0n ? <small>Fee {p.platformFee} · Net {p.sellerNet}<br/>{p.feeCollection==='automatic'?'Fee collected':'Fee billed separately'}</small> : <small aria-label="No fee">—</small>)}</td><td>{p.transactionHash ? <a className="portfolio-payment-label portfolio-payment-link" href={`${arcTestnet.blockExplorers?.[0]?.url}/tx/${p.transactionHash}`} target="_blank" rel="noopener noreferrer" title="View transaction on Arc explorer"><span>{p.channel==='x402'?'x402':p.checkoutContract?'Margit checkout':'Wallet'}</span><span className="portfolio-explorer-link" aria-hidden="true">↗</span></a> : <span>{p.channel==='x402'?'x402':p.checkoutContract?'Margit checkout':'Wallet'}</span>}{p.status==='gateway_accepted' && <small>Gateway accepted</small>}<small>{p.onchainPurchaseId && history.graph?.ids.includes(p.id) ? 'Indexed by The Graph' : '—'}</small></td><td><time dateTime={p.createdAt} title={new Date(p.createdAt).toLocaleString()}>{purchaseDateFormat.format(new Date(p.createdAt))}</time><small>{relativePurchaseTime(p.createdAt, now)}</small></td>
            <td>{tab==='sales'?<><a className="portfolio-buyer-link" href={`${arcTestnet.blockExplorers?.[0]?.url}/address/${p.buyerWallet}`} target="_blank" rel="noopener noreferrer" title={`View ${p.buyerWallet} on Arc explorer`}>{buyerNames[p.buyerWallet.toLowerCase()] ?? `${p.buyerWallet.slice(0,8)}…${p.buyerWallet.slice(-6)}`}</a>{buyerNames[p.buyerWallet.toLowerCase()] && <small title={p.buyerWallet}>{`${p.buyerWallet.slice(0,8)}…${p.buyerWallet.slice(-6)}`}</small>}</>:Date.parse(p.expiresAt)<=Date.now()?'Expired':<><button className="btn btn-outline" disabled={busy} onClick={()=>openAccess(p)}>Get code</button><small>Until {new Date(p.expiresAt).toLocaleString()}{p.accessPolicy.mode==='single_download'?' · One download start':''}</small></>}</td>
        </tr>)}</tbody></table></div>}
        {access && tab==='purchases' && <div className="portfolio-access"><h3>{access.repoFullName}</h3><p className="hint">Original purchase access. Opening it does not extend expiry or reset a one-time download.</p><CloneResult key={access.id} cloneUrl={access.cloneUrl} repoFullName={access.repoFullName}/></div>}
    </section>;
}
