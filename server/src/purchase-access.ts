import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { redis } from "./redis.js";
import { encryptToken, decryptToken } from "./crypto.js";
import { getOwnerTokenForListing, type Listing } from "./listings.js";
import { parseAccessPolicy, type AccessPolicy } from "../../shared/accessPolicy.js";

interface Grant { repo: string; credential: string; policy: AccessPolicy; expiresAt: number }
const keyFor = (token: string) => `margit:access:${createHash("sha256").update(token).digest("hex")}`;
export async function mintCloneResponse(listing: Listing) {
    const credential = await getOwnerTokenForListing(listing.id);
    if (!credential) return null;
    const policy = parseAccessPolicy(listing.accessPolicy);
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + policy.minutes * 60000;
    await redis.set(keyFor(token), { repo: listing.repoFullName, credential: encryptToken(credential), policy, expiresAt }, { ex: policy.minutes * 60 });
    const base = process.env.APP_URL ?? "http://localhost:5173";
    const path = policy.mode === "single_download" ? "download.zip" : "repo.git";
    return { repoFullName: listing.repoFullName, cloneUrl: new URL(`/api/access/${token}/${path}`, base).href, expiresAt: new Date(expiresAt).toISOString(), accessPolicy: policy };
}

export const accessRoutes = new Hono();
accessRoutes.use("*", bodyLimit({ maxSize: 10 * 1024 * 1024 }));
accessRoutes.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
});
accessRoutes.all("/:token/*", async c => {
    const token = c.req.param("token");
    if (!/^[a-f0-9]{64}$/.test(token)) return c.json({ error: "Invalid access link" }, 404);
    const key = keyFor(token);
    const grant = await redis.get<Grant>(key);
    if (!grant || grant.expiresAt <= Date.now()) return c.json({ error: "This access link has expired or has already been used." }, 410);
    const path = c.req.path.split(`/${token}/`)[1];
    const zip = path === "download.zip" && c.req.method === "GET";
    const refs = path === "repo.git/info/refs" && c.req.method === "GET" && c.req.query("service") === "git-upload-pack";
    const pack = path === "repo.git/git-upload-pack" && c.req.method === "POST";
    if (!zip && !(grant.policy.mode === "window" && (refs || pack))) return c.json({ error: "This operation is not included in your access terms." }, 403);
    // A separate atomic claim prevents concurrent requests consuming a one-time grant twice.
    const claimKey = `${key}:claimed`;
    if (grant.policy.mode === "single_download") {
        const claimed = await redis.set(claimKey, "1", { nx: true, px: Math.max(1, grant.expiresAt - Date.now()) });
        if (!claimed) return c.json({ error: "This download has already started." }, 410);
    }
    try {
        const credential = decryptToken(grant.credential);
        const url = zip ? `https://api.github.com/repos/${grant.repo}/zipball` : `https://github.com/${grant.repo}.git/${refs ? "info/refs?service=git-upload-pack" : "git-upload-pack"}`;
        const upstream = await fetch(url, {
            method: pack ? "POST" : "GET",
            headers: { Authorization: `Basic ${Buffer.from(`x-access-token:${credential}`).toString("base64")}`, "User-Agent": "margit", ...(pack ? { "Content-Type": "application/x-git-upload-pack-request" } : {}), ...(!zip && c.req.header("Git-Protocol") === "version=2" ? { "Git-Protocol": "version=2" } : {}) },
            body: pack ? await c.req.arrayBuffer() : undefined,
            redirect: zip ? "follow" : "error",
        });
        if (!upstream.ok || !upstream.body) throw new Error("upstream");
        return new Response(upstream.body, { headers: {
            "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
            "Content-Type": zip ? "application/zip" : refs ? "application/x-git-upload-pack-advertisement" : "application/x-git-upload-pack-result",
            ...(zip ? { "Content-Disposition": `attachment; filename="${grant.repo.split("/")[1]}.zip"` } : {}),
        } });
    } catch {
        if (grant.policy.mode === "single_download") await redis.del(claimKey);
        return c.json({ error: "Repository delivery could not start. Please retry while your link is valid." }, 502);
    }
});
