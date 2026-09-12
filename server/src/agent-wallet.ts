import { getOneClawIdentity, oneClawAccount } from './oneclaw.js';
import { createWalletClient, erc20Abi, parseAbi } from 'viem';
import { ARC_TOKEN_ADDRESSES } from './payments.js';
import { getCircleIdentity, circleDeposit } from './circle-managed.js';
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

export async function resolveAgentWallet(session = 'internal', previewMode?: 'shared' | 'personal' | 'circle' | 'oneclaw') {
    if (previewMode === 'personal') {
        await walletStorage.set(`margit:agent-wallet-key:${session}`, encryptToken(generatePrivateKey()), { nx: true });
    }
    const mode = previewMode ?? await walletStorage.get(`margit:agent-wallet-mode:${session}`);
    if (mode === 'oneclaw') return {mode: 'oneclaw' as const, privateKey: undefined, ...await getOneClawIdentity(session)};
    if (mode === 'circle') return { mode: 'circle' as const, privateKey: undefined, ...await getCircleIdentity(session) };
    const encrypted = mode === 'personal' ? await walletStorage.get(`margit:agent-wallet-key:${session}`) : null;
    if (mode === 'personal' && !encrypted) throw new Error('Personal wallet is unavailable.');
    const key = encrypted ? decryptToken(encrypted) : process.env.ARC_DEMO_BUYER_PRIVATE_KEY;
    if (!key) throw new Error('Agent wallet is not configured.');
    return { privateKey: key as `0x${string}`, mode: encrypted ? 'personal' as const : 'shared' as const };
}

export async function selectAgentWallet(session: string, mode: string) {
    if (mode !== 'shared' && mode !== 'personal' && mode !== 'circle' && mode !== 'oneclaw') throw new Error('Choose demo, personal, or Circle wallet.');
    if (mode === 'oneclaw') await getOneClawIdentity(session);
    if (mode === 'circle') await getCircleIdentity(session);
    if (mode === 'personal') {
        await walletStorage.set(`margit:agent-wallet-key:${session}`, encryptToken(generatePrivateKey()), { nx: true });
    }
    await walletStorage.set(`margit:agent-wallet-mode:${session}`, mode);
}

export async function depositAgentGateway(session: string, amount: string, requestId: string) {
    if (!/^\d+(\.\d{1,6})?$/.test(amount) || parseUnits(amount, 6) <= 0n) throw new Error('Enter a positive USDC amount with at most 6 decimals.');
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) throw new Error('Invalid deposit request.');
    const selected = await resolveAgentWallet(session);
    const { privateKey } = selected;
    const address = (selected.mode === 'circle' || selected.mode === 'oneclaw') ? selected.address : privateKeyToAccount(privateKey!).address;
    const receiptKey = `margit:gateway-deposit:${session}:${requestId}`;
    const existing = await redis.get<{depositTxHash: string}>(receiptKey);
    if (existing) return existing;
    const lock = `margit:gateway-deposit-lock:${address}`;
    if (selected.mode === 'circle') {
        if (!await redis.set(lock, requestId, { nx: true })) throw new Error('A deposit is pending. Do not retry.');
        const result = await circleDeposit(session, address, amount);
        await redis.set(receiptKey, result);
        await redis.del(lock);
        return result;
    }
    if (selected.mode === 'oneclaw') {
        const client = createPublicClient({chain: arcTestnet, transport: http()});
        if (await client.getBalance({address}) < parseUnits(amount,18)+parseUnits('0.01',18)) throw new Error('Insufficient USDC. Leave 0.01 USDC for gas.');
        if (!await redis.set(lock, requestId, {nx:true})) throw new Error('A deposit is pending reconciliation.');
        const wallet = createWalletClient({account: await oneClawAccount(session), chain: arcTestnet, transport:http()});
        const gateway = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const;
        const token = ARC_TOKEN_ADDRESSES.USDC as `0x${string}`;
        const units = parseUnits(amount,6);
        const allowance = await client.readContract({address:token, abi:erc20Abi, functionName:'allowance', args:[address,gateway]});
        if (allowance < units) {
            const hash = await wallet.writeContract({address:token, abi:erc20Abi, functionName:'approve',args:[gateway,units]});
            if ((await client.waitForTransactionReceipt({hash})).status !== 'success') throw new Error('Gateway approval failed.');
        }
        const depositTxHash = await wallet.writeContract({address:gateway, abi:parseAbi(['function deposit(address token,uint256 amount)']), functionName:'deposit',args:[token,units]});
        if ((await client.waitForTransactionReceipt({hash:depositTxHash})).status !== 'success') throw new Error('Gateway deposit failed.');
        const result = {depositTxHash,amount};
        await redis.set(receiptKey,result);
        await redis.del(lock);
        return result;
    }
    const balance = await createPublicClient({chain: arcTestnet, transport: http()}).getBalance({address});
    if (balance < parseUnits(amount, 18) + parseUnits('0.01', 18)) throw new Error('Insufficient wallet USDC. Leave at least 0.01 USDC for gas, then fund the wallet or choose a smaller amount.');
    if (!await redis.set(lock, requestId, { nx: true })) throw new Error('A deposit is pending. Refresh balances before trying again.');
    // Keep the lock on uncertain failures to prevent a second deposit after a timeout.
    const client = new GatewayClient({ chain: 'arcTestnet', privateKey: privateKey! });
    let result;
    try { result = await client.deposit(amount); }
    catch { throw new Error('Deposit could not be confirmed. Do not retry yet; check the wallet on Arc explorer. The deposit is locked for review to avoid duplicate transfers.'); }
    const receipt = { depositTxHash: result.depositTxHash, amount };
    await redis.set(receiptKey, receipt);
    await redis.del(lock);
    return receipt;
}
