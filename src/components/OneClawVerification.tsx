import { useState } from 'react';

export function OneClawVerification({ onConnected, disabled = false }: { onConnected: () => void; disabled?: boolean }) {
    const [busy,setBusy] = useState(false);
    const [error,setError] = useState('');
    const [connected,setConnected] = useState(false);
    return <div className="agent-circle-status">
        <strong>Connect 1Claw wallet</strong>
        <p className="hint">Connect your 1Claw signer for requested purchases and Gateway deposits on Arc testnet.</p>
        <form onSubmit={async event => {
            event.preventDefault();
            const form = event.currentTarget;
            const fields = new FormData(form);
            setBusy(true); setError(''); setConnected(false);
            const input = {agentId:String(fields.get('agentId')).trim(),apiKey:String(fields.get('apiKey')).trim(),address:String(fields.get('address')).trim()};
            (form.elements.namedItem('apiKey') as HTMLInputElement).value = '';
            try {
                const response = await fetch('/api/agent/oneclaw/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,acceptedTerms:fields.get('consent') === 'on'})});
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Verification failed');
                setConnected(true); onConnected();
            } catch (error) { setError(error instanceof Error ? error.message : 'Verification failed'); }
            finally { setBusy(false); }
        }}>
            <label>Agent ID<input name="agentId" className="agent-input" required disabled={busy || disabled} /></label>
            <label>Agent API key<input name="apiKey" className="agent-input" type="password" autoComplete="off" required disabled={busy || disabled} /></label>
            <label>Ethereum signing address<input name="address" className="agent-input" placeholder="0x…" required disabled={busy || disabled} /></label>
            <p className="hint">Enable Intents for arc-testnet, personal signing, transaction signing, and typed-data signing for the Circle Gateway contract. Your private key stays with 1Claw.</p>
            <label className="agent-circle-consent"><input name="consent" type="checkbox" required disabled={busy || disabled} />Store my agent credentials encrypted in Margit and use this wallet for my requested purchases and deposits.</label>
            <button type="submit" className="btn btn-default btn-accent btn-small" disabled={busy || disabled}>{busy ? 'Verifying…' : 'Connect and select wallet'}</button>
        </form>
        {error && <p role="alert">{error}</p>}
        {connected && <p role="status">1Claw wallet connected and selected.</p>}
        <a href="https://docs.1claw.co/docs/agents/intents/overview" target="_blank" rel="noreferrer">1Claw setup documentation ↗</a>
    </div>;
}
