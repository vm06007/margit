import { TOKEN_DECIMALS, type PaymentToken } from "./paymentTokens.js";
import { formatUnits, keccak256, parseUnits, stringToHex } from 'viem';
export const PLATFORM_FEE_BPS = 50;
export const feeUnits = (amount: bigint) => amount / 200n;
export const moneyUnits = (amount: string, currency: PaymentToken = 'USDC') => parseUnits(amount.replace('$', ''), TOKEN_DECIMALS[currency]);
export const money = (amount: bigint, currency: PaymentToken = 'USDC') => formatUnits(amount, TOKEN_DECIMALS[currency]);
export const sellerFeeId = (login: string) => keccak256(stringToHex('margit:seller:' + login.toLowerCase()));
export interface FeeSummary {
    currency: PaymentToken;
    gross: string; net: string; collected: string; deferred: string;
    paid: string; owed: string; credit: string;
}
