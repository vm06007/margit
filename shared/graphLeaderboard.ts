import { formatUnits, parseUnits } from 'viem';
import { PAYMENT_TOKENS, TOKEN_DECIMALS, type PaymentToken } from './paymentTokens.js';
import type { GraphActivity } from './graphActivity.js';

export type ActivityPeriod = 'all' | '30d' | '7d';
export interface LeaderboardRow {
    id: string;
    name?: string;
    inCatalog?: boolean;
    purchases: number;
    uniqueCounterparties: number;
    volumes: {currency: PaymentToken; amount: string}[];
    transactionHash: string;
}
export interface GraphLeaderboard {
    available: boolean;
    message?: string;
    indexedBlock?: number;
    period: ActivityPeriod;
    sampleSize: number;
    capped: boolean;
    purchases: number;
    uniqueBuyers: number;
    uniqueSellers: number;
    repositories: number;
    volumes: LeaderboardRow['volumes'];
    buyers: LeaderboardRow[];
    sellers: LeaderboardRow[];
    repos: LeaderboardRow[];
    daily: {date: string; purchases: number}[];
    generatedAt: string;
}

/** Count events once and keep token amounts separate using integer arithmetic. */
export function buildGraphLeaderboard(activity: GraphActivity, period: ActivityPeriod = 'all', now = Date.now()): GraphLeaderboard {
    const cutoff = period === 'all' ? 0 : now - (period === '7d' ? 7 : 30) * 86400000;
    const seen = new Set<string>();
    const sales = activity.sales.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        const time = Date.parse(s.timestamp);
        return Number.isFinite(time) && time >= cutoff && time <= now;
    });
    type Group = {row: LeaderboardRow; counterparties: Set<string>; amounts: Map<PaymentToken, bigint>};
    const buyers = new Map<string, Group>(), sellers = new Map<string, Group>(), repos = new Map<string, Group>();
    const amounts = new Map<PaymentToken, bigint>();
    const addAmount = (totals: Map<PaymentToken, bigint>, sale: GraphActivity['sales'][number]) => {
        if (!(PAYMENT_TOKENS as readonly string[]).includes(sale.currency)) return;
        const currency = sale.currency as PaymentToken;
        totals.set(currency, (totals.get(currency) ?? 0n) + parseUnits(sale.amount, TOKEN_DECIMALS[currency]));
    };
    const volumes = (totals: Map<PaymentToken, bigint>) => PAYMENT_TOKENS.filter(c => totals.has(c)).map(currency => ({currency, amount: formatUnits(totals.get(currency)!, TOKEN_DECIMALS[currency])}));
    const daily = Array.from({length: 30}, (_, i) => ({date: new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - (29-i)*86400000).toISOString().slice(0,10), purchases: 0}));
    for (const sale of sales) {
        addAmount(amounts, sale);
        const day = daily.find(d => d.date === sale.timestamp.slice(0,10));
        if (day) day.purchases++;
        for (const [map, id, counterparty] of [[buyers,sale.buyer.toLowerCase(),sale.seller.toLowerCase()], [sellers,sale.seller.toLowerCase(),sale.buyer.toLowerCase()], [repos,sale.listingId.toLowerCase(),sale.buyer.toLowerCase()]] as const) {
            const group = map.get(id) ?? {row: {id, ...(map === repos ? {name:sale.repository,inCatalog:sale.inCatalog} : {}), purchases:0,uniqueCounterparties:0,volumes:[],transactionHash:sale.transactionHash}, counterparties:new Set<string>(),amounts:new Map<PaymentToken,bigint>()};
            group.row.purchases++;
            group.counterparties.add(counterparty);
            addAmount(group.amounts, sale);
            map.set(id, group);
        }
    }
    const ranked = (map: Map<string, Group>) => [...map.values()].map(g => ({...g.row,uniqueCounterparties:g.counterparties.size,volumes:volumes(g.amounts)})).sort((a,b)=>b.purchases-a.purchases || b.uniqueCounterparties-a.uniqueCounterparties || a.id.localeCompare(b.id));
    return {available:activity.available,message:activity.message,indexedBlock:activity.indexedBlock,period,sampleSize:seen.size,capped:activity.sales.length>=1000,purchases:sales.length,uniqueBuyers:buyers.size,uniqueSellers:sellers.size,repositories:repos.size,volumes:volumes(amounts),buyers:ranked(buyers),sellers:ranked(sellers),repos:ranked(repos),daily,generatedAt:new Date(now).toISOString()};
}
