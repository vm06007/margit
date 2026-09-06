import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { paymentMiddleware } from "@x402/hono";
import type { HTTPRequestContext } from "@x402/core/server";
import { createSession, destroySession, getSession } from "./session.js";
import { consumeState, issueState } from "./oauth-state.js";
import { ARC_TESTNET_NETWORK, resourceServer } from "./x402-gateway.js";
import { createListing, getListing, getOwnerTokenForListing, listListings, type Listing } from "./listings.js";

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
const PRICE_PATTERN = /^\$\d+(\.\d{1,2})?$/;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

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

app.get("/api/listings/unlock", async (c) => {
    const id = c.req.query("id");
    const listing = id ? await getListing(id) : undefined;
    if (!listing) return c.json({ error: "Unknown listing" }, 404);

    const ownerToken = await getOwnerTokenForListing(listing.id);
    if (!ownerToken) return c.json({ error: "Listing has no stored credentials" }, 500);

    return c.json({
        repoFullName: listing.repoFullName,
        cloneUrl: `https://x-access-token:${ownerToken}@github.com/${listing.repoFullName}.git`,
        note: "This URL embeds a live credential — clone it now. It is not re-issued; pay again to get a fresh one.",
    });
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

    const repos = (await reposRes.json()) as Array<Record<string, unknown>>;
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
        })),
    );
});

app.get("/api/listings", async (c) => {
    return c.json(await listListings());
});

app.post("/api/listings", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const body = await c.req.json<{ repoFullName?: string; price?: string; payoutAddress?: string }>();
    const { repoFullName, price, payoutAddress } = body;

    if (!repoFullName || !price || !payoutAddress) {
        return c.json({ error: "repoFullName, price, and payoutAddress are required" }, 400);
    }
    if (!PRICE_PATTERN.test(price)) {
        return c.json({ error: 'price must look like "$1.50"' }, 400);
    }
    if (!EVM_ADDRESS_PATTERN.test(payoutAddress)) {
        return c.json({ error: "payoutAddress must be a 0x-prefixed 20-byte EVM address" }, 400);
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
    const repo = (await repoRes.json()) as { owner: { login: string } };
    // MVP: only the repo's direct owner can list it (excludes org-owned repos for now).
    if (repo.owner.login.toLowerCase() !== session.login.toLowerCase()) {
        return c.json({ error: "You can only list repos you own" }, 403);
    }

    const listing = await createListing({
        repoFullName,
        ownerLogin: session.login,
        ownerGithubToken: session.githubAccessToken,
        price,
        payoutAddress,
    });
    return c.json(listing, 201);
});

const port = Number(PORT);
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[margit] API server listening on http://localhost:${info.port}`);
});
