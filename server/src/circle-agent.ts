import { GatewayClient } from '@circle-fin/x402-batching/client';
import { parseUnits } from 'viem';
import { allowsCheckout } from '../../shared/accessPolicy.js';
import { payWithCircle } from './circle-payment.js';
import { redis } from './redis.js';
import { getListing } from './listings.js';
import { decryptToken, encryptToken } from './crypto.js';

function circleClient(key?: `0x${string}`) {
    const privateKey = key ?? process.env.ARC_DEMO_BUYER_PRIVATE_KEY;
    if (!privateKey) throw new Error('The Arc testnet demo wallet is not configured.');
    return new GatewayClient({ chain: 'arcTestnet', privateKey: privateKey as `0x${string}` });
}

export async function getCircleStatus(key?: `0x${string}`) {
    try {
        const client = circleClient(key);
        const balance = await client.getBalance();
        return { provider: 'Circle Gateway', network: 'Arc testnet', walletType: key && key !== process.env.ARC_DEMO_BUYER_PRIVATE_KEY ? 'Personal EOA' : 'Demo EOA', address: client.address,
            availableUsdc: balance.formattedAvailable, ready: balance.available > 0n };
    } catch {
        return { provider: 'Circle Gateway', network: 'Arc testnet', walletType: key && key !== process.env.ARC_DEMO_BUYER_PRIVATE_KEY ? 'Personal EOA' : 'Demo EOA', ready: false,
            error: 'Circle Gateway balance is unavailable. Check demo wallet configuration and funding.' };
    }
}

type CirclePurchase = Awaited<ReturnType<typeof payWithCircle>> & { repoFullName: string };

// Keep unresolved purchase intents locked across crashes and deployments.
export async function buyWithCircle(listingId: string, ownerLogin: string, key?: `0x${string}`): Promise<CirclePurchase> {
    const personalSuffix = key && key !== process.env.ARC_DEMO_BUYER_PRIVATE_KEY ? `:${circleClient(key).address}` : "";
    const intentKey = `margit:circle-intent:${ownerLogin.toLowerCase()}${personalSuffix}:${listingId}`;
    const existing = await redis.get<string>(intentKey);
    if (existing) {
        if (existing === 'pending') throw new Error('A Circle payment is pending review. No second payment will be sent.');
        return JSON.parse(decryptToken(existing)) as CirclePurchase;
    }
    const listing = await getListing(listingId);
    if (!listing || !allowsCheckout(listing.accessPolicy, 'x402')) throw new Error('Choose a listing that accepts x402.');
    const amount = parseUnits(listing.price.replace(/^\$/, ''), 6);
    if (amount <= 0n) throw new Error('Listing price must be positive.');
    const client = circleClient(key);
    const balance = await client.getBalance();
    if (balance.available < amount) throw new Error('Insufficient Circle Gateway testnet USDC. Fund the demo Gateway balance first.');
    const reserved = await redis.set(intentKey, 'pending', { nx: true });
    if (!reserved) throw new Error('A payment for this repository is already pending. No duplicate payment was sent.');
    let signed = false;
    try {
        const origin = process.env.APP_URL ?? 'http://localhost:5173';
        const url = new URL('/api/listings/unlock', origin);
        url.searchParams.set('id', listingId);
        const paid = await payWithCircle({ client, url: url.href, seller: listing.payoutAddress, amount,
            beforeSign: async () => {
                const current = await getListing(listingId);
                if (!current || current.price !== listing.price || current.payoutAddress !== listing.payoutAddress ||
                    JSON.stringify(current.accessPolicy) !== JSON.stringify(listing.accessPolicy)) throw new Error('Listing terms changed. Review them before purchasing.');
            },
            afterSign: async () => { signed = true; },
        });
        paid.proof.walletType = key && key !== process.env.ARC_DEMO_BUYER_PRIVATE_KEY ? 'Personal EOA' : 'Demo EOA';
        const result = { ...paid, repoFullName: listing.repoFullName };
        await redis.set(intentKey, encryptToken(JSON.stringify(result)));
        return result;
    } catch (error) {
        if (!signed) {
            await redis.del(intentKey);
        }
        // Once signed, keep the intent locked: a lost response is not proof of failure.
        throw new Error(signed ? 'Circle payment needs reconciliation. Do not pay again; the pending intent is retained.' : error instanceof Error ? error.message : 'Circle payment failed before signing.');
    }
}
