import { useCallback, useState } from 'react';
import { Toast } from '../Toast';
import { CopyIcon } from '../icons';

const formats = ['MCP JSON', 'x402', 'cURL', 'SKILL.md'] as const;
type Format = typeof formats[number];

export function AgentIntegration() {
    const [format, setFormat] = useState<Format>('MCP JSON');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dismissError = useCallback(() => setError(null), []);
    const origin = window.location.origin;
    const snippets: Record<Format, { code: string; caption: string; filename: string }> = {
        'MCP JSON': {
            filename: 'mcp.json',
            caption: 'Add this server to your MCP client. Public discovery needs no API key.',
            code: JSON.stringify({ mcpServers: { margit: { url: `${origin}/api/mcp` } } }, null, 2),
        },
        'x402': {
            filename: 'x402 · Arc testnet · USDC',
            caption: 'Choose an x402-enabled listing. Fund your own Circle Gateway account with Arc testnet USDC, then use a Gateway-compatible x402 client to review and sign the 402 challenge within your approved budget. Set PAYMENT_SIGNATURE to its encoded payment payload; cURL alone does not sign or pay.',
            code: `# Replace LISTING_ID with an ID from /api/listings
# 1. Request access; inspect the HTTP 402 challenge.
curl -i '${origin}/api/listings/unlock?id=LISTING_ID'

# 2. Your x402 client signs the challenge.
# 3. Retry with its encoded payment payload.
curl --fail-with-body \\
  -H "PAYMENT-SIGNATURE: $PAYMENT_SIGNATURE" \\
  '${origin}/api/listings/unlock?id=LISTING_ID'

# Success returns repository access and expiry.
# Keep the returned access credentials private.`,
        },
        'cURL': {
            filename: 'Terminal',
            caption: 'Fetch the live connection details, tool list, and skill URLs.',
            code: `curl --fail --silent --show-error \\
  '${origin}/api/agent-docs'`,
        },
        'SKILL.md': {
            filename: 'Agent instructions',
            caption: 'Give this instruction to your agent to load the Margit skill.',
            code: `Read ${origin}/skills/margit/SKILL.md\nand use it to discover and interact with Margit.`,
        },
    };
    const snippet = snippets[format];
    const copy = async () => {
        try { await navigator.clipboard.writeText(snippet.code); setCopied(true); }
        catch { setError('Could not copy. Select the snippet and copy it manually.'); }
    };
    return <section className="mxd-section" id="for-agents">
        <div className="mxd-container"><div className="mxd-block agent-integration-home">
            <div className="agent-integration-intro">
                <h2>Built for agents, too.</h2>
                <p>Discover repositories through MCP, learn the workflow from SKILL.md, and pay for access with x402. Agents use USDC on Arc testnet through Circle Gateway: request access, sign the payment challenge, and receive repository access.</p>
                <div className="agent-integration-links">
                    <a className="agent-integration-link" href="/agents">Explore MCP <span aria-hidden="true">↗</span></a>
                    <a className="agent-integration-link" href="/skills/margit/SKILL.md" target="_blank" rel="noreferrer">Read SKILL.md <span aria-hidden="true">↗</span></a>
                </div>
            </div>
            <div className="agent-snippet">
                <div className="agent-snippet-toolbar">
                    <div className="agent-snippet-formats" role="group" aria-label="Code snippet format">
                        {formats.map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => { setFormat(value); setCopied(false); }}>{value}</button>)}
                    </div>
                    <button className="agent-snippet-copy" type="button" onClick={copy} aria-label={copied ? 'Snippet copied' : 'Copy snippet'}><CopyIcon /><span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span></button>
                </div>
                <div className="agent-snippet-body">
                    <span className="agent-snippet-filename">{snippet.filename}</span>
                    <pre tabIndex={0} aria-label={`${format} snippet`}><code>{snippet.code}</code></pre>
                </div>
                <p className="agent-snippet-caption">{snippet.caption}</p>
            </div>
        </div></div>
        {error && <Toast message={error} tone="error" onDismiss={dismissError} />}
    </section>;
}
