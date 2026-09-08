export function circleReceiptUrl(reference?: string): string | undefined {
    return reference && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)
        ? `https://gateway-api-testnet.circle.com/v1/x402/transfers/${reference}` : undefined;
}
