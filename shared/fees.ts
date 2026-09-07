import { formatUnits, keccak256, parseUnits, stringToHex } from 'viem';
export const PLATFORM_FEE_BPS = 50;
export const feeUnits = (amount: bigint) => amount / 200n;
export const moneyUnits = (amount: string) => parseUnits(amount.replace('$', ''), 6);
export const money = (amount: bigint) => formatUnits(amount, 6);
export const sellerFeeId = (login: string) => keccak256(stringToHex('margit:seller:' + login.toLowerCase()));
export interface FeeSummary {
    currency: 'USDC' | 'EURC';
    gross: string; net: string; collected: string; deferred: string;
    paid: string; owed: string; credit: string;
}
