import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpRoutes } from '../src/mcp.js';
import { createAgentDocs } from '../src/agent-docs.js';

const base = 'https://margit.example';
function fixture() {
    const calls: Array<{ path: string; authorization: string | null; body: unknown }> = [];
    const request = async (path: string, init?: RequestInit) => {
        calls.push({ path, authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (path === '/api/listings') return Response.json([{ id: 'one', repoFullName: 'seller/demo', price: '$1.00', screenshots: ['large-image'], accessPolicy: { mode: 'permanent' } }]);
        if (path === '/api/checkout/config') return Response.json({ chainId: 5042002 });
        if (path.startsWith('/api/agent-api/') && new Headers(init?.headers).get('Authorization') !== `Bearer margit_sk_${'a'.repeat(48)}`) return Response.json({ error: 'Invalid or revoked API key' }, { status: 401 });
        return Response.json({ ok: true });
    };
    const app = new Hono();
    app.route('/api/mcp', createMcpRoutes(request, base));
    app.route('/api/agent-docs', createAgentDocs(base));
    const connect = async (key?: string) => {
        const client = new Client({ name: 'integration-test', version: '1.0' });
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), { fetch: async (input, init) => app.request(new Request(input, init)), ...(key ? { requestInit: { headers: { Authorization: `Bearer ${key}` } } } : {}) });
        await client.connect(transport);
        return client;
    };
    return { app, calls, connect };
}

test('real MCP client initializes, discovers tools and reads skill and live catalog', async () => {
    const { connect } = fixture();
    const client = await connect();
    try {
        assert.equal((await client.listTools()).tools.length, 7);
        assert.equal((await client.listResources()).resources[0].uri, 'margit://skill');
        const skill = await client.readResource({ uri: 'margit://skill' });
        assert.match(String(skill.contents[0].text), /10n\*\*12n/);
        const browse = await client.callTool({ name: 'browse_catalog', arguments: { query: 'demo' } });
        assert.equal(browse.isError, undefined);
        const result = JSON.parse((browse.content as Array<{ text: string }>)[0].text);
        assert.equal(result.listings[0].id, 'one');
        assert.equal(result.listings[0].screenshots, undefined);
        const detail = await client.callTool({ name: 'get_listing', arguments: { listingId: 'missing' } });
        assert.equal(detail.isError, true);
    } finally { await client.close(); }
});

test('seller credentials are isolated and errors stay errors', async () => {
    const { connect, calls } = fixture();
    const owner = await connect(`margit_sk_${'a'.repeat(48)}`);
    const anonymous = await connect();
    const revoked = await connect(`margit_sk_${'b'.repeat(48)}`);
    try {
        assert.equal((await owner.callTool({ name: 'list_my_repos', arguments: {} })).isError, false);
        assert.equal(calls.at(-1)?.authorization, `Bearer margit_sk_${'a'.repeat(48)}`);
        const before = calls.length;
        assert.equal((await anonymous.callTool({ name: 'list_my_repos', arguments: {} })).isError, true);
        assert.equal(calls.length, before);
        assert.equal((await revoked.callTool({ name: 'list_my_repos', arguments: {} })).isError, true);
        await owner.callTool({ name: 'browse_catalog', arguments: {} });
        assert.equal(calls.at(-1)?.authorization, null);
        assert.equal((await owner.callTool({ name: 'unlist_repo', arguments: {} })).isError, true);
    } finally { await owner.close(); await anonymous.close(); await revoked.close(); }
});

test('quote validates input and forwards only the supplied buyer; confirm retains claim secret', async () => {
    const { connect, calls } = fixture();
    const client = await connect();
    try {
        const invalid = await client.callTool({ name: 'create_checkout_quote', arguments: { listingId: 'one', buyer: 'invalid', currency: 'USDC' } });
        assert.equal(invalid.isError, true);
        assert.equal(calls.length, 0);
        const input = { listingId: 'one', buyer: `0x${'1'.repeat(40)}`, currency: 'EURC' };
        await client.callTool({ name: 'create_checkout_quote', arguments: input });
        assert.deepEqual(calls.at(-1)?.body, input);
        const confirmation = { claimSecret: 'private-test-claim', transactionHash: `0x${'2'.repeat(64)}` };
        await client.callTool({ name: 'confirm_checkout', arguments: confirmation });
        assert.deepEqual(calls.at(-1)?.body, confirmation);
    } finally { await client.close(); }
});

test('rejects cross-origin MCP calls, malformed JSON and oversized payloads', async () => {
    const { app } = fixture();
    const cross = await app.request('/api/mcp', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(cross.status, 403);
    const get = await app.request('/api/mcp');
    assert.equal(get.status, 405);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    const broken = await app.request('/api/mcp', { method: 'POST', headers, body: '{' });
    assert.equal(broken.status, 400);
    const large = await app.request('/api/mcp', { method: 'POST', headers, body: 'a'.repeat(70_000) });
    assert.equal(large.status, 413);
});

test('discovery and Bazantic draft describe the live endpoint without claiming registration', async () => {
    const { app } = fixture();
    const docs = await (await app.request('/api/agent-docs')).json();
    assert.equal(docs.endpoint, `${base}/api/mcp`);
    const bazantic = await (await app.request('/api/agent-docs/bazantic')).json();
    assert.equal(bazantic.gatewayDraft.service_protocol, 'mcp');
    assert.equal(bazantic.gatewayDraft.status, 'draft');
    assert.equal(bazantic.gatewayDraft.auth.type, 'none');
    const api = await (await app.request('/api/agent-docs/openapi.json')).json();
    assert.equal(api.paths['/api/agent-api/repos'].get.security[0].MargitKey.length, 0);
});
