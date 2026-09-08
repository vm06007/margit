import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const base = new URL(process.argv[2] ?? 'http://localhost:5173');
const client = new Client({ name: 'margit-smoke-check', version: '1.0.0' });
try {
    await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp', base)));
    const tools = await client.listTools();
    const resources = await client.listResources();
    const skill = await client.readResource({ uri: 'margit://skill' });
    const catalog = await client.callTool({ name: 'browse_catalog', arguments: { limit: 1 } });
    if (catalog.isError) throw new Error('Catalog tool failed');
    if (tools.tools.length !== 7 || !skill.contents.length) throw new Error('MCP discovery is incomplete');
    console.log(JSON.stringify({ endpoint: new URL('/api/mcp', base).href, tools: tools.tools.map(tool => tool.name), resources: resources.resources.map(resource => resource.uri), skillReadable: true, catalogCallable: true }, null, 2));
} finally { await client.close(); }
