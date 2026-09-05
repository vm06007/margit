import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { paymentMiddleware } from "@x402/hono";
import { createSession, destroySession, getSession } from "./session.js";
import { consumeState, issueState } from "./oauth-state.js";
import { ARC_TESTNET_NETWORK, arcSellerAddress, resourceServer } from "./x402-gateway.js";

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

const app = new Hono();

app.use(
    "/api/*",
    cors({
        origin: APP_URL,
        credentials: true,
    }),
);

// Proof-of-concept x402 paywall on Arc testnet — settled via Circle Gateway.
// Hitting this route unpaid returns 402 with payment requirements; a paying
// client (human wallet or an agent using @circle-fin/x402-batching's
// GatewayClient) gets the JSON body below once payment settles.
app.use(
    paymentMiddleware(
        {
            "GET /api/gateway/demo": {
                accepts: {
                    scheme: "exact",
                    price: "$0.01",
                    network: ARC_TESTNET_NETWORK,
                    payTo: arcSellerAddress ?? "0x0000000000000000000000000000000000000000",
                },
                description: "margit x402 gateway proof-of-concept (Arc testnet)",
            },
        },
        resourceServer,
    ),
);

app.get("/api/gateway/demo", (c) => {
    return c.json({
        message: "Payment verified on Arc testnet — this is the paywalled resource.",
        unlockedAt: new Date().toISOString(),
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

const port = Number(PORT);
serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[margit] API server listening on http://localhost:${info.port}`);
});
