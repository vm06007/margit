import { redis } from "./redis.js";
import { purchaseId } from "./purchases.js";
import type { Purchase } from '../../shared/purchase.js';
/** Optional indexer enrichment. Never use Graph availability as a delivery authorization gate. */
export async function indexedPurchases(purchases:Purchase[]):Promise<{configured:boolean;available:boolean;ids:string[]}> {
    const endpoint=process.env.GRAPH_QUERY_URL;
    if(!endpoint)return {configured:false,available:false,ids:[]};
    const receipts=purchases.filter(p=>p.checkoutContract&&p.onchainPurchaseId);
    if(!receipts.length)return {configured:true,available:true,ids:[]};
    try {
        const ids:string[]=[];
        for(let i=0;i<receipts.length;i+=100){
            const chunk=receipts.slice(i,i+100);
            const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.GRAPH_QUERY_API_KEY?{Authorization:`Bearer ${process.env.GRAPH_QUERY_API_KEY}`}:{})},body:JSON.stringify({query:'query Receipts($ids: [Bytes!]!) { purchases(first: 100, where: {purchaseId_in: $ids}) { purchaseId transactionHash } }',variables:{ids:chunk.map(p=>p.onchainPurchaseId)}}),signal:AbortSignal.timeout(4000)});
            if(!response.ok)throw new Error('Indexer unavailable');
            const result=await response.json() as {errors?:unknown;data?:{purchases:{purchaseId:string;transactionHash:string}[]}};
            if(result.errors||!result.data)throw new Error('Indexer query failed');
            for(const receipt of chunk)if(result.data.purchases.some(p=>p.purchaseId.toLowerCase()===receipt.onchainPurchaseId!.toLowerCase()&&p.transactionHash.toLowerCase()===receipt.transactionHash?.toLowerCase()))ids.push(receipt.id);
        }
        return {configured:true,available:true,ids};
    }catch{return {configured:true,available:false,ids:[]};}
}

import { formatUnits, keccak256, stringToHex } from 'viem';
import { ARC_TOKEN_ADDRESSES, TOKEN_DECIMALS, type PaymentToken } from '../../shared/paymentTokens.js';
import type { GraphActivity } from '../../shared/graphActivity.js';
import { listListings } from './listings.js';

/** Public contract events only; Circle Gateway transfers are not indexed here. */
export async function recentGraphSales(limit: 20 | 1000 = 20): Promise<GraphActivity> {
    const endpoint = process.env.GRAPH_QUERY_URL;
    if (!endpoint) return {available: false, message: 'The Graph endpoint is not configured.', sales: []};
    try {
        const response = await fetch(endpoint, {
            method: 'POST', headers: {'Content-Type': 'application/json', ...(process.env.GRAPH_QUERY_API_KEY ? {Authorization: `Bearer ${process.env.GRAPH_QUERY_API_KEY}`} : {})},
            body: JSON.stringify({query: `{ _meta { block { number } hasIndexingErrors } purchases(first: ${limit}, orderBy: timestamp, orderDirection: desc) { id purchaseId listingId buyer seller token amount transactionHash timestamp } }`}),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error('Query failed');
        const result = await response.json() as {errors?: unknown; data?: {purchases: Record<string, string>[]; _meta?: {hasIndexingErrors: boolean; block: {number: number}}}};
        if (result.errors || !Array.isArray(result.data?.purchases) || result.data._meta?.hasIndexingErrors) throw new Error('Index unavailable');
        const listings = await listListings();
        const names = new Map(listings.map(l => [keccak256(stringToHex(l.id)).toLowerCase(), l.repoFullName]));
        const historicalNames = new Map<string, string>();
        const contract = process.env.CHECKOUT_CONTRACT_ADDRESS;
        if (contract) {
            const missing = result.data!.purchases.filter(p => !names.has(p.listingId.toLowerCase()) && /^0x[0-9a-f]{64}$/i.test(p.purchaseId));
            for (let i = 0; i < missing.length; i += 50) {
                await Promise.all(missing.slice(i, i + 50).map(async p => {
                    const record = await redis.get<Purchase>(`margit:purchase:${purchaseId(`checkout:${contract}:${p.purchaseId}`)}`);
                    if (record && record.transactionHash?.toLowerCase() === p.transactionHash.toLowerCase() && keccak256(stringToHex(record.listingId)).toLowerCase() === p.listingId.toLowerCase()) historicalNames.set(p.listingId.toLowerCase(), record.repoFullName);
                }));
            }
        }
        const sales = result.data!.purchases.map((p: Record<string, string>) => {
            if (!/^0x[0-9a-f]{64}$/i.test(p.transactionHash) || !/^0x[0-9a-f]{40}$/i.test(p.buyer) || !/^0x[0-9a-f]{40}$/i.test(p.seller) || !/^\d+$/.test(p.amount) || !/^\d+$/.test(p.timestamp)) throw new Error('Invalid event');
            const currency = (Object.keys(ARC_TOKEN_ADDRESSES) as PaymentToken[]).find(t => ARC_TOKEN_ADDRESSES[t].toLowerCase() === p.token.toLowerCase());
            return {id: p.id, repository: names.get(p.listingId.toLowerCase()) ?? historicalNames.get(p.listingId.toLowerCase()), inCatalog: names.has(p.listingId.toLowerCase()), listingId: p.listingId, buyer: p.buyer, seller: p.seller, amount: currency ? formatUnits(BigInt(p.amount), TOKEN_DECIMALS[currency]) : p.amount, currency: currency ?? `${p.token} (raw units)`, transactionHash: p.transactionHash, timestamp: new Date(Number(p.timestamp) * 1000).toISOString()};
        });
        return {available: true, indexedBlock: result.data!._meta?.block?.number, sales};
    } catch { return {available: false, message: 'The Graph activity is temporarily unavailable.', sales: []}; }
}

import { rankGraphSales, type GraphBestsellers } from '../../shared/graphBestsellers.js';
export async function graphBestsellers(): Promise<GraphBestsellers> {
    const activity = await recentGraphSales(1000);
    return {available: activity.available, message: activity.message, indexedBlock: activity.indexedBlock,
        sampleSize: activity.sales.length, capped: activity.sales.length === 1000,
        rankings: rankGraphSales(activity.sales)};
}

import { buildGraphLeaderboard, type ActivityPeriod } from '../../shared/graphLeaderboard.js';
export async function graphLeaderboard(period: ActivityPeriod = 'all') {
    return buildGraphLeaderboard(await recentGraphSales(1000), period);
}
