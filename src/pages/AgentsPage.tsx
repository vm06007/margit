import { useState } from 'react';

export function AgentsPage() {
    const [result, setResult] = useState('');
    const [busy, setBusy] = useState(false);
    const endpoint = `${window.location.origin}/api/mcp`;
    const check = async () => {
        setBusy(true);
        try {
            const rpc = async (id: number, method: string, params?: unknown) => {
                const response = await fetch('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
                if (!response.ok) throw new Error(`MCP returned HTTP ${response.status}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                return data.result;
            };
            const init = await rpc(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'margit-judge-check', version: '1.0.0' } });
            const catalog = await rpc(2, 'tools/list');
            setResult(`${init.serverInfo.name} connected · ${catalog.tools.length} tools available\n${catalog.tools.map((tool: { name: string }) => tool.name).join('\n')}`);
        } catch (error) { setResult(error instanceof Error ? error.message : 'Connection failed'); }
        finally { setBusy(false); }
    };
    return <section className="repository-page agent-integration-page">
        <h1>For Agents</h1>
        <p>Discover repositories, prepare checkout, and manage authorized seller listings through Margit’s MCP server.</p>
        <div className="agent-integration-links">
            <a className="btn btn-primary" href="/skills/margit/SKILL.md" target="_blank" rel="noreferrer">Read SKILL.md ↗</a>
            <a className="btn btn-secondary" href="/SKILLS.md" target="_blank" rel="noreferrer">Skills index ↗</a>
            <a className="btn btn-secondary" href="/api/agent-docs/openapi.json" target="_blank" rel="noreferrer">OpenAPI ↗</a>
        </div>
        <h2>Connect with MCP</h2>
        <p>Use Streamable HTTP. Catalog tools are public. Seller tools require a seller-generated Margit API key in the Authorization header.</p>
        <pre><code>{JSON.stringify({ mcpServers: { margit: { url: endpoint } } }, null, 2)}</code></pre>
        <button className="btn btn-primary" disabled={busy} onClick={check}>{busy ? 'Checking MCP…' : 'Test live MCP connection'}</button>
        {result && <pre role="status">{result}</pre>}
        <h2>What agents can do</h2>
        <p>Browse the catalog, inspect a listing, create a buyer-bound quote, confirm an existing payment, list the seller’s repositories, publish a listing, and unlist an authorized repository.</p>
        <p>Payments use Arc testnet. Agents bring their own wallet to sign a purchase; the MCP server never signs or broadcasts payments. Seller keys grant access only to that seller’s repositories.</p>
        <h2>Bazantic</h2>
        <p>Bazantic supports MCP gateways. Our setup document contains the gateway payload and registration steps verified against its public API. Gateway registration is pending; this page does not claim a published Bazantic integration.</p>
        <div className="agent-integration-links">
            <a className="btn btn-secondary" href="/api/agent-docs/bazantic" target="_blank" rel="noreferrer">Bazantic setup ↗</a>
            <a className="btn btn-secondary" href="/api/agent-docs" target="_blank" rel="noreferrer">Discovery JSON ↗</a>
        </div>
    </section>;
}
