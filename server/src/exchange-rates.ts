import { parseUnits } from 'viem';
import { priceToAtomicUnits, type PaymentToken } from './payments.js';

const RATE_URL = 'https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ECB';
const MAX_RATE_AGE = 7 * 24 * 60 * 60 * 1000;
let cached: { rate: number; date: string; fetchedAt: number } | undefined;
let pending: Promise<{ rate: number; date: string; fetchedAt: number }> | undefined;

export function convertUsdToEur(usdUnits: bigint, rate: number): bigint {
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) throw new TypeError('Invalid USD/EUR exchange rate');
    const scaledRate = parseUnits(rate.toFixed(12), 12);
    return (usdUnits * scaledRate + 500_000_000_000n) / 1_000_000_000_000n;
}

async function exchangeRate() {
    if (cached && Date.now() - cached.fetchedAt < 60 * 60 * 1000 && Date.now() - Date.parse(cached.date) <= MAX_RATE_AGE) return cached;
    if (!pending) {
        pending = (async () => {
            const response = await fetch(RATE_URL, { signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new TypeError('EURC exchange rate is unavailable. Try again or use USDC.');
            const data = await response.json() as { base: string; quote: string; rate: number; date: string };
            const timestamp = Date.parse(data.date);
            if (data.base !== 'USD' || data.quote !== 'EUR' || !Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() - timestamp > MAX_RATE_AGE) throw new TypeError('EURC exchange rate is out of date. Try again or use USDC.');
            convertUsdToEur(1_000_000n, data.rate);
            cached = { rate: data.rate, date: data.date, fetchedAt: Date.now() };
            return cached;
        })().finally(() => { pending = undefined; });
    }
    return pending;
}

export async function checkoutPrice(price: string, currency: PaymentToken) {
    const usdAmount = priceToAtomicUnits(price);
    if (currency === 'USDC') return { amount: usdAmount.toString(), currency };
    const rate = await exchangeRate();
    const amount = convertUsdToEur(usdAmount, rate.rate);
    if (amount <= 0n) throw new TypeError('Listing price is too small for EURC checkout.');
    return { amount: amount.toString(), currency, rate: rate.rate, rateDate: rate.date };
}
