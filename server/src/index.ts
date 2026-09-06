import { randomBytes } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { paymentMiddleware } from "@x402/hono";
import type { HTTPRequestContext } from "@x402/core/server";
import { createSession, destroySession, getSession } from "./session.js";
import { consumeState, issueState } from "./oauth-state.js";
import { ARC_TESTNET_NETWORK, resourceServer } from "./x402-gateway.js";
import {
    createListing,
    deleteListing,
    getListing,
    getOwnerTokenForListing,
    listListings,
    type Listing,
} from "./listings.js";
import { resolveArcNsReverse, resolvePayoutAddress } from "./names.js";
import { priceToAtomicUnits, verifyDirectPayment, type PaymentToken } from "./payments.js";
import { getAgentWalletBalance, runAgentTurn } from "./agent.js";

const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI,
    APP_URL = "http://localhost:5173",
    PORT = "8787",
} = process.env;

if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_REDIRECT_URI) {
    console.warn(
        "[margit] Missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / GITHUB_REDIRECT_URI in .env — " +
        "the Connect with GitHub button will fail until these are set. See .env.example.",
    );
}

const SESSION_COOKIE = "margit_session";
const AGENT_SESSION_COOKIE = "margit_agent_session";
const PRICE_PATTERN = /^\$\d+(\.\d{1,2})?$/;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_CHARS = 2_000_000; // ~1.5MB decoded

const app = new Hono();

async function resolveListingFromContext(ctx: HTTPRequestContext): Promise<Listing> {
    const id = ctx.adapter.getQueryParam?.("id");
    const listing = typeof id === "string" ? await getListing(id) : undefined;
    if (!listing) throw new Error(`Unknown listing id: ${String(id)}`);
    return listing;
}

app.use(
    "/api/*",
    cors({
        origin: APP_URL,
        credentials: true,
    }),
);

// x402 paywall on Arc testnet, settled via Circle's Gateway facilitator. Price and
// payout address are resolved per-listing from the `id` query param, so one static
// route can sell access to any listing.
app.use(
    paymentMiddleware(
        {
            "GET /api/listings/unlock": {
                accepts: {
                    scheme: "exact",
                    network: ARC_TESTNET_NETWORK,
                    price: async (ctx) => (await resolveListingFromContext(ctx)).price,
                    payTo: async (ctx) => (await resolveListingFromContext(ctx)).payoutAddress,
                },
                description: "Unlock a margit repo listing (Arc testnet)",
            },
        },
        resourceServer,
    ),
);

async function mintCloneResponse(listing: Listing) {
    const ownerToken = await getOwnerTokenForListing(listing.id);
    if (!ownerToken) return null;
    return {
        repoFullName: listing.repoFullName,
        cloneUrl: `https://x-access-token:${ownerToken}@github.com/${listing.repoFullName}.git`,
        note: "This URL embeds a live credential — clone it now. It is not re-issued; pay again to get a fresh one.",
    };
}

app.get("/api/listings/unlock", async (c) => {
    const id = c.req.query("id");
    const listing = id ? await getListing(id) : undefined;
    if (!listing) return c.json({ error: "Unknown listing" }, 404);

    const response = await mintCloneResponse(listing);
    if (!response) return c.json({ error: "Listing has no stored credentials" }, 500);
    return c.json(response);
});

// Direct-payment path: buyer sends USDC straight to the seller's payout address
// (no Circle Gateway deposit required) and submits the tx hash here for
// verification. Meant for humans buying once; the x402 unlock endpoint above
// is better suited to agents making repeated gasless payments via Gateway.
app.post("/api/listings/:id/verify-payment", async (c) => {
    const listing = await getListing(c.req.param("id"));
    if (!listing) return c.json({ error: "Unknown listing" }, 404);

    const { txHash, token } = await c.req.json<{ txHash?: string; token?: PaymentToken }>();
    if (!txHash) return c.json({ error: "txHash is required" }, 400);
    const paymentToken: PaymentToken = token === "EURC" ? "EURC" : "USDC";

    const result = await verifyDirectPayment(
        txHash,
        listing.payoutAddress,
        priceToAtomicUnits(listing.price),
        paymentToken,
    );
    if (!result.ok) return c.json({ error: result.reason ?? "Payment could not be verified" }, 400);

    const response = await mintCloneResponse(listing);
    if (!response) return c.json({ error: "Listing has no stored credentials" }, 500);
    return c.json(response);
});

// Convenience for buyers who don't want to use `git clone` — proxies a zip
// download through our server (GitHub's codeload response doesn't send CORS
// headers our origin can read, so the browser can't fetch it directly).
// Only usable with a clone URL the buyer already legitimately holds — this
// grants no access beyond what that URL's embedded token already allows.
const CLONE_URL_PATTERN = /^https:\/\/x-access-token:([^@]+)@github\.com\/([\w.-]+\/[\w.-]+)\.git$/;

app.post("/api/download-zip", async (c) => {
    const { cloneUrl } = await c.req.json<{ cloneUrl?: string }>();
    const match = cloneUrl ? CLONE_URL_PATTERN.exec(cloneUrl) : null;
    if (!match) return c.json({ error: "Invalid clone URL" }, 400);
    const [, token, repoFullName] = match;

    const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/zipball`, {
        headers: { Authorization: `token ${token}`, "User-Agent": "margit" },
    });
    if (!ghRes.ok || !ghRes.body) {
        return c.json({ error: `GitHub declined the download (${ghRes.status})` }, 502);
    }

    const repoName = repoFullName.split("/")[1];
    return new Response(ghRes.body, {
        status: 200,
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${repoName}.zip"`,
        },
    });
});

// Agent sidebar: a chat-driven shopping assistant with its own funded Arc-testnet
// wallet, independent of any human buyer's connected wallet. Conversation history
// is keyed off an anonymous per-visitor cookie, not GitHub login — browsing/buying
// doesn't require an account.
app.get("/api/agent/wallet", async (c) => {
    return c.json(await getAgentWalletBalance());
});

app.post("/api/agent/chat", async (c) => {
    let sessionId = getCookie(c, AGENT_SESSION_COOKIE);
    if (!sessionId) {
        sessionId = randomBytes(16).toString("hex");
        setCookie(c, AGENT_SESSION_COOKIE, sessionId, {
            httpOnly: true,
            sameSite: "Lax",
            secure: APP_URL.startsWith("https"),
            path: "/",
            maxAge: 60 * 60 * 24,
        });
    }

    const { message } = await c.req.json<{ message?: string }>();
    if (!message || !message.trim()) return c.json({ error: "message is required" }, 400);

    const result = await runAgentTurn(sessionId, message.trim());
    return c.json(result);
});

app.get("/api/auth/github/login", async (c) => {
    const state = await issueState();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", GITHUB_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", GITHUB_REDIRECT_URI ?? "");
    url.searchParams.set("scope", "read:user repo");
    url.searchParams.set("state", state);
    return c.redirect(url.toString());
});

app.get("/api/auth/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");

    if (!(await consumeState(state))) {
        return c.text("Invalid or expired OAuth state.", 400);
    }
    if (!code) {
        return c.text("Missing OAuth code.", 400);
    }

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: GITHUB_REDIRECT_URI,
        }),
    });
    const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        error?: string;
        error_description?: string;
    };

    if (!tokenJson.access_token) {
        return c.text(`GitHub OAuth error: ${tokenJson.error_description ?? tokenJson.error ?? "unknown"}`, 400);
    }

    const userRes = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            Accept: "application/vnd.github+json",
        },
    });
    const user = (await userRes.json()) as { login: string; name: string | null; avatar_url: string };

    const sessionId = await createSession({
        githubAccessToken: tokenJson.access_token,
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url,
    });

    setCookie(c, SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "Lax",
        secure: APP_URL.startsWith("https"),
        path: "/",
        maxAge: 60 * 60 * 8,
    });

    return c.redirect(APP_URL);
});

app.post("/api/auth/logout", async (c) => {
    await destroySession(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
});

app.post("/api/auth/revoke", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    const session = await getSession(sessionId);
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    // Revokes the OAuth grant itself (not just our session) — GitHub will
    // require re-approval on next sign-in. https://docs.github.com/en/rest/apps/oauth-applications
    const basicAuth = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString("base64");
    const revokeRes = await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/grant`, {
        method: "DELETE",
        headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: session.githubAccessToken }),
    });

    await destroySession(sessionId);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });

    if (!revokeRes.ok && revokeRes.status !== 404) {
        return c.json({ error: `GitHub declined to revoke the grant (${revokeRes.status})` }, 502);
    }
    return c.body(null, 204);
});

app.get("/api/me", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ authenticated: false }, 401);
    return c.json({
        authenticated: true,
        login: session.login,
        name: session.name,
        avatarUrl: session.avatarUrl,
    });
});

app.get("/api/repos", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const reposRes = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator",
        {
            headers: {
                Authorization: `Bearer ${session.githubAccessToken}`,
                Accept: "application/vnd.github+json",
            },
        },
    );

    if (!reposRes.ok) {
        return c.json({ error: "Failed to fetch repos from GitHub" }, 502);
    }

    const repos = (await reposRes.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        description: string | null;
        html_url: string;
        stargazers_count: number;
        language: string | null;
        updated_at: string;
        owner: { login: string; type: string };
    }>;
    return c.json(
        repos.map((r) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            private: r.private,
            description: r.description,
            htmlUrl: r.html_url,
            stargazersCount: r.stargazers_count,
            language: r.language,
            updatedAt: r.updated_at,
            ownerLogin: r.owner.login,
            isOrgOwned: r.owner.type === "Organization",
        })),
    );
});

app.post("/api/repos/make-private", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const { fullName } = await c.req.json<{ fullName?: string }>();
    if (!fullName) return c.json({ error: "fullName is required" }, 400);

    const patchRes = await fetch(`https://api.github.com/repos/${fullName}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${session.githubAccessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ private: true }),
    });

    if (!patchRes.ok) {
        const body = (await patchRes.json().catch(() => ({}))) as { message?: string };
        const status = patchRes.status === 403 || patchRes.status === 404 ? patchRes.status : 502;
        return c.json({ error: body.message ?? "Failed to convert repo to private" }, status);
    }

    return c.json({ ok: true });
});

app.get("/api/listings", async (c) => {
    return c.json(await listListings());
});

app.post("/api/listings", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const body = await c.req.json<{
        repoFullName?: string;
        price?: string;
        payoutAddress?: string;
        sellerDescription?: string;
        screenshots?: string[];
    }>();
    const { repoFullName, price, payoutAddress, sellerDescription, screenshots } = body;

    if (!repoFullName || !price || !payoutAddress) {
        return c.json({ error: "repoFullName, price, and payoutAddress are required" }, 400);
    }
    if (!PRICE_PATTERN.test(price)) {
        return c.json({ error: 'price must look like "$1.50"' }, 400);
    }
    if (sellerDescription && sellerDescription.length > MAX_DESCRIPTION_LENGTH) {
        return c.json({ error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` }, 400);
    }
    if (screenshots) {
        if (screenshots.length > MAX_SCREENSHOTS) {
            return c.json({ error: `at most ${MAX_SCREENSHOTS} screenshots` }, 400);
        }
        if (screenshots.some((s) => !s.startsWith("data:image/") || s.length > MAX_SCREENSHOT_CHARS)) {
            return c.json({ error: "each screenshot must be a data:image/... URL under 2MB" }, 400);
        }
    }

    let resolvedPayoutAddress: string;
    try {
        resolvedPayoutAddress = await resolvePayoutAddress(payoutAddress);
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : "Could not resolve payoutAddress" }, 400);
    }

    const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
        headers: {
            Authorization: `Bearer ${session.githubAccessToken}`,
            Accept: "application/vnd.github+json",
        },
    });
    if (!repoRes.ok) {
        return c.json({ error: "Repo not found or not accessible with your GitHub token" }, 404);
    }
    const repo = (await repoRes.json()) as {
        owner: { login: string };
        description: string | null;
        language: string | null;
        stargazers_count: number;
    };
    // MVP: only the repo's direct owner can list it (excludes org-owned repos for now).
    if (repo.owner.login.toLowerCase() !== session.login.toLowerCase()) {
        return c.json({ error: "You can only list repos you own" }, 403);
    }

    const listing = await createListing({
        repoFullName,
        ownerLogin: session.login,
        ownerGithubToken: session.githubAccessToken,
        price,
        payoutAddress: resolvedPayoutAddress,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        sellerDescription: sellerDescription ?? null,
        screenshots: screenshots ?? [],
    });
    return c.json(listing, 201);
});

app.delete("/api/listings/:id", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const ok = await deleteListing(c.req.param("id"), session.login);
    if (!ok) return c.json({ error: "Listing not found or not yours" }, 404);
    return c.body(null, 204);
});

app.get("/api/resolve-name", async (c) => {
    const name = c.req.query("name");
    if (!name) return c.json({ error: "name is required" }, 400);
    try {
        const address = await resolvePayoutAddress(name);
        return c.json({ address });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : "Could not resolve name" }, 404);
    }
});

app.get("/api/resolve-address", async (c) => {
    const address = c.req.query("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return c.json({ error: "a valid 0x address is required" }, 400);
    }
    const name = await resolveArcNsReverse(address);
    return c.json({ name });
});

const port = Number(PORT);
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[margit] API server listening on http://localhost:${info.port}`);
});
