import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

process.env.VERCEL = '1';
const { default: handler, config } = await import('../../../api/index.js');

test('Vercel adapter leaves JSON bodies readable by Hono', async () => {
    assert.equal(config.api.bodyParser, false);
    const server = createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/checkout/quote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: '{}', signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: 'Invalid checkout request' });
    } finally {
        server.closeAllConnections();
        server.close();
    }
});
