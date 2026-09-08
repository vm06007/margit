import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.ARC_DEMO_BUYER_PRIVATE_KEY = `0x${'11'.repeat(32)}`;
process.env.KV_REST_API_URL = 'https://redis.example';
process.env.KV_REST_API_TOKEN = 'fixture';
const { resolveAgentWallet, selectAgentWallet, depositAgentGateway, walletStorage } = await import('../src/agent-wallet.js');

test('personal wallets are encrypted, isolated, and restored when switching modes', async () => {
    const storage = new Map<string, string>();
    mock.method(walletStorage, 'get', async (key: string) => storage.get(key) ?? null);
    mock.method(walletStorage, 'set', async (key: string, value: string, options?: {nx?: boolean}) => {
        if (options?.nx && storage.has(key)) return null;
        storage.set(key, value); return 'OK';
    });
    try {
        assert.equal((await resolveAgentWallet('alice')).mode, 'shared');
        await Promise.all([selectAgentWallet('alice', 'personal'), selectAgentWallet('alice', 'personal')]);
        const alice = await resolveAgentWallet('alice');
        assert.equal(alice.mode, 'personal');
        assert.notEqual(storage.get('margit:agent-wallet-key:alice'), alice.privateKey);
        assert.equal((await resolveAgentWallet('bob')).mode, 'shared');
        await selectAgentWallet('bob', 'personal');
        assert.notEqual((await resolveAgentWallet('bob')).privateKey, alice.privateKey);
        await selectAgentWallet('alice', 'shared');
        assert.equal((await resolveAgentWallet('alice')).privateKey, process.env.ARC_DEMO_BUYER_PRIVATE_KEY);
        await selectAgentWallet('alice', 'personal');
        assert.equal((await resolveAgentWallet('alice')).privateKey, alice.privateKey);
        storage.delete('margit:agent-wallet-key:alice');
        await assert.rejects(resolveAgentWallet('alice'), /unavailable/);
    } finally { mock.restoreAll(); }
});

test('deposits reject invalid amounts and IDs before accessing funds', async () => {
    for (const amount of ['0', '-1', '1e3', '0.0000001', 'NaN']) {
        await assert.rejects(depositAgentGateway('alice', amount, '00000000-0000-0000-0000-000000000000'), /positive/);
    }
    await assert.rejects(depositAgentGateway('alice', '1', 'bad'), /Invalid/);
});
