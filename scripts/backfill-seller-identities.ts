import { listListings } from '../server/src/listings.js';
import { listingSellerIdentity } from '../server/src/fee-eligibility.js';
// Verify existing listing tokens against GitHub before linking legacy ledgers.
// No funds move and no credentials are printed. Re-running is idempotent.
for (const listing of await listListings()) {
    try {
        const identity = await listingSellerIdentity(listing);
        console.log(JSON.stringify({listingId:listing.id,seller:listing.ownerLogin,githubId:identity.id,status:'linked'}));
    } catch (error) {
        console.error(JSON.stringify({listingId:listing.id,status:'needs seller reconnect or identity review',reason:error instanceof Error && /^(Reconnect GitHub|Invalid GitHub|Seller login|Seller identity)/.test(error.message) ? error.message : 'Identity verification failed'}));
        process.exitCode=1;
    }
}
