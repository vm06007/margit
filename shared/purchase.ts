import type { AccessPolicy } from './accessPolicy.js';
export interface Purchase {
    id: string;
    listingId: string;
    repoFullName: string;
    seller: string;
    buyerWallet: string;
    amount: string;
    currency: 'USDC' | 'EURC';
    channel: 'wallet' | 'x402';
    status: 'confirmed' | 'gateway_accepted';
    transactionHash?: string;
    checkoutContract?: string;
    onchainPurchaseId?: string;
    createdAt: string;
    expiresAt: string;
    accessPolicy: AccessPolicy;
}
