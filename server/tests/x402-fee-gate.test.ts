import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from 'hono';
import { createX402FeeGate } from '../src/x402-fee-gate.js';
import { x402FeesPaused } from '../src/fee-eligibility.js';

test('debt threshold uses exact USDC units',()=>{
    assert.equal(x402FeesPaused('0.999999'),false);
    assert.equal(x402FeesPaused('1'),true);
    assert.equal(x402FeesPaused('1.000001'),true);
});
function fixture() {
    const state={owed:'1',locked:false,payments:0,fail:false};
    const app=new Hono();
    app.use('/unlock',createX402FeeGate({
        identify:async()=>({id:'123',ledgerLogin:'old-name',aliases:['old-name','new-name']}),
        owed:async()=>state.owed,
        reserve:async()=>{if(state.locked)return false;state.locked=true;return true;},
        release:async()=>{state.locked=false;},
    }));
    app.get('/unlock',c=>{state.payments++;if(state.fail)return c.json({error:'uncertain'},500);state.owed='1.00025';return c.json({paid:true});});
    app.get('/access/existing',c=>c.text('existing access'));
    return {app,state};
}
test('all listings and both signed and unsigned requests stop before payment at threshold',async()=>{
    const {app,state}=fixture();
    for(const id of ['first','second'])for(const headers of [{},{'payment-signature':'fixture'}]){
        const response=await app.request('/unlock?id='+id,{headers});
        assert.equal(response.status,403);assert.equal(state.locked,false);
    }
    assert.equal(state.payments,0);
    assert.equal((await app.request('/access/existing')).status,200);
});
test('payment below threshold may cross it; next sale stops; paying debt resumes',async()=>{
    const {app,state}=fixture();state.owed='0.999';
    const request=()=>app.request('/unlock',{headers:{'payment-signature':'fixture'}});
    assert.equal((await request()).status,200);assert.equal(state.locked,false);
    assert.equal((await request()).status,403);assert.equal(state.payments,1);
    state.owed='0';assert.equal((await request()).status,200);assert.equal(state.payments,2);
});
test('concurrent or uncertain paid requests cannot start another settlement',async()=>{
    const {app,state}=fixture();state.owed='0';state.locked=true;
    assert.equal((await app.request('/unlock',{headers:{'payment-signature':'fixture'}})).status,409);
    assert.equal(state.payments,0);
    state.locked=false;state.fail=true;
    assert.equal((await app.request('/unlock',{headers:{'payment-signature':'fixture'}})).status,500);
    assert.equal(state.locked,true);
});
