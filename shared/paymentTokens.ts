export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";
export const ARC_CIRBTC_ADDRESS = "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF";
export const PAYMENT_TOKENS = ["USDC", "EURC", "cirBTC"] as const;
export type PaymentToken = typeof PAYMENT_TOKENS[number];
export const TOKEN_DECIMALS: Record<PaymentToken, number> = { USDC: 6, EURC: 6, cirBTC: 8 };
export const ARC_TOKEN_ADDRESSES: Record<PaymentToken, string> = { USDC: ARC_USDC_ADDRESS, EURC: ARC_EURC_ADDRESS, cirBTC: ARC_CIRBTC_ADDRESS };
