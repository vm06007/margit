import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { payWithCircle, validateCircleChallenge } from '../src/circle-payment.js';

// Public test fixture key only; all HTTP is mocked and no RPC is contacted.
const fixtureKey = `0x${'11'.repeat(32)}` as const;
const seller = `0x${'22'.repeat(20)}`;
const endpoint = 'https://margit.example/api/listings/unlock?id=fixture';
function fixture() {
    const client = new GatewayClient({ chain: 'arcTestnet', privateKey: fixtureKey });
    const requirements = { scheme: 'exact', network: 'eip155:5042002', asset: client.chainConfig.usdc,
        amount: '50000', payTo: seller, maxTimeoutSeconds: 300,
        extra: { name: 'GatewayWalletBatched', version: '1', verifyingContract: client.chainConfig.gatewayWallet } };
    return { client, requirements, expected: { seller, amount: 50000n, usdc: client.chainConfig.usdc, gatewayWallet: client.chainConfig.gatewayWallet } };
}

test('payment policy rejects mainnet, changed price, recipient, asset and verifier', () => {
    const { requirements, expected } = fixture();
    validateCircleChallenge(requirements, expected);
    validateCircleChallenge({ ...requirements, amount: "5000000" }, { ...expected, amount: 5000000n });
    for (const change of [{ amount: '100001' }, { amount: '49999' }, { amount: '0' }, { amount: '0.05' },
        { network: 'eip155:8453' }, { payTo: `0x${'33'.repeat(20)}` }, { asset: seller },
        { extra: { ...requirements.extra, verifyingContract: seller } }]) {
        assert.throws(() => validateCircleChallenge({ ...requirements, ...change }, expected));
    }
});

test('real Circle SDK signs the challenge and exposes receipt evidence without leaking its signature', async () => {
    const { client, requirements } = fixture();
    let calls = 0;
    let didSign = false;
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        calls++;
        if (calls === 1) return new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({ x402Version: 2,
            resource: { url: endpoint, description: 'Test repo', mimeType: 'application/json' }, accepts: [requirements] })).toString('base64') } });
        const payload = JSON.parse(Buffer.from(new Headers(init?.headers).get('Payment-Signature')!, 'base64').toString());
        assert.match(payload.payload.signature, /^0x[0-9a-f]+$/i);
        assert.equal(payload.payload.authorization.value, '50000');
        return Response.json({ cloneUrl: 'https://margit.example/api/access/private/repo.git' }, { headers: {
            'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({ success: true, network: 'eip155:5042002', payer: client.address, transaction: 'batch-reference' })).toString('base64'),
        } });
    };
    try {
        const result = await payWithCircle({ client, url: endpoint, seller, amount: 50000n,
            beforeSign: async () => {}, afterSign: async () => { didSign = true; } });
        assert.equal(calls, 2);
        assert.equal(didSign, true);
        assert.equal(result.proof.amountUsdc, '0.05');
        assert.equal(result.proof.provider, 'Circle Gateway');
        assert.equal(result.proof.transactionHash, undefined);
        assert.equal(result.proof.settlementReference, 'batch-reference');
        assert.match(result.proof.paymentId, /^[0-9a-f]{64}$/);
        assert.equal(JSON.stringify(result.proof).includes('signature'), false);
    } finally { globalThis.fetch = original; }
});

test('changed-price challenge stops before signing or a paid retry', async () => {
    const { client, requirements } = fixture();
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls++;
        return new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({ x402Version: 2,
            accepts: [{ ...requirements, amount: '100001' }] })).toString('base64') } });
    };
    try {
        await assert.rejects(payWithCircle({ client, url: endpoint, seller, amount: 50000n,
            beforeSign: async () => {}, afterSign: async () => { assert.fail('must not sign'); } }), /price/);
        assert.equal(calls, 1);
    } finally { globalThis.fetch = original; }
});

test('an unpaid HTTP 200 never produces Circle payment proof', async () => {
    const { client } = fixture();
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ cloneUrl: 'https://margit.example/api/access/private/repo.git' });
    try {
        await assert.rejects(payWithCircle({ client, url: endpoint, seller, amount: 50000n,
            beforeSign: async () => {}, afterSign: async () => {} }), /No verified Circle payment/);
    } finally { globalThis.fetch = original; }
});
