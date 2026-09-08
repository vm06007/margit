import type { PaymentToken } from "./paymentTokens.js";
import type { AccessPolicy } from './accessPolicy.js';
export interface Purchase {
    id: string;
    listingId: string;
    repoFullName: string;
    seller: string;
    buyerWallet: string;
    amount: string;
    platformFee?: string;
    sellerNet?: string;
    feeCollection?: 'automatic' | 'deferred';
    feeTreasury?: string;
    currency: PaymentToken;
    channel: 'wallet' | 'x402';
    status: 'confirmed' | 'gateway_accepted';
    transactionHash?: string;
    gatewayReference?: string;
    checkoutContract?: string;
    onchainPurchaseId?: string;
    createdAt: string;
    expiresAt: string | null;
    accessPolicy: AccessPolicy;
}
