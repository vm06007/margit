import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { authenticateSellerIdentity, identityStorage } from '../src/seller-identity.js';

test('verified GitHub ID preserves ledger and historical aliases across renames; rejects account reuse',async()=>{
    const values=new Map<string,unknown>(); const sets=new Map<string,Set<string>>();
    mock.method(identityStorage,'get',async(key:string)=>values.get(key)??null);
    mock.method(identityStorage,'set',async(key:string,value:unknown,options?:{nx?:boolean})=>{if(options?.nx&&values.has(key))return null;values.set(key,value);return 'OK';});
    mock.method(identityStorage,'sadd',async(key:string,value:string)=>{const set=sets.get(key)??new Set();set.add(value);sets.set(key,set);return 1;});
    mock.method(identityStorage,'smembers',async(key:string)=>[...(sets.get(key)??[])]);
    let user={id:123,login:'original'};
    mock.method(globalThis,'fetch',async()=>Response.json(user));
    try {
        const initial=await authenticateSellerIdentity('fixture-token-1','original');
        values.set('margit:seller-login-id:original',123); // Redis may deserialize numeric strings.
        user={id:123,login:'renamed'};
        const renamed=await authenticateSellerIdentity('fixture-token-2','renamed');
        assert.equal(renamed.id,initial.id);
        assert.equal(renamed.ledgerLogin,'original');
        assert.deepEqual(new Set(renamed.aliases),new Set(['original','renamed']));
        user={id:999,login:'original'};
        await assert.rejects(authenticateSellerIdentity('fixture-token-3','original'),/identity changed/);
        assert.equal(String(values.get('margit:seller-login-id:original')),'123');
    } finally { mock.restoreAll(); }
});
