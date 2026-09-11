import { useState } from 'react';

export function OneClawVerification() {
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const [result,setResult] = useState<{address:string;usdc:string} | null>(null);
    return <div className="agent-circle-status">
        <strong>Verify 1Claw connection</strong>
        <p className="hint">Verify your 1Claw signing wallet and its Arc testnet balance. This signs a connection message only. Purchasing is not enabled yet.</p>
        <form onSubmit={async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            setBusy(true); setError(''); setResult(null);
            const input = {agentId:String(fields.get('agentId')).trim(),apiKey:String(fields.get('apiKey')).trim(),address:String(fields.get('address')).trim()};
            (form.elements.namedItem('apiKey') as HTMLInputElement).value = '';
            try {
                const response = await fetch('/api/agent/oneclaw/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Verification failed');
                setResult(data);
            } catch (error) { setError(error instanceof Error ? error.message : 'Verification failed'); }
            finally { setBusy(false); }
        }}>
            <label>Agent ID<input name="agentId" className="agent-input" required disabled={busy} /></label>
            <label>Agent API key<input name="apiKey" className="agent-input" type="password" autoComplete="off" required disabled={busy} /></label>
            <label>Ethereum signing address<input name="address" className="agent-input" placeholder="0x…" required disabled={busy} /></label>
            <p className="hint">Use an agent key (ocv_), with Intents and message signing enabled. Credentials are used for this check only and are not saved.</p>
            <button type="submit" className="btn btn-default btn-accent btn-small" disabled={busy}>{busy ? 'Verifying…' : 'Verify 1Claw wallet'}</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {result && <div role="status"><strong>Signature verified · Arc testnet</strong><p style={{overflowWrap:'anywhere'}}><a href={`https://testnet.arcscan.app/address/${result.address}`} target="_blank" rel="noreferrer">{result.address} ↗</a></p><p>{Number(result.usdc).toFixed(2)} USDC</p><small>Connection verified. Contract checkout and Gateway still require integration testing.</small></div>}
        <a href="https://docs.1claw.co/docs/agents/intents/overview" target="_blank" rel="noreferrer">1Claw setup documentation ↗</a>
    </div>;
}
