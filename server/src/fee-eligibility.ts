import { moneyUnits } from '../../shared/fees.js';
import { sellerFees } from './fees.js';
import { listPurchaseHistory } from './purchases.js';
import { authenticateSellerIdentity, type SellerIdentity } from './seller-identity.js';
import { getOwnerTokenForListing, type Listing } from './listings.js';
export const X402_FEE_DEBT_LIMIT = '1.00';
export function x402FeesPaused(owed: string) { return moneyUnits(owed) >= moneyUnits(X402_FEE_DEBT_LIMIT); }
export async function identitySales(identity: SellerIdentity) {
    const histories = await Promise.all(identity.aliases.map(login => listPurchaseHistory('seller',login)));
    return [...new Map(histories.flat().map(sale=>[sale.id,sale])).values()];
}
export async function identityFees(identity: SellerIdentity) {
    return sellerFees(identity.ledgerLogin,await identitySales(identity),identity.aliases);
}
export async function listingSellerIdentity(listing: Listing) {
    const token = await getOwnerTokenForListing(listing.id);
    if (!token) throw new Error('Seller identity cannot be verified.');
    return authenticateSellerIdentity(token, listing.ownerLogin);
}
