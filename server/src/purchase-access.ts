import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { redis } from "./redis.js";
import { encryptToken, decryptToken } from "./crypto.js";
import { getOwnerTokenForListing, getRefreshedSellerCredential, type Listing } from "./listings.js";
import { parseAccessPolicy, type AccessPolicy } from "../../shared/accessPolicy.js";

interface Grant { repo: string; credential: string; policy: AccessPolicy; expiresAt: number }
const keyFor = (token: string) => `margit:access:${createHash("sha256").update(token).digest("hex")}`;

/** Fail closed before requesting payment; a browser login is not required for delivery. */
export async function checkRepositoryDelivery(listing: Listing): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const credential = (await getRefreshedSellerCredential(listing.ownerLogin)) ?? await getOwnerTokenForListing(listing.id);
        if (!credential) return { ok: false, error: "Sales are temporarily unavailable because the seller’s GitHub connection needs attention. No payment was requested." };
        const response = await fetch(`https://api.github.com/repos/${listing.repoFullName}/zipball`, {
            headers: { Authorization: `Bearer ${credential}`, "User-Agent": "margit" },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
        });
        const available = response.ok && !!response.body;
        await response.body?.cancel();
        if (available) return { ok: true };
        return { ok: false, error: "This repository cannot be delivered right now. Sales are temporarily unavailable until the seller restores GitHub access. No payment was requested." };
    } catch {
        return { ok: false, error: "We couldn’t confirm repository delivery. Please try again shortly. No payment was requested." };
    }
}
export async function mintCloneResponse(listing: Listing, purchase?: { token: string; purchasedAt: number }) {
    const credential = (await getRefreshedSellerCredential(listing.ownerLogin)) ?? await getOwnerTokenForListing(listing.id);
    if (!credential) return null;
    const policy = parseAccessPolicy(listing.accessPolicy);
    const token = purchase?.token ?? randomBytes(32).toString("hex");
    const expiresAt = (purchase?.purchasedAt ?? Date.now()) + policy.minutes * 60000;
    if (expiresAt > Date.now()) await redis.set(keyFor(token), { repo: listing.repoFullName, credential: encryptToken(credential), policy, expiresAt }, { px: Math.max(1, expiresAt - Date.now()), nx: true });
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
        const credential = (await getRefreshedSellerCredential(grant.repo.split("/")[0])) ?? decryptToken(grant.credential);
        const url = zip ? `https://api.github.com/repos/${grant.repo}/zipball` : `https://github.com/${grant.repo}.git/${refs ? "info/refs?service=git-upload-pack" : "git-upload-pack"}`;
        const upstream = await fetch(url, {
            method: pack ? "POST" : "GET",
            headers: { Authorization: `Basic ${Buffer.from(`x-access-token:${credential}`).toString("base64")}`, "User-Agent": "margit", ...(pack ? { "Content-Type": "application/x-git-upload-pack-request" } : {}), ...(!zip && c.req.header("Git-Protocol") === "version=2" ? { "Git-Protocol": "version=2" } : {}) },
            body: pack ? await c.req.arrayBuffer() : undefined,
            redirect: zip ? "follow" : "error",
        });
        if (!upstream.ok || !upstream.body) {
            await upstream.body?.cancel();
            if (grant.policy.mode === "single_download") await redis.del(claimKey);
            if (upstream.status === 401) return c.json({ error: "GitHub rejected the seller’s connection. The seller needs to reconnect GitHub before this repository can be downloaded." }, 502);
            if (upstream.status === 403 || upstream.status === 404) return c.json({ error: "GitHub cannot provide this repository. The seller should check their repository access and GitHub connection." }, 502);
            return c.json({ error: "GitHub could not start repository delivery. Please retry while your link is valid." }, 502);
        }
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
