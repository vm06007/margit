import type { GraphActivity } from './graphActivity.js';
export function rankGraphSales(sales: GraphActivity['sales']) {
    const repos = new Map<string, {listingId: string; repository?: string; sales: number; buyers: Set<string>; transactionHash: string}>();
    const seen = new Set<string>();
    for (const sale of sales) {
        if (seen.has(sale.id)) continue;
        seen.add(sale.id);
        const key = sale.listingId.toLowerCase();
        const repo = repos.get(key) ?? {listingId: key, repository: sale.repository, sales: 0, buyers: new Set<string>(), transactionHash: sale.transactionHash};
        repo.sales++;
        repo.buyers.add(sale.buyer.toLowerCase());
        repos.set(key, repo);
    }
    return [...repos.values()].map(({buyers, ...repo}) => ({...repo, uniqueBuyers: buyers.size}))
        .sort((a,b) => b.sales-a.sales || b.uniqueBuyers-a.uniqueBuyers || a.listingId.localeCompare(b.listingId));
}
export interface GraphBestsellers {
    available: boolean;
    message?: string;
    indexedBlock?: number;
    sampleSize: number;
    capped: boolean;
    rankings: ReturnType<typeof rankGraphSales>;
}
