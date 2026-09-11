import { randomUUID } from 'node:crypto';
import { createPublicClient, formatUnits, http, isAddress, verifyMessage } from 'viem';
import { arcTestnet } from './payments.js';

/** A connection probe only: never submits transactions or stores credentials. */
export async function verifyOneClaw(input: {agentId: string; apiKey: string; address: string}) {
    if (!/^[0-9a-f-]{36}$/i.test(input.agentId) || !input.apiKey.startsWith('ocv_') || input.apiKey.length > 512 || !isAddress(input.address)) {
        throw new Error('Enter a valid agent ID, agent API key (ocv_), and Ethereum signing address.');
    }
    async function request(path: string, body: unknown, token?: string) {
        const response = await fetch(`https://api.1claw.co${path}`, {
            method: 'POST', signal: AbortSignal.timeout(15000),
            headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`1Claw request failed (${response.status}). Check credentials, the Ethereum signing key, and message-signing permission.`);
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid 1Claw response.');
        return result as Record<string, unknown>;
    }
    const auth = await request('/v1/auth/agent-token', {agent_id:input.agentId, api_key:input.apiKey});
    const token = auth.access_token;
    if (typeof token !== 'string') throw new Error('1Claw did not return an agent token.');
    const message = `Margit connection verification only. No payment or authorization. Nonce: ${randomUUID()}`;
    const signed = await request(`/v1/agents/${input.agentId}/sign`, {intent_type:'personal_sign',chain:'ethereum',message}, token);
    const signature = signed.signature;
    if (typeof signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(signature) || !await verifyMessage({address:input.address,message,signature:signature as `0x${string}`})) {
        throw new Error('The signature does not match the supplied wallet address.');
    }
    const client = createPublicClient({chain:arcTestnet,transport:http()});
    const balance = await client.getBalance({address:input.address});
    return {verified:true,address:input.address,usdc:formatUnits(balance,18),chainId:arcTestnet.id,paymentsEnabled:false};
}
