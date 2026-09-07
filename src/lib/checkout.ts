import { getContract, prepareContractCall, readContract, sendTransaction, waitForReceipt } from 'thirdweb';
import type { Account } from 'thirdweb/wallets';
import { parseSignature, parseUnits } from 'viem';
import { checkoutAbi, typedOrder, checkoutTermsHash, type CheckoutQuote } from '../../shared/checkout';
import { arcTestnet, thirdwebClient } from './thirdweb';
import { ARC_TOKEN_ADDRESSES, type PaymentToken } from './constants';
import type { Listing } from '../api';
export interface CheckoutResult { cloneUrl:string; expiresAt:string; transactionHash:string; checkoutContract:string }
interface Pending { claimSecret:string; transactionHash:string; currency:PaymentToken }
const pendingKey = (listingId:string,buyer:string) => `margit:pending-checkout:${buyer.toLowerCase()}:${listingId}`;
async function api<T>(path:string,body:unknown):Promise<T> {
    const response = await fetch(`/api/checkout/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Checkout failed');
    return data;
}
export function pendingCheckout(listingId:string,buyer:string):Pending|null {
    try {return JSON.parse(localStorage.getItem(pendingKey(listingId,buyer)) ?? 'null');} catch {return null;}
}
export async function purchaseWithContract(listing:Listing,currency:PaymentToken,account:Account,onStatus:(status:'checking'|'sending'|'verifying')=>void):Promise<CheckoutResult & {currency:PaymentToken}> {
    const listingId = listing.id;
    const key = pendingKey(listingId,account.address);
    let pending = pendingCheckout(listingId,account.address);
    if (!pending) {
        onStatus('checking');
        const quote = await api<CheckoutQuote>('quote',{listingId,buyer:account.address,currency});
        if (quote.chainId !== arcTestnet.id || quote.order.buyer.toLowerCase() !== account.address.toLowerCase()) throw new Error('Checkout quote does not match this wallet or network');
        if (quote.order.amount !== parseUnits(listing.price.replace('$',''),6).toString() || quote.order.token.toLowerCase() !== ARC_TOKEN_ADDRESSES[currency].toLowerCase() || quote.order.seller.toLowerCase() !== listing.payoutAddress.toLowerCase() || quote.order.termsHash !== checkoutTermsHash(listing.price,currency,listing.payoutAddress,listing.accessPolicy)) throw new Error('The listing changed. Refresh to review its latest price and access terms before paying.');
        const token = getContract({client:thirdwebClient,chain:arcTestnet,address:quote.order.token});
        const amount = BigInt(quote.order.amount);
        const allowance = await readContract({contract:token,method:'function allowance(address owner,address spender) view returns (uint256)',params:[account.address,quote.contract]});
        onStatus('sending');
        if (allowance < amount) {
            const approval = prepareContractCall({contract:token,method:'function approve(address spender,uint256 value) returns (bool)',params:[quote.contract,amount]});
            const tx = await sendTransaction({transaction:approval,account});
            const receipt = await waitForReceipt({client:thirdwebClient,chain:arcTestnet,transactionHash:tx.transactionHash});
            if (receipt.status !== 'success') throw new Error('Token approval failed');
        }
        if (BigInt(quote.order.deadline) <= BigInt(Math.floor(Date.now()/1000))) throw new Error('Checkout quote expired. Please try again.');
        const signature = parseSignature(quote.signature);
        const contract = getContract({client:thirdwebClient,chain:arcTestnet,address:quote.contract,abi:checkoutAbi});
        const transaction = prepareContractCall({contract,method:'buy',params:[typedOrder(quote.order),Number(signature.v ?? BigInt(27+(signature.yParity ?? 0))),signature.r,signature.s]});
        // Ensure receipt persistence is available before requesting the purchase transaction.
        localStorage.setItem(`${key}:quote`,JSON.stringify({claimSecret:quote.claimSecret,currency}));
        const tx = await sendTransaction({transaction,account});
        pending = {claimSecret:quote.claimSecret,transactionHash:tx.transactionHash,currency};
        localStorage.setItem(key,JSON.stringify(pending));
        localStorage.removeItem(`${key}:quote`);
    }
    onStatus('verifying');
    const receipt = await waitForReceipt({client:thirdwebClient,chain:arcTestnet,transactionHash:pending.transactionHash as `0x${string}`});
    if (receipt.status !== 'success') {localStorage.removeItem(key);throw new Error('Checkout transaction failed. No purchase was completed.');}
    const result = await api<CheckoutResult>('confirm',pending);
    localStorage.removeItem(key);
    return {...result,currency:pending.currency};
}
