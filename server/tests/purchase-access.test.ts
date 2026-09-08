import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
process.env.KV_REST_API_URL = "https://example.invalid";
process.env.KV_REST_API_TOKEN = "test";
process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
process.env.APP_URL = "https://margit.example";

const { encryptToken } = await import("../src/crypto.js");
const { accessRoutes, mintCloneResponse } = await import("../src/purchase-access.js");
const { parseAccessPolicy } = await import("../../shared/accessPolicy.js");
const data = new Map<string, any>();
let upstream: () => Promise<Response>;
let accessSetOptions: unknown[][] = [];
const mockFetch: typeof fetch = async (url, init) => {
    if (String(url).startsWith("https://example.invalid")) {
        const commands = JSON.parse(String(init?.body));
        const run = ([command, key, value, ...options]: any[]) => {
            let result;
            if (command === "get") result = data.has(key) ? Buffer.from(JSON.stringify(data.get(key))).toString("base64") : null;
            else if (command === "del") result = Number(data.delete(key));
            else if (command === "sadd") { const values = new Set(data.get(key) ?? []); values.add(value); data.set(key,[...values]); result = 1; }
            else if (command === "smembers") result = (data.get(key) ?? []).map((v: string) => Buffer.from(v).toString("base64"));
            else if (command === "set") {
                if (key.startsWith("margit:access:")) accessSetOptions.push(options);
                if (options.includes("nx") && data.has(key)) result = null;
                else { let decoded; try { decoded = JSON.parse(value); } catch { decoded = value; } data.set(key, decoded); result = "OK"; }
            } else throw new Error(`Unexpected Redis command ${command}`);
            return { result };
        };
        return Response.json(Array.isArray(commands[0]) ? commands.map(run) : run(commands));
    }
    requests.push({ url: String(url), init });
    return upstream();
};
let requests: { url: string; init?: RequestInit }[];
beforeEach(() => {
    data.clear(); requests = []; accessSetOptions = [];
    data.set("margit:listing:test", { ownerLogin: "seller", encryptedOwnerToken: encryptToken("seller-secret") });
    globalThis.fetch = mockFetch;
    upstream = async () => new Response("test archive");
});
async function grant(mode: "window" | "single_download" = "window") {
    const response = await mintCloneResponse({ id: "test", ownerLogin: "seller", repoFullName: "seller/repo", accessPolicy: { mode, minutes: 10 } } as any);
    assert.ok(response);
    assert.ok(!JSON.stringify(response).includes("seller-secret"));
    return new URL(response.cloneUrl).pathname.replace("/api/access", "");
}
const request = (path: string, init?: RequestInit) => accessRoutes.request(`https://margit.example${path}`, init);
test("rejects invalid policy values; supplies default for old listings", () => {
    assert.deepEqual(parseAccessPolicy(undefined), { mode: "window", minutes: 10 });
    for (const policy of [null, {}, { mode: "window", minutes: -1 }, { mode: "forever", minutes: 10 }]) assert.throws(() => parseAccessPolicy(policy));
});
test("timed grants allow repeated ZIP and read-only Git requests for only their repository", async () => {
    const path = await grant();
    assert.equal((await request(path.replace("repo.git", "download.zip"))).status, 200);
    assert.equal((await request(path.replace("repo.git", "download.zip"))).status, 200);
    assert.equal((await request(`${path}/info/refs?service=git-upload-pack`)).status, 200);
    assert.equal((await request(`${path}/git-upload-pack`, { method: "POST", body: "git-request" })).status, 200);
    assert.equal((await request(`${path}/info/refs?service=git-receive-pack`)).status, 403);
    assert.equal((await request(`${path}/git-receive-pack`, { method: "POST" })).status, 403);
    assert.equal((await request(path.replace("repo.git", "other.git/info/refs?service=git-upload-pack"))).status, 403);
    assert.equal(requests.length, 4);
    assert.ok(requests.every(r => r.url.includes("seller/repo")));
});
test("one-time ZIP grants atomically allow only one start and forbid cloning", async () => {
    const path = await grant("single_download");
    assert.equal((await request(path.replace("download.zip", "repo.git/info/refs?service=git-upload-pack"))).status, 403);
    const results = await Promise.all([request(path), request(path)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 410]);
    assert.equal(requests.length, 1);
});
test("expired grants reject new downloads and Git requests", async () => {
    const path = await grant();
    for (const [key, value] of data) if (key.startsWith("margit:access:")) value.expiresAt = Date.now() - 1;
    assert.equal((await request(path.replace("repo.git", "download.zip"))).status, 410);
    assert.equal((await request(`${path}/info/refs?service=git-upload-pack`)).status, 410);
    assert.equal(requests.length, 0);
});
test("failed upstream response releases single-use claim before delivery starts", async () => {
    const path = await grant("single_download");
    upstream = async () => new Response("failure", { status: 500 });
    assert.equal((await request(path)).status, 502);
    upstream = async () => new Response("archive");
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("purchase channels default to both and enforce the selected payment method", async () => {
    const { allowsCheckout } = await import("../../shared/accessPolicy.js");
    for (const checkout of [undefined, "both", "wallet", "x402"] as const) {
        const policy = parseAccessPolicy({ mode: "window", minutes: 10, checkout });
        assert.equal(allowsCheckout(policy, "wallet"), checkout !== "x402");
        assert.equal(allowsCheckout(policy, "x402"), checkout !== "wallet");
    }
    assert.throws(() => parseAccessPolicy({ mode: "window", minutes: 10, checkout: "human" }));
});


test("purchase history is durable, idempotent, and does not disclose delivery credentials", async () => {
    const { recordPurchase, listPurchaseHistory, getPurchaseAccess } = await import("../src/purchases.js");
    const listing = { id:"test", repoFullName:"seller/repo", ownerLogin:"seller", price:"$5.00", accessPolicy:{mode:"window",minutes:10} } as any;
    const access = { cloneUrl:"https://margit.example/api/access/secret/repo.git", expiresAt:new Date(Date.now()+60000).toISOString() };
    const payment = {reference:"0xabc",buyerWallet:"0xbuyer",currency:"USDC",channel:"wallet"} as const;
    const id = await recordPurchase(listing,payment,access);
    assert.equal(await recordPurchase({...listing,price:"$99.00"},payment,access),id);
    const sales = await listPurchaseHistory("seller","seller");
    assert.equal(sales.length,1); assert.equal(sales[0].amount,"5.00");
    assert.ok(!JSON.stringify(sales).includes("secret"));
    assert.equal(await getPurchaseAccess(id,"0xother"),null);
    assert.deepEqual(await getPurchaseAccess(id,"0xbuyer"),{cloneUrl:access.cloneUrl,repoFullName:"seller/repo"});
    data.get(`margit:purchase:${id}`).expiresAt = new Date(0).toISOString();
    assert.deepEqual(await getPurchaseAccess(id,"0xbuyer"),{expired:true});
    assert.equal((await listPurchaseHistory("buyer","0xbuyer")).length,1);
});

test("seller reconnect repairs an existing grant without resetting its terms", async () => {
    const path = await grant("single_download");
    upstream = async () => new Response("Unauthorized", {status:401});
    const failed = await request(path);
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /reconnect GitHub/);
    const {refreshSellerCredential} = await import("../src/listings.js");
    await refreshSellerCredential("seller", "replacement-secret");
    upstream = async () => new Response("archive");
    assert.equal((await request(path)).status, 200);
    const headers = new Headers(requests.at(-1)?.init?.headers);
    assert.equal(headers.get("Authorization"), `Basic ${Buffer.from("x-access-token:replacement-secret").toString("base64")}`);
    assert.equal((await request(path)).status, 410);
});

test("delivery check blocks unavailable credentials and recovers after seller reconnect", async () => {
    const {checkRepositoryDelivery} = await import("../src/purchase-access.js");
    const {refreshSellerCredential} = await import("../src/listings.js");
    const listing = {id:"test",ownerLogin:"seller",repoFullName:"seller/repo"} as any;
    upstream = async () => new Response("Unauthorized", {status:401});
    assert.equal((await checkRepositoryDelivery(listing)).ok, false);
    await refreshSellerCredential("seller", "new-token");
    upstream = async () => new Response("archive");
    assert.equal((await checkRepositoryDelivery(listing)).ok, true);
    assert.equal(new Headers(requests.at(-1)?.init?.headers).get("Authorization"), "Bearer new-token");
    upstream = async () => {throw new Error("Network unavailable")};
    assert.equal((await checkRepositoryDelivery(listing)).ok, false);
});


test("permanent grants have no TTL, allow repeated delivery and remain recoverable", async t => {
    const {recordPurchase,getPurchaseAccess}=await import("../src/purchases.js");
    const listing={id:"test",ownerLogin:"seller",repoFullName:"seller/repo",price:"$1.00",accessPolicy:{mode:"permanent",minutes:10}} as any;
    const access=await mintCloneResponse(listing);
    assert.ok(access);assert.equal(access.expiresAt,null);
    assert.deepEqual(accessSetOptions,[["nx"]]);
    const id=await recordPurchase(listing,{reference:"permanent",buyerWallet:"0xbuyer",currency:"USDC",channel:"wallet"},access);
    const future=Date.now()+365*24*60*60*1000;
    t.mock.method(Date,"now",()=>future);
    const path=new URL(access.cloneUrl).pathname.replace("/api/access","");
    for(let i=0;i<2;i++) assert.equal((await request(path.replace("repo.git","download.zip"))).status,200);
    assert.equal((await request(`${path}/info/refs?service=git-upload-pack`)).status,200);
    assert.equal((await request(`${path}/git-receive-pack`,{method:"POST"})).status,403);
    assert.equal((await getPurchaseAccess(id,"0xbuyer"))?.cloneUrl,access.cloneUrl);
    assert.equal(await getPurchaseAccess(id,"0xother"),null);
});
test("cirBTC is opt-in, permanent policy accepts omitted expiry, and old terms keep their shape", async()=>{
    const {allowsPaymentToken}=await import("../../shared/accessPolicy.js");
    assert.deepEqual(parseAccessPolicy({mode:"window",minutes:10,checkout:"both"}),{mode:"window",minutes:10,checkout:"both"});
    assert.deepEqual(parseAccessPolicy({mode:"permanent"}),{mode:"permanent",minutes:10});
    assert.equal(allowsPaymentToken(undefined,"cirBTC"),false);
    assert.equal(allowsPaymentToken(parseAccessPolicy({mode:"permanent",acceptCirBTC:true}),"cirBTC"),true);
    assert.throws(()=>parseAccessPolicy({mode:"permanent",acceptCirBTC:"true"}));
});

test("every nonempty currency combination is supported and x402 follows USDC acceptance", async () => {
    const {acceptedPaymentTokens,allowsPaymentToken,allowsCheckout}=await import("../../shared/accessPolicy.js");
    const tokens=["USDC","EURC","cirBTC"] as const;
    assert.deepEqual(acceptedPaymentTokens(undefined),["USDC","EURC"]);
    assert.deepEqual(acceptedPaymentTokens({mode:"window",minutes:10,acceptCirBTC:true}),tokens);
    for(let mask=1;mask<8;mask++) {
        const selected=tokens.filter((_,index)=>mask & (1<<index));
        const policy=parseAccessPolicy({mode:"window",minutes:10,acceptedTokens:[...selected].reverse()});
        assert.deepEqual(acceptedPaymentTokens(policy),selected);
        for(const token of tokens) assert.equal(allowsPaymentToken(policy,token),selected.includes(token));
        assert.equal(allowsCheckout(policy,"wallet"),true);
        assert.equal(allowsCheckout(policy,"x402"),selected.includes("USDC"));
    }
    for(const acceptedTokens of [[],["BTC"],"USDC",null]) assert.throws(()=>parseAccessPolicy({mode:"window",minutes:10,acceptedTokens}));
    assert.throws(()=>parseAccessPolicy({mode:"window",minutes:10,checkout:"x402",acceptedTokens:["EURC"]}),/x402 requires USDC/);
    // Explicit selection supersedes the legacy opt-in flag.
    const explicit=parseAccessPolicy({mode:"window",minutes:10,acceptCirBTC:true,acceptedTokens:["EURC"]});
    assert.equal(allowsPaymentToken(explicit,"cirBTC"),false);
});

test('x402 history retains a valid Circle receipt without exposing access credentials', async () => {
    const {recordPurchase,listPurchaseHistory}=await import('../src/purchases.js');
    const {circleReceiptUrl}=await import('../../shared/paymentReceipt.js');
    const reference='7d5d3d90-96db-414c-a7e7-560524f6bc33';
    const listing={id:'receipt-test',repoFullName:'seller/repo',ownerLogin:'seller',price:'$0.05',accessPolicy:{mode:'window',minutes:10}} as any;
    await recordPurchase(listing,{reference:'receipt-test',buyerWallet:'0xbuyer',currency:'USDC',channel:'x402',gatewayReference:reference},{cloneUrl:'https://margit.example/api/access/private/repo.git',expiresAt:null});
    const history=await listPurchaseHistory('seller','seller');
    assert.equal(history[0].gatewayReference,reference);
    assert.equal(circleReceiptUrl(history[0].gatewayReference),`https://gateway-api-testnet.circle.com/v1/x402/transfers/${reference}`);
    assert.equal(circleReceiptUrl('https://example.com'),undefined);
    assert.equal(circleReceiptUrl('0x'+'ab'.repeat(32)),undefined);
    assert.ok(!JSON.stringify(history).includes('/access/private'));
});
