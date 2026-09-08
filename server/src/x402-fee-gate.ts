import type { MiddlewareHandler, Context } from 'hono';
import { redis } from './redis.js';
import { identityFees, listingSellerIdentity, x402FeesPaused, X402_FEE_DEBT_LIMIT } from './fee-eligibility.js';
import { getListing } from './listings.js';
import type { SellerIdentity } from './seller-identity.js';

interface GateDependencies {
    identify: (c: Context) => Promise<SellerIdentity>;
    owed: (identity: SellerIdentity) => Promise<string>;
    reserve: (id: string) => Promise<boolean>;
    release: (id: string) => Promise<unknown>;
}
export function createX402FeeGate(deps: GateDependencies = {
    identify: async c => {
        const listing = await getListing(c.req.query('id') ?? '');
        if (!listing) throw new Error('Listing unavailable');
        return listingSellerIdentity(listing);
    },
    owed: async identity => (await identityFees(identity)).find(f=>f.currency==='USDC')!.owed,
    reserve: async id => !!await redis.set(`margit:x402-fee-lock:${id}`,'pending',{nx:true}),
    release: id => redis.del(`margit:x402-fee-lock:${id}`),
}): MiddlewareHandler {
    return async (c,next) => {
        c.header('Cache-Control','no-store');
        const signed = !!(c.req.header('payment-signature') || c.req.header('x-payment'));
        let identity: SellerIdentity | undefined;
        let reserved = false;
        let enteringPayment = false;
        try {
            identity = await deps.identify(c);
            if (signed) {
                reserved = await deps.reserve(identity.id);
                if (!reserved) return c.json({error:'Another seller payment is pending. Please retry after it completes.'},409);
            }
            if (x402FeesPaused(await deps.owed(identity))) {
                if (reserved) await deps.release(identity.id);
                return c.json({code:'SELLER_X402_FEES_OVERDUE',error:`This seller's x402 sales are paused until unpaid platform fees fall below ${X402_FEE_DEBT_LIMIT} USDC.`},403);
            }
            enteringPayment = true;
            await next();
            // Keep ambiguous settlements locked, including downstream Hono 500s.
            if (reserved && c.res.status < 500) await deps.release(identity.id);
        } catch {
            if (reserved && identity && !enteringPayment) await deps.release(identity.id);
            return c.json({error:'Seller payment eligibility is temporarily unavailable. Please try again after it is resolved.'},503);
        }
    };
}
