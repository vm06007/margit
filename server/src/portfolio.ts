import { confirmFeePayment, feeContract, sellerFees } from './fees.js';
import { sellerFeeId } from '../../shared/fees.js';
import { indexedPurchases } from "./graph.js";
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createPublicClient, http, isAddress } from 'viem';
import { arcTestnet } from './payments.js';
import { redis } from './redis.js';
import { getSession } from './session.js';
import { getPurchaseAccess, listPurchaseHistory } from './purchases.js';
const client = createPublicClient({ chain: arcTestnet, transport: http() });
const cookieOptions = { httpOnly: true, secure: (process.env.APP_URL ?? '').startsWith('https'), sameSite: 'Lax' as const, path: '/' };
export const portfolio = new Hono();
portfolio.use('*', async (c,next) => { c.header('Cache-Control','no-store'); await next(); });
portfolio.post('/challenge', async c => {
    const { address } = await c.req.json<{address: string}>();
    if (!isAddress(address)) return c.json({error:'Invalid wallet address'},400);
    const nonce = randomBytes(24).toString('hex');
    const message = `Sign in to Margit Portfolio\nOrigin: ${process.env.APP_URL ?? 'http://localhost:5173'}\nWallet: ${address.toLowerCase()}\nNonce: ${nonce}\nThis signature does not authorize payments. Expires in 5 minutes.`;
    await redis.set(`margit:portfolio:nonce:${nonce}`,{ address: address.toLowerCase(), message },{ex:300});
    setCookie(c,'margit_portfolio_nonce',nonce,{...cookieOptions,maxAge:300});
    return c.json({message});
});
portfolio.post('/verify', async c => {
    const nonce = getCookie(c,'margit_portfolio_nonce');
    const challenge = nonce ? await redis.get<{address:`0x${string}`;message:string}>(`margit:portfolio:nonce:${nonce}`) : null;
    if (!challenge) return c.json({error:'Sign-in challenge expired'},401);
    const {signature} = await c.req.json<{signature:`0x${string}`}>();
    let valid = false;
    try { valid = await client.verifyMessage({address:challenge.address,message:challenge.message,signature}); } catch { /* Invalid signature */ }
    if (!valid) return c.json({error:'Wallet signature could not be verified'},401);
    if (!await redis.del(`margit:portfolio:nonce:${nonce}`)) return c.json({error:'Challenge already used'},401);
    const session = randomBytes(32).toString('hex');
    await redis.set(`margit:portfolio:session:${session}`,challenge.address,{ex:28800});
    setCookie(c,'margit_portfolio',session,{...cookieOptions,maxAge:28800});
    return c.json({address:challenge.address});
});
async function walletFor(session?:string) {return session ? await redis.get<string>(`margit:portfolio:session:${session}`) : undefined;}
portfolio.get('/',async c => {
    const wallet = await walletFor(getCookie(c,'margit_portfolio'));
    const github = await getSession(getCookie(c,'margit_session'));
    const operator = getCookie(c,'margit_agent_session');
    const [purchases,sales,agentPurchases] = await Promise.all([
        wallet ? listPurchaseHistory('buyer',wallet) : [],
        github ? listPurchaseHistory('seller',github.login.toLowerCase()) : [],
        operator ? listPurchaseHistory('operator',operator) : [],
    ]);
    const graph = await indexedPurchases([...purchases,...agentPurchases,...sales]);
    return c.json({wallet:wallet ?? null,seller:github?.login ?? null,purchases:[...new Map([...purchases,...agentPurchases].map(p=>[p.id,p])).values()],sales,graph,fees:github ? await sellerFees(github.login,sales) : []});
});
portfolio.get('/:id/access',async c => {
    const result = await getPurchaseAccess(c.req.param('id'),(await walletFor(getCookie(c,'margit_portfolio'))) ?? undefined,getCookie(c,'margit_agent_session'));
    if (!result) return c.json({error:'Purchase not found'},404);
    if ('expired' in result) return c.json({error:'Access expired under the seller’s delivery terms.'},410);
    return c.json(result);
});

portfolio.post('/fees/prepare',async c=>{
    const github=await getSession(getCookie(c,'margit_session'));
    if (!github) return c.json({error:'Connect GitHub to settle publisher fees.'},401);
    try {
        const sales=await listPurchaseHistory('seller',github.login.toLowerCase());
        const summary=await sellerFees(github.login,sales);
        return c.json({contract:feeContract(),sellerId:sellerFeeId(github.login),amount:summary.find(s=>s.currency==='USDC')!.owed});
    } catch(e){return c.json({error:e instanceof Error?e.message:'Could not prepare payment'},400);}
});
portfolio.post('/fees/confirm',async c=>{
    const github=await getSession(getCookie(c,'margit_session'));
    if (!github) return c.json({error:'Connect GitHub to confirm publisher fees.'},401);
    try {
        const {transactionHash}=await c.req.json<{transactionHash:string}>();
        return c.json(await confirmFeePayment(github.login,transactionHash));
    } catch(e){return c.json({error:e instanceof Error?e.message:'Could not confirm payment'},400);}
});
