/** Only ordinary web links may be published as repository demos. */
export function normalizeDemoUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const input = value.trim();
    if (input.length > 2048) return null;
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
        return url.href;
    } catch { return null; }
}
