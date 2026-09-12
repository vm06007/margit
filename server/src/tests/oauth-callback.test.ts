import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
const { app } = await import('../index.js');
const { oauthStateStore } = await import('../oauth-state.js');

test('OAuth failures redirect to safe recovery pages without exchanging tokens', async () => {
    const originalDel = oauthStateStore.consume;
    const originalFetch = globalThis.fetch;
    let exchanges = 0;
    oauthStateStore.consume = (async () => 1) as typeof oauthStateStore.consume;
    globalThis.fetch = (async () => { exchanges++; throw new Error('Unexpected token exchange'); }) as typeof fetch;
    try {
        for (const [query, reason] of [
            ['state=test&error=access_denied&error_description=untrusted', 'cancelled'],
            ['state=test&error=other', 'failed'],
            ['state=test', 'failed'],
            ['', 'expired'],
        ]) {
            const response = await app.request(`/api/auth/github/callback?${query}`);
            assert.equal(response.status, 302);
            const target = new URL(response.headers.get('location')!);
            assert.equal(target.pathname, '/auth-error');
            assert.equal(target.search, `?reason=${reason}`);
        }
        assert.equal(exchanges, 0);
        const response = await app.request('/api/auth/github/callback?state=test&code=test');
        assert.equal(response.status, 302);
        assert.equal(new URL(response.headers.get('location')!).search, '?reason=failed');
    } finally {
        oauthStateStore.consume = originalDel;
        globalThis.fetch = originalFetch;
    }
});
