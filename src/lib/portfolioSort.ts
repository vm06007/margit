import type { Purchase } from '../../shared/purchase';
import { moneyUnits } from '../../shared/fees';

export type PortfolioSortKey = 'repository' | 'amount' | 'payment' | 'date' | 'buyer' | 'access';
export interface PortfolioSort { key: PortfolioSortKey; direction: 'asc' | 'desc' }
export const paymentLabel = (purchase: Purchase) => purchase.channel === 'x402' ? 'x402' : purchase.checkoutContract ? 'Margit checkout' : 'Wallet';
const compareText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

export function sortPortfolio(rows: Purchase[], sort: PortfolioSort, buyerNames: Record<string, string | null>) {
    return [...rows].sort((a, b) => {
        let result = 0;
        switch (sort.key) {
            case 'repository': result = compareText(a.repoFullName, b.repoFullName); break;
            case 'payment': result = compareText(paymentLabel(a), paymentLabel(b)); break;
            case 'date': result = Date.parse(a.createdAt) - Date.parse(b.createdAt); break;
            case 'access': result = Date.parse(a.expiresAt) - Date.parse(b.expiresAt); break;
            case 'buyer': result = compareText(buyerNames[a.buyerWallet.toLowerCase()] ?? a.buyerWallet, buyerNames[b.buyerWallet.toLowerCase()] ?? b.buyerWallet); break;
            case 'amount': {
                const left = moneyUnits(a.amount), right = moneyUnits(b.amount);
                result = left < right ? -1 : left > right ? 1 : compareText(a.currency, b.currency);
                break;
            }
        }
        return (sort.direction === 'asc' ? result : -result) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || compareText(a.id, b.id);
    });
}
