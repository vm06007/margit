import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.KV_REST_API_URL='https://example.invalid';
process.env.KV_REST_API_TOKEN='test';
const {checkoutPrice,convertUsdToEur}=await import('../src/exchange-rates.js');
const {checkoutAmountLabel}=await import('../../shared/checkout.js');

test('conversion rounds to token precision and display preserves exact payable amount',()=>{
    assert.equal(convertUsdToEur(50_000n,0.875),43_750n);
    assert.equal(convertUsdToEur(1n,0.5),1n);
    assert.equal(checkoutAmountLabel('43750'),'0.04375');
    assert.equal(checkoutAmountLabel('1000000'),'1.00');
    assert.throws(()=>convertUsdToEur(1n,NaN));
    assert.throws(()=>convertUsdToEur(1n,-1));
});

test('EURC fails closed on missing, stale or invalid rates; USDC is independent; valid rates cache',async t=>{
    let calls=0;
    let payload:unknown={base:'USD',quote:'EUR',rate:0.875,date:'2000-01-01'};
    let fail=true;
    t.mock.method(globalThis,'fetch',async()=>{calls++;if(fail)throw new Error('offline');return Response.json(payload)});
    assert.equal((await checkoutPrice('$0.05','USDC')).amount,'50000');assert.equal(calls,0);
    await assert.rejects(checkoutPrice('$0.05','EURC'));
    fail=false;
    await assert.rejects(checkoutPrice('$0.05','EURC'),/out of date/);
    payload={base:'USD',quote:'EUR',rate:0,date:new Date().toISOString().slice(0,10)};
    await assert.rejects(checkoutPrice('$0.05','EURC'),/Invalid/);
    payload={base:'USD',quote:'EUR',rate:0.875,date:new Date().toISOString().slice(0,10)};
    assert.equal((await checkoutPrice('$0.05','EURC')).amount,'43750');
    const before=calls;
    fail=true;
    assert.equal((await checkoutPrice('$1.00','EURC')).amount,'875000');assert.equal(calls,before);
});
