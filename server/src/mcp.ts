import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';

export const agentSkill = readFileSync(new URL('../../public/skills/margit/SKILL.md', import.meta.url), 'utf8');
type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const token = z.enum(['USDC', 'EURC', 'cirBTC']);

export function createAgentServer(request: ApiRequest, authorization?: string) {
    const server = new McpServer({ name: 'margit', version: '1.0.0' }, { instructions: 'Read margit://skill before purchasing or listing. Browse freely. Seller actions require the caller’s Margit bearer key. This server never signs or broadcasts wallet payments.' });
    const call = async (path: string, method = 'GET', body?: unknown, seller = false) => {
        if (seller && !authorization) return { isError: true, content: [{ type: 'text' as const, text: '401: Configure Authorization: Bearer MARGIT_API_KEY in the MCP client.' }] };
        const response = await request(path, { method, headers: { 'Content-Type': 'application/json', ...(seller && authorization ? { Authorization: authorization } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const text = await response.text();
        return { isError: !response.ok, content: [{ type: 'text' as const, text: response.ok ? text : `${response.status}: ${text}` }] };
    };
    server.registerResource('margit-skill', 'margit://skill', { title: 'Margit agent skill', mimeType: 'text/markdown' }, async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: agentSkill }] }));
    server.registerTool('browse_catalog', { description: 'Browse public repository listings, optionally filter by name/description. Returns prices and access policies without screenshot payloads.', inputSchema: { query: z.string().max(200).optional(), limit: z.number().int().min(1).max(50).default(20) }, annotations: readOnly }, async ({ query, limit }) => {
        const response = await request('/api/listings');
        if (!response.ok) return { isError: true, content: [{ type: 'text', text: `Catalog unavailable (${response.status})` }] };
        const rows = await response.json() as Array<Record<string, unknown>>;
        const filtered = rows.filter(row => !query || `${row.repoFullName} ${row.sellerDescription ?? row.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
        return { content: [{ type: 'text', text: JSON.stringify({ total: filtered.length, listings: filtered.slice(0, limit).map(({ screenshots, ...row }) => row) }) }] };
    });
    server.registerTool('get_listing', { description: 'Read one public listing and current checkout configuration.', inputSchema: { listingId: z.string().min(1).max(100) }, annotations: readOnly }, async ({ listingId }) => {
        const response = await request('/api/listings');
        if (!response.ok) return { isError: true, content: [{ type: 'text', text: `Catalog unavailable (${response.status})` }] };
        const rows = await response.json() as Array<Record<string, unknown>>;
        const found = rows.find(row => row.id === listingId);
        if (!found) return { isError: true, content: [{ type: 'text', text: 'Listing not found' }] };
        const { screenshots, ...listing } = found;
        const config = await request('/api/checkout/config');
        return { content: [{ type: 'text', text: JSON.stringify({ listing, checkout: config.ok ? await config.json() : null }) }] };
    });
    server.registerTool('create_checkout_quote', { description: 'Create a buyer-bound signed quote. Does not spend money. Caller must use their own wallet and retain the private claimSecret.', inputSchema: { listingId: z.string().min(1).max(100), buyer: address, currency: token }, annotations: write }, args => call('/api/checkout/quote', 'POST', args));
    server.registerTool('confirm_checkout', { description: 'Verify an already-paid checkout using its transaction hash and private claimSecret; returns original repository access. Do not pay again when retrying confirmation.', inputSchema: { claimSecret: z.string().min(1).max(256), transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) }, annotations: { ...write, idempotentHint: true } }, args => call('/api/checkout/confirm', 'POST', args));
    server.registerTool('list_my_repos', { description: 'List the authenticated seller’s GitHub repositories. Requires a Margit bearer key.', inputSchema: {}, annotations: readOnly }, () => call('/api/agent-api/repos', 'GET', undefined, true));
    server.registerTool('create_listing', { description: 'Publish an authorized seller’s private repository for sale. Requires a Margit bearer key.', inputSchema: {
        repoFullName: z.string().min(3).max(200), price: z.string().regex(/^\$\d+(\.\d{1,2})?$/), payoutAddress: z.string().min(1).max(200), sellerDescription: z.string().max(4000).optional(),
        accessPolicy: z.object({ mode: z.enum(['window', 'single_download', 'permanent']), minutes: z.number().int().positive().optional(), checkoutMode: z.enum(['both', 'wallet', 'x402']).optional(), acceptedTokens: z.array(token).min(1).max(3).optional() }).optional(),
    }, annotations: write }, args => call('/api/agent-api/repos/list', 'POST', args, true));
    server.registerTool('unlist_repo', { description: 'Remove a seller-authorized listing. Requires a Margit bearer key and either id or repoFullName.', inputSchema: { id: z.string().min(1).max(100).optional(), repoFullName: z.string().min(3).max(200).optional() }, annotations: { ...write, destructiveHint: true } }, args => {
        if (!args.id && !args.repoFullName) return { isError: true, content: [{ type: 'text', text: 'Supply id or repoFullName.' }] };
        return call('/api/agent-api/repos/unlist', 'POST', args, true);
    });
    return server;
}

export function createMcpRoutes(request: ApiRequest, origin: string) {
    const routes = new Hono();
    routes.use('*', bodyLimit({ maxSize: 64 * 1024 }));
    routes.all('/', async c => {
        c.header('Cache-Control', 'no-store');
        const requestOrigin = c.req.header('Origin');
        if (requestOrigin && requestOrigin !== new URL(origin).origin) return c.json({ error: 'Origin not allowed' }, 403);
        if (c.req.method !== 'POST') return c.json({ error: 'Use MCP Streamable HTTP POST. Connection instructions: /api/agent-docs' }, 405, { Allow: 'POST' });
        const authorization = c.req.header('Authorization');
        if (authorization && !/^Bearer margit_sk_[a-f0-9]{48}$/.test(authorization)) return c.json({ error: 'Invalid Margit bearer credential' }, 401);
        // One server per request: credentials and tool state cannot leak between clients.
        const server = createAgentServer(request, authorization);
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await server.connect(transport);
        try { return await transport.handleRequest(c.req.raw); }
        finally { await server.close(); }
    });
    return routes;
}
