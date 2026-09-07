import { createHash } from 'node:crypto';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';
import { parseAccessPolicy } from '../../shared/accessPolicy.js';
import type { Purchase } from '../../shared/purchase.js';
import type { Listing } from './listings.js';
export interface PaymentRecord {
    reference: string;
    buyerWallet: string;
    currency: 'USDC' | 'EURC';
    channel: 'wallet' | 'x402';
    transactionHash?: string;
    operatorSession?: string;
    checkoutContract?: string;
    onchainPurchaseId?: string;
    purchasedAt?: number;
}
interface StoredPurchase extends Purchase { encryptedAccessUrl: string; operatorSession?: string }
export const purchaseId = (reference: string) => createHash('sha256').update(`arc-testnet:${reference.toLowerCase()}`).digest('hex');
export async function recordPurchase(listing: Listing, payment: PaymentRecord, access: { cloneUrl: string; expiresAt: string }) {
    const id = purchaseId(payment.reference);
    const record: StoredPurchase = {
        id, listingId: listing.id, repoFullName: listing.repoFullName, seller: listing.ownerLogin.toLowerCase(), buyerWallet: payment.buyerWallet.toLowerCase(),
        amount: listing.price.replace('$', ''), currency: payment.currency, channel: payment.channel,
        status: payment.channel === 'x402' ? 'gateway_accepted' : 'confirmed', transactionHash: payment.transactionHash,
        createdAt: new Date(payment.purchasedAt ?? Date.now()).toISOString(), expiresAt: access.expiresAt, accessPolicy: parseAccessPolicy(listing.accessPolicy),
        checkoutContract: payment.checkoutContract, onchainPurchaseId: payment.onchainPurchaseId,
        encryptedAccessUrl: encryptToken(access.cloneUrl), operatorSession: payment.operatorSession,
    };
    await redis.set(`margit:purchase:${id}`, record, { nx: true });
    const saved = await redis.get<StoredPurchase>(`margit:purchase:${id}`);
    if (!saved) throw new Error('Could not persist purchase');
    // Repeat safely if a previous write succeeded but indexing was interrupted.
    await redis.sadd(`margit:purchases:buyer:${saved.buyerWallet}`, id);
    await redis.sadd(`margit:purchases:seller:${saved.seller}`, id);
    if (saved.operatorSession) await redis.sadd(`margit:purchases:operator:${saved.operatorSession}`, id);
    return id;
}
export async function listPurchaseHistory(kind: 'buyer' | 'seller' | 'operator', identity: string): Promise<Purchase[]> {
    const ids = await redis.smembers(`margit:purchases:${kind}:${identity}`);
    const records = await Promise.all(ids.map(id => redis.get<StoredPurchase>(`margit:purchase:${id}`)));
    return records.filter((item): item is StoredPurchase => !!item).map(({ encryptedAccessUrl: _url, operatorSession: _operator, ...item }) => item).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getPurchaseAccess(id: string, wallet?: string, operator?: string) {
    const record = await redis.get<StoredPurchase>(`margit:purchase:${id}`);
    if (!record || !((wallet && record.buyerWallet === wallet.toLowerCase()) || (operator && record.operatorSession === operator))) return null;
    // Returning the original grant never extends time or resets one-time download use.
    if (Date.parse(record.expiresAt) <= Date.now()) return { expired: true };
    return { cloneUrl: decryptToken(record.encryptedAccessUrl), repoFullName: record.repoFullName };
}
