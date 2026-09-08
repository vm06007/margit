import { createHash, randomBytes } from 'node:crypto';
import { checkoutPrice } from './exchange-rates.js';
import { Hono } from 'hono';
import { createPublicClient, decodeEventLog, getAddress, formatUnits, http, isAddress, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { checkoutAmountLabel, checkoutAbi, checkoutDomain, checkoutTermsHash, orderTypes, typedOrder, type CheckoutQuote } from '../../shared/checkout.js';
import { allowsCheckout } from '../../shared/accessPolicy.js';
import { arcTestnet, ARC_TOKEN_ADDRESSES, type PaymentToken } from './payments.js';
import { checkRepositoryDelivery, mintCloneResponse } from './purchase-access.js';
import { getListing, type Listing } from './listings.js';
import { recordPurchase } from './purchases.js';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';

const client = createPublicClient({chain:arcTestnet,transport:http()});
interface StoredQuote { quote: Omit<CheckoutQuote,'claimSecret'>; listing: Listing; currency: PaymentToken; grantToken: string; operatorSession?: string }
const quoteKey = (secret:string) => `margit:checkout:quote:${createHash('sha256').update(secret).digest('hex')}`;
export function checkoutAddress() {
    const value = process.env.CHECKOUT_CONTRACT_ADDRESS;
    if (!value || !isAddress(value)) throw new Error('Contract checkout is not configured yet. No payment was requested.');
    return getAddress(value);
}
export async function createCheckoutQuote(listingId:string, buyer:string, currency:PaymentToken, operatorSession?:string):Promise<CheckoutQuote> {
    if (!isAddress(buyer)) throw new Error('Invalid buyer wallet');
    const contract = checkoutAddress();
    const signerKey = process.env.CHECKOUT_SIGNER_PRIVATE_KEY;
    if (!signerKey || !/^0x[0-9a-f]{64}$/i.test(signerKey)) throw new Error('Checkout signing is not configured. No payment was requested.');
    const signer = privateKeyToAccount(signerKey as `0x${string}`);
    const listing = await getListing(listingId);
    if (!listing) throw new Error('Listing not found');
    if (!allowsCheckout(listing.accessPolicy,'wallet')) throw new Error('This listing requires x402 checkout.');
    if (!isAddress(listing.payoutAddress)) throw new Error('Seller payout address is invalid');
    const configuredSigner = await client.readContract({address:contract,abi:checkoutAbi,functionName:'quoteSigner'});
    if (configuredSigner.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Checkout signing configuration does not match the contract.');
    const delivery = await checkRepositoryDelivery(listing);
    if (!delivery.ok) throw new Error(delivery.error);
    const pricing = await checkoutPrice(listing.price, currency);
    const order = {
        orderId: `0x${randomBytes(32).toString('hex')}` as `0x${string}`,
        listingId: keccak256(stringToHex(listing.id)),
        termsHash: checkoutTermsHash(listing.price,currency,listing.payoutAddress,listing.accessPolicy),
        buyer:getAddress(buyer),seller:getAddress(listing.payoutAddress),token:getAddress(ARC_TOKEN_ADDRESSES[currency]),
        amount:pricing.amount,deadline:String(Math.floor(Date.now()/1000)+300),
    };
    if (BigInt(order.amount) <= 0n) throw new Error('Invalid listing price');
    const signature = await signer.signTypedData({domain:checkoutDomain(contract),types:orderTypes,primaryType:'Order',message:typedOrder(order)});
    const claimSecret = randomBytes(32).toString('hex');
    const quote = {contract,chainId:arcTestnet.id,order,signature};
    // Store encrypted receipt credentials before exposing a payable quote. Keep it for recovery.
    const stored:StoredQuote = {quote,listing,currency,grantToken:randomBytes(32).toString('hex'),operatorSession};
    await redis.set(quoteKey(claimSecret),encryptToken(JSON.stringify(stored)));
    return {...quote,claimSecret};
}
export async function completeCheckout(claimSecret:string, transactionHash:string) {
    if (!/^[0-9a-f]{64}$/i.test(claimSecret) || !/^0x[0-9a-f]{64}$/i.test(transactionHash)) throw new Error('Invalid checkout receipt');
    const encrypted = await redis.get<string>(quoteKey(claimSecret));
    if (!encrypted) throw new Error('Checkout quote not found');
    const stored = JSON.parse(decryptToken(encrypted)) as StoredQuote;
    const {quote,listing,currency} = stored;
    const receipt = await client.getTransactionReceipt({hash:transactionHash as `0x${string}`});
    if (receipt.status !== 'success') throw new Error('Checkout transaction did not succeed');
    const matched = receipt.logs.some(log => {
        if (log.address.toLowerCase() !== quote.contract.toLowerCase()) return false;
        try {
            const {args} = decodeEventLog({abi:checkoutAbi,eventName:'PurchaseCompleted',data:log.data,topics:log.topics});
            const order = quote.order;
            return args.purchaseId === order.orderId && args.listingId === order.listingId && args.termsHash === order.termsHash &&
                args.buyer.toLowerCase() === order.buyer.toLowerCase() && args.seller.toLowerCase() === order.seller.toLowerCase() &&
                args.token.toLowerCase() === order.token.toLowerCase() && args.amount === BigInt(order.amount);
        } catch {return false;}
    });
    if (!matched) throw new Error('Transaction does not match this checkout');
    let fee: {platformFee?:string;sellerNet?:string;feeTreasury?:string} = {};
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== quote.contract.toLowerCase()) continue;
        try {
            const decoded = decodeEventLog({abi:checkoutAbi,eventName:'PurchaseFeeCollected',data:log.data,topics:log.topics});
            if (decoded.eventName !== 'PurchaseFeeCollected') continue;
            const {args} = decoded;
            if (args.purchaseId !== quote.order.orderId || args.token.toLowerCase() !== quote.order.token.toLowerCase()) continue;
            const gross = BigInt(quote.order.amount);
            if (args.feeAmount !== gross/200n || args.sellerAmount !== gross-args.feeAmount) throw new Error('Fee receipt mismatch');
            fee = {platformFee:formatUnits(args.feeAmount,6),sellerNet:formatUnits(args.sellerAmount,6),feeTreasury:args.treasury};
        } catch (error) {
            if (error instanceof Error && error.message === 'Fee receipt mismatch') throw error;
        }
    }
    const block = await client.getBlock({blockHash:receipt.blockHash});
    const purchasedAt = Number(block.timestamp)*1000;
    const access = await mintCloneResponse(listing,{token:stored.grantToken,purchasedAt});
    if (!access) throw new Error('Payment confirmed, but delivery credentials are unavailable. Retry receipt recovery; do not pay again.');
    await recordPurchase(listing,{reference:`checkout:${quote.contract}:${quote.order.orderId}`,buyerWallet:quote.order.buyer,currency,channel:'wallet',transactionHash,operatorSession:stored.operatorSession,checkoutContract:quote.contract,onchainPurchaseId:quote.order.orderId,purchasedAt,amount:checkoutAmountLabel(quote.order.amount),...fee},access);
    return {...access,transactionHash,checkoutContract:quote.contract,amount:checkoutAmountLabel(quote.order.amount)};
}
export const checkoutRoutes = new Hono();
checkoutRoutes.use('*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
checkoutRoutes.post('/quote',async c => {
    const body = await c.req.json<{listingId:string;buyer:string;currency:PaymentToken}>();
    if (!body || typeof body.listingId !== 'string' || !['USDC','EURC'].includes(body.currency) || !isAddress(body.buyer ?? '')) return c.json({error:'Invalid checkout request'},400);
    try {return c.json(await createCheckoutQuote(body.listingId,body.buyer,body.currency));}
    catch(error) {return c.json({error:error instanceof Error?error.message:'Checkout unavailable'},503);}
});
checkoutRoutes.post('/confirm',async c => {
    const {claimSecret,transactionHash} = await c.req.json<{claimSecret:string;transactionHash:string}>();
    try {return c.json(await completeCheckout(claimSecret,transactionHash));}
    catch(error) {return c.json({error:error instanceof Error?error.message:'Could not confirm checkout'},400);}
});
checkoutRoutes.get('/config',c=>c.json({chainId:arcTestnet.id,contract:process.env.CHECKOUT_CONTRACT_ADDRESS ?? null}));

checkoutRoutes.get('/price',async c => {
    const listingId = c.req.query('listingId');
    const currency = c.req.query('currency');
    if (!listingId || (currency !== 'USDC' && currency !== 'EURC')) return c.json({error:'Invalid price request'},400);
    const listing = await getListing(listingId);
    if (!listing) return c.json({error:'Listing not found'},404);
    try { return c.json(await checkoutPrice(listing.price,currency)); }
    catch { return c.json({error:'EURC exchange rate is unavailable. Try again or use USDC.'},503); }
});
