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
const mockFetch: typeof fetch = async (url, init) => {
    if (String(url).startsWith("https://example.invalid")) {
        const commands = JSON.parse(String(init?.body));
        const run = ([command, key, value, ...options]: any[]) => {
            let result;
            if (command === "get") result = data.has(key) ? Buffer.from(JSON.stringify(data.get(key))).toString("base64") : null;
            else if (command === "del") result = Number(data.delete(key));
            else if (command === "set") {
                if (options.includes("nx") && data.has(key)) result = null;
                else { data.set(key, JSON.parse(value)); result = "OK"; }
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
    data.clear(); requests = [];
    data.set("margit:listing:test", { encryptedOwnerToken: encryptToken("seller-secret") });
    globalThis.fetch = mockFetch;
    upstream = async () => new Response("test archive");
});
async function grant(mode: "window" | "single_download" = "window") {
    const response = await mintCloneResponse({ id: "test", repoFullName: "seller/repo", accessPolicy: { mode, minutes: 10 } } as any);
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
