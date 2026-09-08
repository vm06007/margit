import { createPublicClient, decodeEventLog, http, isAddress, type Hex } from 'viem';
import { arcTestnet } from './payments.js';
import { checkoutAbi } from '../../shared/checkout.js';
import { money, moneyUnits, sellerFeeId, type FeeSummary } from '../../shared/fees.js';
import type { Purchase } from '../../shared/purchase.js';
import { redis } from './redis.js';
const client = createPublicClient({chain:arcTestnet,transport:http()});
interface FeePayment {seller:string; amount:string; transactionHash:string; contract:string}
export function feeContract() {
    const address = process.env.FEE_CONTRACT_ADDRESS;
    if (!address || !isAddress(address)) throw new Error('Fee settlement is not configured.');
    return address;
}
export function summarizeFees(sales:Purchase[], payments:FeePayment[]):FeeSummary[] {
    return (['USDC','EURC','cirBTC'] as const).map(currency=>{
        const rows=sales.filter(s=>s.currency===currency);
        const sum=(values:string[])=>values.reduce((total,value)=>total+moneyUnits(value,currency),0n);
        const gross=sum(rows.map(s=>s.amount));
        const collected=sum(rows.filter(s=>s.feeCollection==='automatic').map(s=>s.platformFee ?? '0'));
        const deferred=sum(rows.filter(s=>s.feeCollection==='deferred').map(s=>s.platformFee ?? '0'));
        const paid=currency==='USDC' ? sum(payments.map(p=>p.amount)) : 0n;
        return {currency,gross:money(gross,currency),net:money(gross-collected-deferred,currency),collected:money(collected,currency),deferred:money(deferred,currency),paid:money(paid,currency),owed:money(deferred>paid?deferred-paid:0n,currency),credit:money(paid>deferred?paid-deferred:0n,currency)};
    });
}
export async function sellerFees(seller:string,sales:Purchase[],aliases:string[]=[seller.toLowerCase()]) {
    const ids=[...new Set((await Promise.all(aliases.map(login=>redis.smembers('margit:fees:payments:'+login)))).flat())];
    const payments=await Promise.all(ids.map(id=>redis.get<FeePayment>('margit:fee-payment:'+id)));
    return summarizeFees(sales,payments.filter((p):p is FeePayment=>!!p && aliases.includes(p.seller)));
}
export async function confirmFeePayment(seller:string,hash:string,aliases:string[]=[seller.toLowerCase()]) {
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Invalid transaction hash');
    const contract=feeContract();
    const receipt=await client.getTransactionReceipt({hash:hash as Hex});
    if (receipt.status !== 'success') throw new Error('Fee payment failed');
    let amount:bigint|undefined;
    let matchedSellerId:string|undefined;
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
        try {
            const {args}=decodeEventLog({abi:checkoutAbi,eventName:'DeferredFeesPaid',data:log.data,topics:log.topics});
            if (aliases.some(login=>args.sellerId===sellerFeeId(login))) {
                if (matchedSellerId && matchedSellerId !== args.sellerId) throw new Error("Mixed seller receipt identifiers");
                matchedSellerId=args.sellerId; amount=(amount??0n)+args.amount;
            }
        } catch { /* Other event */ }
    }
    if (amount===undefined || amount<=0n) throw new Error('No fee payment for this publisher found');
    const id=contract.toLowerCase()+':'+hash.toLowerCase()+':'+matchedSellerId;
    await redis.set('margit:fee-payment:'+id,{seller:seller.toLowerCase(),amount:money(amount),transactionHash:hash,contract},{nx:true});
    // Repeated confirmation repairs indexing without adding another credit.
    await redis.sadd('margit:fees:payments:'+seller.toLowerCase(),id);
    return {amount:money(amount)};
}
