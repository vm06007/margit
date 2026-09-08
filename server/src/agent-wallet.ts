import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { parseUnits, createPublicClient, http } from 'viem';
import { arcTestnet } from './payments.js';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';

export const walletStorage = {
    get: (key: string) => redis.get<string>(key),
    set: (key: string, value: string, options?: {nx: true}) => options ? redis.set(key, value, options) : redis.set(key, value),
};

export async function resolveAgentWallet(session = 'internal') {
    const mode = await walletStorage.get(`margit:agent-wallet-mode:${session}`);
    const encrypted = mode === 'personal' ? await walletStorage.get(`margit:agent-wallet-key:${session}`) : null;
    if (mode === 'personal' && !encrypted) throw new Error('Personal wallet is unavailable.');
    const key = encrypted ? decryptToken(encrypted) : process.env.ARC_DEMO_BUYER_PRIVATE_KEY;
    if (!key) throw new Error('Agent wallet is not configured.');
    return { privateKey: key as `0x${string}`, mode: encrypted ? 'personal' as const : 'shared' as const };
}

export async function selectAgentWallet(session: string, mode: string) {
    if (mode !== 'shared' && mode !== 'personal') throw new Error('Choose shared or personal.');
    if (mode === 'personal') {
        await walletStorage.set(`margit:agent-wallet-key:${session}`, encryptToken(generatePrivateKey()), { nx: true });
    }
    await walletStorage.set(`margit:agent-wallet-mode:${session}`, mode);
}

export async function depositAgentGateway(session: string, amount: string, requestId: string) {
    if (!/^\d+(\.\d{1,6})?$/.test(amount) || parseUnits(amount, 6) <= 0n) throw new Error('Enter a positive USDC amount with at most 6 decimals.');
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) throw new Error('Invalid deposit request.');
    const { privateKey } = await resolveAgentWallet(session);
    const address = privateKeyToAccount(privateKey).address;
    const receiptKey = `margit:gateway-deposit:${session}:${requestId}`;
    const existing = await redis.get<{depositTxHash: string}>(receiptKey);
    if (existing) return existing;
    const balance = await createPublicClient({chain: arcTestnet, transport: http()}).getBalance({address});
    if (balance < parseUnits(amount, 18) + parseUnits('0.01', 18)) throw new Error('Insufficient wallet USDC. Leave at least 0.01 USDC for gas, then fund the wallet or choose a smaller amount.');
    const lock = `margit:gateway-deposit-lock:${address}`;
    if (!await redis.set(lock, requestId, { nx: true })) throw new Error('A deposit is pending. Refresh balances before trying again.');
    // Keep the lock on uncertain failures to prevent a second deposit after a timeout.
    const client = new GatewayClient({ chain: 'arcTestnet', privateKey });
    let result;
    try { result = await client.deposit(amount); }
    catch { throw new Error('Deposit could not be confirmed. Do not retry yet; check the wallet on Arc explorer. The deposit is locked for review to avoid duplicate transfers.'); }
    const receipt = { depositTxHash: result.depositTxHash, amount };
    await redis.set(receiptKey, receipt);
    await redis.del(lock);
    return receipt;
}
