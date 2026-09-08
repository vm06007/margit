import { createHash } from 'node:crypto';
import { redis } from './redis.js';

export const identityStorage = {
    get: <T>(key:string) => redis.get<T>(key),
    set: (key:string,value:unknown,options?:{nx?:true;ex?:number}) => redis.set(key,value,options as {nx:true}),
    sadd: (key:string,value:string) => redis.sadd(key,value),
    smembers: (key:string) => redis.smembers<string[]>(key),
};

export interface SellerIdentity { id: string; ledgerLogin: string; aliases: string[] }
// A permanent GitHub ID owns the ledger. Keep the first login as the legacy
// contract receipt identifier, so existing fee payments remain recoverable.
export async function authenticateSellerIdentity(token: string, historicalLogin: string): Promise<SellerIdentity> {
    const tokenKey = 'margit:seller-token-id:' + createHash('sha256').update(token).digest('hex');
    let user = await identityStorage.get<{id:number;login:string}>(tokenKey);
    if (!user) {
        const response = await fetch('https://api.github.com/user', {headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json'}});
        if (!response.ok) throw new Error('Reconnect GitHub to verify seller fee eligibility.');
        const result = await response.json() as {id:number;login:string};
        if (!Number.isSafeInteger(result.id) || typeof result.login !== 'string') throw new Error('Invalid GitHub seller identity');
        user = {id:result.id,login:result.login};
        await identityStorage.set(tokenKey,user,{ex:300});
    }
    const id = String(user.id);
    const alias = historicalLogin.toLowerCase();
    // Never let a different account inherit an old account's fee identity.
    for (const name of new Set([alias,user.login.toLowerCase()])) {
        await identityStorage.set('margit:seller-login-id:'+name,id,{nx:true});
        if (String(await identityStorage.get<string | number>('margit:seller-login-id:'+name)) !== id) throw new Error('Seller login identity changed; account migration requires review.');
        await identityStorage.sadd('margit:seller-aliases:'+id,name);
    }
    await identityStorage.set('margit:seller-ledger-login:'+id,alias,{nx:true});
    return {id,ledgerLogin:(await identityStorage.get<string>('margit:seller-ledger-login:'+id))!,aliases:await identityStorage.smembers('margit:seller-aliases:'+id)};
}
