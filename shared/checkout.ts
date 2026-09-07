import { parseAbi, keccak256, stringToHex } from 'viem';
import { parseAccessPolicy, type AccessPolicy } from './accessPolicy.js';
export const CHECKOUT_CHAIN_ID = 5042002;
export const checkoutAbi = parseAbi([
    'function quoteSigner() view returns (address)',
    'function usedOrders(bytes32) view returns (bool)',
    'function allowedToken(address) view returns (bool)',
    'function buy((bytes32 orderId,bytes32 listingId,bytes32 termsHash,address buyer,address seller,address token,uint256 amount,uint256 deadline) order,uint8 v,bytes32 r,bytes32 s) returns (bytes32)',
    'event PurchaseCompleted(bytes32 indexed purchaseId,bytes32 indexed listingId,address indexed buyer,address seller,address token,uint256 amount,bytes32 termsHash)',
]);
export const orderTypes = { Order: [
    {name:'orderId',type:'bytes32'}, {name:'listingId',type:'bytes32'}, {name:'termsHash',type:'bytes32'},
    {name:'buyer',type:'address'}, {name:'seller',type:'address'}, {name:'token',type:'address'},
    {name:'amount',type:'uint256'}, {name:'deadline',type:'uint256'},
] } as const;
export interface CheckoutOrder {
    orderId: `0x${string}`; listingId: `0x${string}`; termsHash: `0x${string}`;
    buyer: `0x${string}`; seller: `0x${string}`; token: `0x${string}`; amount: string; deadline: string;
}
export interface CheckoutQuote { contract: `0x${string}`; chainId: number; order: CheckoutOrder; signature: `0x${string}`; claimSecret: string }
export const typedOrder = (order: CheckoutOrder) => ({...order, amount: BigInt(order.amount), deadline: BigInt(order.deadline)});
export const checkoutDomain = (contract: `0x${string}`, chainId = CHECKOUT_CHAIN_ID) => ({name:'MargitCheckout',version:'1',chainId,verifyingContract:contract} as const);

export const checkoutTermsHash = (price:string,currency:string,payout:string,policy?:AccessPolicy) => keccak256(stringToHex(JSON.stringify({version:1,policy:parseAccessPolicy(policy),price,currency,payout:payout.toLowerCase()})));
