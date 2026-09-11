import { Hono } from 'hono';
import { agentSkill } from './mcp.js';
import { checkoutAbi } from '../../shared/checkout.js';

export function createAgentDocs(origin: string) {
    const appOrigin = new URL(origin).origin;
    const base = appOrigin === 'https://margit.sh' ? 'https://api.margit.sh' : appOrigin;
    const docs = appOrigin === 'https://margit.sh' ? 'https://docs.margit.sh/' : `${appOrigin}/docs/`;
    const routes = new Hono();
    const tools = ['browse_catalog', 'get_listing', 'create_checkout_quote', 'confirm_checkout', 'list_my_repos', 'create_listing', 'unlist_repo'];
    routes.get('/', c => c.json({ name: 'Margit', documentation: docs, transport: 'streamable-http', endpoint: `${base}/api/mcp`, skill: `${appOrigin}/skills/margit/SKILL.md`, skillsIndex: `${appOrigin}/SKILLS.md`, openapi: `${base}/api/agent-docs/openapi.json`, checkoutAbi: `${base}/api/agent-docs/checkout-abi`, tools, chainId: 5042002, network: 'Arc testnet', authentication: 'Public catalog and checkout tools; seller tools require Authorization: Bearer MARGIT_API_KEY.', clientConfig: { mcpServers: { margit: { url: `${base}/api/mcp` } } }, bazantic: { status: 'configuration-ready; registration not verified', setup: `${base}/api/agent-docs/bazantic` } }));
    routes.get('/skill', c => c.text(agentSkill));
    routes.get('/checkout-abi', c => c.json(checkoutAbi));
    routes.get('/bazantic', c => c.json({
        verifiedFrom: 'https://api.bazantic.com/openapi.json', checkedOn: '2026-09-08',
        status: 'Draft setup only; no gateway has been registered or published by this integration.',
        steps: [
            'Deploy Margit with a publicly reachable HTTPS APP_URL and verify /api/mcp initialize and tools/list.',
            'Obtain your Bazantic account_id and API token with the write role. Keep the token server-side.',
            'POST the gatewayDraft (replace account_id) to https://api.bazantic.com/v1/gateways using your Bazantic Authorization header. Do not send a slug; Bazantic returns it.',
            'Test the returned gateway using browse_catalog before changing status from draft to active.',
            'Recipes are optional: POST /v1/recipes requires an admin role and a tool binding containing the returned gateway_slug and tool_name. Publishing uses /v1/recipes/{handle}/publish.',
        ],
        gatewayDraft: { account_id: 'YOUR_BAZANTIC_ACCOUNT_UUID', handle: 'margit', name: 'Margit', type: 'dedicated', service_endpoint: `${base}/api/mcp`, service_protocol: 'mcp', auth: { type: 'none' }, status: 'draft', category: 'AI', tags: ['github', 'marketplace', 'arc', 'mcp'], tagline: 'Discover private GitHub repositories and prepare wallet checkout.', product_website: appOrigin, docs_url: docs, methods: [{ verb: 'POST', resource: '/', price_millicents: 0 }] },
        sellerAccess: 'This public gateway grants no seller access. Do not register a shared seller key. Use a separate private, seller-authorized client or gateway for mutations.',
    }));
    routes.get('/openapi.json', c => {
        const success = { '200': { description: 'Successful response' } };
        const post = (operationId: string, summary: string, properties: Record<string, unknown>, required: string[], authenticated = false) => ({ operationId, summary, ...(authenticated ? { security: [{ MargitKey: [] }] } : {}), requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } }, responses: { ...success, '400': { description: 'Invalid request' }, ...(authenticated ? { '401': { description: 'Missing or invalid Margit key' } } : {}) } });
        const string = { type: 'string' };
        return c.json({ openapi: '3.1.0', info: { title: 'Margit Agent API', version: '1.0.0', description: 'Catalog, buyer-bound checkout and seller-owned listing management on Arc testnet. MCP: /api/mcp.' }, servers: [{ url: base }], components: { securitySchemes: { MargitKey: { type: 'http', scheme: 'bearer', description: 'Seller-generated margit_sk_ API key' } } }, paths: {
            '/api/listings': { get: { operationId: 'browse_catalog', summary: 'List repository offerings. The API subdomain returns compact paginated listings; inspect nextOffset and fetch the next page when present.', parameters: [{ name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 }, description: 'Pagination offset from the previous response nextOffset.' }], responses: success } },
            '/api/checkout/config': { get: { operationId: 'checkout_config', summary: 'Read chain ID and checkout contract', responses: success } },
            '/api/checkout/quote': { post: post('create_checkout_quote', 'Create a signed quote; does not pay', { listingId: string, buyer: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' }, currency: { type: 'string', enum: ['USDC', 'EURC', 'cirBTC'] } }, ['listingId', 'buyer', 'currency']) },
            '/api/checkout/confirm': { post: post('confirm_checkout', 'Confirm an existing paid transaction; requires private claim secret', { claimSecret: string, transactionHash: string }, ['claimSecret', 'transactionHash']) },
            '/api/agent-api/repos': { get: { operationId: 'list_my_repos', summary: 'List seller repositories', security: [{ MargitKey: [] }], responses: { ...success, '401': { description: 'Missing or invalid Margit key' } } } },
            '/api/agent-api/repos/list': { post: post('create_listing', 'Publish a seller-authorized private repository', { repoFullName: string, price: { type: 'string', pattern: '^\\$\\d+(\\.\\d{1,2})?$' }, payoutAddress: string, sellerDescription: string, accessPolicy: { type: 'object', properties: { mode: { type: 'string', enum: ['window', 'single_download', 'permanent'] }, minutes: { type: 'integer', minimum: 1 }, checkoutMode: { type: 'string', enum: ['both', 'wallet', 'x402'] }, acceptedTokens: { type: 'array', items: { type: 'string', enum: ['USDC', 'EURC', 'cirBTC'] }, minItems: 1 } }, required: ['mode'] } }, ['repoFullName', 'price', 'payoutAddress'], true) },
            '/api/agent-api/repos/unlist': { post: post('unlist_repo', 'Remove seller listing by id or repoFullName', { id: string, repoFullName: string }, [], true) },
        } });
    });
    return routes;
}
