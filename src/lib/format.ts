export function formatUsdc(amount: string): string {
    return `${(Number(amount) / 1_000_000).toFixed(2)} USDC`;
}

const NEW_LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isRecentlyListed(createdAt: string): boolean {
    return Date.now() - new Date(createdAt).getTime() < NEW_LISTING_WINDOW_MS;
}

export function formatListedDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Deterministic placeholder gradient for cards with no seller-uploaded screenshot. */
export function fallbackCardGradient(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const hueA = hash % 360;
    const hueB = (hueA + 40) % 360;
    return `linear-gradient(135deg, hsl(${hueA} 55% 22%), hsl(${hueB} 50% 14%))`;
}
