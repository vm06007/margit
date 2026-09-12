import { randomUUID } from 'node:crypto';
import { createPublicClient, formatUnits, http, isAddress, verifyMessage, verifyTypedData, parseTransaction, recoverTransactionAddress, type Hex, type TypedDataDomain, type TransactionSerialized } from 'viem';
import { toAccount } from 'viem/accounts';
import { arcTestnet } from './payments.js';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';

export interface OneClawCredentials { agentId: string; apiKey: string; address: string }
export const oneClawStorage = {
    get: (key: string) => redis.get<string>(key),
    set: (key: string, value: string) => redis.set(key, value),
    del: (key: string) => redis.del(key),
};
const storageKey = (session: string) => `margit:oneclaw:${session}`;
async function request(path: string, body: unknown, token?: string) {
    const response = await fetch(`https://api.1claw.co${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
        body: JSON.stringify(body, (_, value) => typeof value === 'bigint' ? value.toString() : value),
    });
    if (!response.ok) throw new Error(`1Claw request failed (${response.status}). Check credentials and signing permissions.`);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid 1Claw response.');
    return result as Record<string, unknown>;
}
async function sign(input: OneClawCredentials, body: Record<string, unknown>) {
    const auth = await request('/v1/auth/agent-token', {agent_id: input.agentId, api_key: input.apiKey});
    if (typeof auth.access_token !== 'string') throw new Error('1Claw did not return an agent token.');
    return request(`/v1/agents/${input.agentId}/sign`, {chain: 'arc-testnet', ...body}, auth.access_token);
}
function validate(input: OneClawCredentials) {
    if (!input || typeof input.agentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.agentId) || typeof input.apiKey !== 'string' || !input.apiKey.startsWith('ocv_') || input.apiKey.length > 512 || !isAddress(input.address)) throw new Error('Enter a valid agent ID, agent API key (ocv_), and Ethereum signing address.');
}
export async function verifyOneClaw(input: OneClawCredentials) {
    validate(input);
    const message = `Margit connection verification only. No payment or authorization. Nonce: ${randomUUID()}`;
    const signed = await sign(input, {intent_type: 'personal_sign', message});
    if (typeof signed.signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(signed.signature) || !await verifyMessage({address: input.address as Hex, message, signature: signed.signature as Hex})) throw new Error('The signature does not match the supplied wallet address.');
    return {verified: true, address: input.address, chainId: arcTestnet.id};
}
export async function connectOneClaw(session: string, input: OneClawCredentials) {
    await verifyOneClaw(input);
    await oneClawStorage.set(storageKey(session), encryptToken(JSON.stringify(input)));
}
export async function disconnectOneClaw(session: string) { await oneClawStorage.del(storageKey(session)); }
export async function getOneClawIdentity(session: string) {
    const stored = await oneClawStorage.get(storageKey(session));
    if (!stored) throw new Error('Connect your 1Claw wallet first.');
    const input = JSON.parse(decryptToken(stored)) as OneClawCredentials;
    validate(input);
    return {address: input.address as Hex};
}
export async function oneClawAccount(session: string) {
    const identity = await getOneClawIdentity(session);
    // Re-read credentials for each signature so disconnect revokes subsequent operations.
    const credentials = async () => {
        const stored = await oneClawStorage.get(storageKey(session));
        if (!stored) throw new Error('1Claw wallet disconnected.');
        const input = JSON.parse(decryptToken(stored)) as OneClawCredentials;
        validate(input);
        if (input.address.toLowerCase() !== identity.address.toLowerCase()) throw new Error('Selected wallet changed. Start a new request.');
        return input;
    };
    return toAccount({
        address: identity.address,
        async signMessage() { throw new Error('Use the connection verification flow for message signing.'); },
        async signTypedData(data) {
            const domain = data.domain as TypedDataDomain | undefined;
            if (Number(domain?.chainId) !== arcTestnet.id || domain?.verifyingContract?.toLowerCase() !== '0x0077777d7eba4688bdef3e311b846f25870a19b9') throw new Error('Only Arc Circle Gateway typed payments are supported.');
            const result = await sign(await credentials(), {intent_type: 'typed_data', typed_data: data});
            if (typeof result.signature !== 'string' || !await verifyTypedData({...data, address: identity.address, signature: result.signature as Hex} as Parameters<typeof verifyTypedData>[0])) throw new Error('1Claw returned an invalid payment signature.');
            return result.signature as Hex;
        },
        async signTransaction(tx) {
            if (tx.chainId !== arcTestnet.id || !tx.to || tx.type !== 'eip1559' || tx.accessList?.length) throw new Error('Only Arc testnet EIP-1559 transactions are supported.');
            const result = await sign(await credentials(), {intent_type: 'transaction', tx_type: 2, to: tx.to, value: formatUnits(tx.value ?? 0n, 18), data: tx.data ?? '0x', nonce: tx.nonce, gas_limit: Number(tx.gas), max_fee_per_gas: String(tx.maxFeePerGas), max_priority_fee_per_gas: String(tx.maxPriorityFeePerGas)});
            if (typeof result.signed_tx !== 'string') throw new Error('1Claw did not return a signed transaction.');
            const raw = result.signed_tx as TransactionSerialized;
            const parsed = parseTransaction(raw);
            if (parsed.type !== 'eip1559') throw new Error('Unexpected transaction type.');
            if ((await recoverTransactionAddress({serializedTransaction: raw})).toLowerCase() !== identity.address.toLowerCase() || parsed.chainId !== tx.chainId || parsed.to?.toLowerCase() !== tx.to.toLowerCase() || (parsed.value ?? 0n) !== (tx.value ?? 0n) || (parsed.data ?? '0x') !== (tx.data ?? '0x') || parsed.nonce !== tx.nonce || parsed.gas !== tx.gas || parsed.maxFeePerGas !== tx.maxFeePerGas || parsed.maxPriorityFeePerGas !== tx.maxPriorityFeePerGas || parsed.accessList?.length) throw new Error('1Claw signed transaction does not match the requested payment.');
            return raw;
        },
    });
}
export async function oneClawBalance(session: string) {
    const {address} = await getOneClawIdentity(session);
    const native = await createPublicClient({chain: arcTestnet, transport: http()}).getBalance({address});
    const base = {mode: 'oneclaw' as const, address, usdc: formatUnits(native,18)};
    const circle = {provider:'Circle Gateway', network:'Arc testnet', walletType:'1Claw Agent Wallet', address};
    try {
        const response = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {'Content-Type':'application/json'}, body: JSON.stringify({token:'USDC',sources:[{depositor:address,domain:26}]})});
        if (!response.ok) throw new Error('Gateway unavailable');
        const data = await response.json() as {balances?: {balance:string}[]};
        const availableUsdc = data.balances?.[0]?.balance ?? '0';
        if (!/^\d+(\.\d+)?$/.test(availableUsdc)) throw new Error('Invalid Gateway balance');
        return {...base, circle:{...circle,availableUsdc,ready:Number(availableUsdc)>0}};
    } catch {
        return {...base, circle:{...circle,ready:false,error:'Circle Gateway balance is unavailable. Refresh before making an x402 purchase.'}};
    }
}
