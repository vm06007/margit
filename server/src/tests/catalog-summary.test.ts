import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCatalog } from '../catalog-summary.js';
import type { Listing } from '../listings.js';

const fixture = (id: string): Listing => ({ id, repoFullName: `owner/repo-${id}`, ownerLogin: 'owner',
    price: '$1.00', payoutAddress: '0x123', createdAt: '2026-09-11', description: 'Fallback', language: 'TypeScript',
    stargazersCount: 1, sellerDescription: '🚀'.repeat(1000), screenshots: ['data:image/png;base64,' + 'x'.repeat(600000)],
    accessPolicy: { mode: 'window', minutes: 10 } });

test('compact pages omit image payloads, disclose truncation and retain checkout terms', () => {
    const source = [fixture('1')];
    const result = summarizeCatalog(source);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 12000);
    assert.equal(result.listings[0].descriptionTruncated, true);
    assert.equal(result.listings[0].price, '$1.00');
    assert.deepEqual(result.listings[0].accessPolicy, source[0].accessPolicy);
    assert.ok(!JSON.stringify(result).includes('data:image'));
    assert.equal(source[0].screenshots.length, 1);
});

test('pagination returns every listing once and stays within the tool response budget', () => {
    const source = Array.from({ length: 30 }, (_, i) => fixture(String(i).padStart(2, '0'))).reverse();
    let offset = 0;
    const ids: string[] = [];
    while (true) {
        const page = summarizeCatalog(source, offset);
        assert.ok(Buffer.byteLength(JSON.stringify(page)) < 12000);
        ids.push(...page.listings.map(item => item.id));
        if (page.nextOffset === null) break;
        assert.ok(page.nextOffset > offset);
        offset = page.nextOffset;
    }
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
    assert.equal(summarizeCatalog([]).nextPage, null);
});
