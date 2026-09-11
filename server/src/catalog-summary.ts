import type { Listing } from './listings.js';

// Leave room for MCP wrappers and JSON escaping within Bazantic's 32 KiB limit.
export const CATALOG_PAGE_BYTES = 10_000;
export function summarizeCatalog(source: Listing[], offset = 0) {
    const sorted = [...source].sort((a, b) => a.id.localeCompare(b.id));
    const listings = [];
    for (const listing of sorted.slice(offset, offset + 10)) {
        const { id, repoFullName, price, language, accessPolicy } = listing;
        const description = listing.sellerDescription || listing.description || '';
        const item = { id, repoFullName, price, language, accessPolicy,
            description: description.slice(0, 400), descriptionTruncated: description.length > 400 };
        if (Buffer.byteLength(JSON.stringify([...listings, item])) > CATALOG_PAGE_BYTES) break;
        listings.push(item);
    }
    const nextOffset = offset + listings.length < sorted.length ? offset + listings.length : null;
    return { listings, total: sorted.length, offset, nextOffset,
        nextPage: nextOffset === null ? null : `/api/listings?view=compact&offset=${nextOffset}`,
        note: 'Compact catalog: screenshots omitted; descriptions limited to 400 characters. Prices are USD display values. Follow nextPage when present; this page may not contain every listing.' };
}
