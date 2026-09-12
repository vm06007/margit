import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { parseUnits } from 'viem';
import { connectOneClaw, disconnectOneClaw, getOneClawIdentity, oneClawAccount, oneClawStorage } from '../oneclaw.js';

// Synthetic credentials and signer; no network requests or real funds.
const signer = privateKeyToAccount(`0x${'12'.repeat(32)}`);
const input = {agentId:'11111111-1111-4111-8111-111111111111',apiKey:'ocv_test_only',address:signer.address};
const tx = {chainId:5042002,type:'eip1559' as const,to:signer.address,value:123n,gas:21000n,nonce:0,maxFeePerGas:20n,maxPriorityFeePerGas:1n};
const typed = {domain:{name:'GatewayWalletBatched',version:'1',chainId:5042002,verifyingContract:'0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const}, types:{Test:[{name:'amount',type:'uint256'}]},primaryType:'Test',message:{amount:1n}} as const;
test('1Claw stores encrypted credentials, validates remote signatures and honors disconnect', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
    const saved = new Map<string,string>();
    const original = {...oneClawStorage};
    const oldFetch = globalThis.fetch;
    let tamper = false;
    let calls = 0;
    oneClawStorage.get = async key => saved.get(key) ?? null;
    oneClawStorage.set = async (key,value) => {saved.set(key,value); return 'OK';};
    oneClawStorage.del = async key => Number(saved.delete(key));
    globalThis.fetch = async (url, options) => {
        calls++;
        assert.ok(String(url).startsWith('https://api.1claw.co/v1/'));
        const body = JSON.parse(String(options?.body));
        if (String(url).endsWith('agent-token')) return Response.json({access_token:'test-token'});
        assert.equal(body.chain,'arc-testnet');
        if (body.intent_type === 'personal_sign') return Response.json({signature:await signer.signMessage({message:body.message})});
        if (body.intent_type === 'typed_data') return Response.json({signature:await signer.signTypedData(body.typed_data)});
        assert.equal(parseUnits(body.value,18),tx.value);
        return Response.json({signed_tx:await signer.signTransaction({...tx,value:tamper ? 999n : tx.value})});
    };
    try {
        await connectOneClaw('test',input);
        assert.ok(![...saved.values()][0].includes(input.apiKey));
        assert.equal((await getOneClawIdentity('test')).address, signer.address);
        const account = await oneClawAccount('test');
        await account.signTypedData(typed);
        const before = calls;
        await assert.rejects(account.signTypedData({...typed,domain:{...typed.domain,chainId:1}}), /Only Arc/);
        assert.equal(calls,before);
        await account.signTransaction(tx);
        tamper = true;
        await assert.rejects(account.signTransaction(tx), /does not match/);
        await disconnectOneClaw('test');
        await assert.rejects(account.signTransaction(tx), /disconnected/);
        await assert.rejects(getOneClawIdentity('test'), /Connect/);
    } finally { globalThis.fetch=oldFetch; Object.assign(oneClawStorage,original); }
});
