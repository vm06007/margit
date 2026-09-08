import { serve } from "@hono/node-server";
import { createX402FeeGate } from "./x402-fee-gate.js";
import { selectAgentWallet, depositAgentGateway } from "./agent-wallet.js";
import { createMcpRoutes } from "./mcp.js";
import { createAgentDocs } from "./agent-docs.js";
import { createHash } from "node:crypto";
import { portfolio } from "./portfolio.js";
import { checkoutRoutes } from "./checkout.js";
import { recordPurchase } from "./purchases.js";
import { accessRoutes, mintCloneResponse, checkRepositoryDelivery } from "./purchase-access.js";
import { allowsCheckout, parseAccessPolicy } from "../../shared/accessPolicy.js";
import { normalizeDemoUrl } from "../../shared/demoUrl.js";
import { randomBytes } from "node:crypto";
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
    listListings,
    refreshSellerCredential, getRefreshedSellerCredential,
    type Listing,
} from "./listings.js";
import { resolveArcNsReverse, resolvePayoutAddress } from "./names.js";
import { priceToAtomicUnits, verifyDirectPayment, type PaymentToken } from "./payments.js";
import {
    createListingForUser,
    getAgentSettings,
    getAgentWalletBalance,
    listAgentModels,
    listMyRepos,
    runAgentTurn,
    unlistRepoForUser,
    updateAgentSettings,
} from "./agent.js";
import { createApiKey, resolveApiKey } from "./api-keys.js";

const {
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_REDIRECT_URI,
} = process.env;
const APP_URL = process.env.APP_URL?.trim() || "http://localhost:5173";

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

export const app = new Hono();
app.route("/api/mcp", createMcpRoutes(async (path, init) => app.request(path, init), APP_URL));
app.route("/api/agent-docs", createAgentDocs(APP_URL));

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

// Reject unsupported checkout before x402 can settle a payment.
app.use("/api/listings/unlock", async (c, next) => {
    const listing = await getListing(c.req.query("id") ?? "");
    if (listing && !allowsCheckout(listing.accessPolicy, "x402")) return c.json({ error: "This listing only accepts wallet checkout." }, 403);
    if (!listing) return c.json({ error: "Listing not found" }, 404);
    const delivery = await checkRepositoryDelivery(listing);
    if (!delivery.ok) return c.json({ error: delivery.error }, 503);
    await next();
});
app.use("/api/listings/unlock", createX402FeeGate());

app.post("/api/listings/:id/check-delivery", async c => {
    c.header("Cache-Control", "no-store");
    const listing = await getListing(c.req.param("id"));
    if (!listing) return c.json({ error: "Listing not found" }, 404);
    if (!allowsCheckout(listing.accessPolicy, "wallet")) return c.json({ error: "This listing requires x402 checkout." }, 403);
    const delivery = await checkRepositoryDelivery(listing);
    return delivery.ok ? c.json({ ok: true }) : c.json({ error: delivery.error }, 503);
});

app.route("/api/portfolio", portfolio);
app.route("/api/checkout", checkoutRoutes);
app.use("/api/listings/unlock", async (c, next) => {
    const listing = await getListing(c.req.query("id") ?? "");
    await next();
    const settledHeader = c.res.headers.get("payment-response") ?? c.res.headers.get("x-payment-response");
    if (!listing || !c.res.ok || !settledHeader) return;
    const settlement = JSON.parse(Buffer.from(settledHeader, "base64").toString());
    if (!settlement.success) return;
    const signedHeader = c.req.header("payment-signature") ?? c.req.header("x-payment") ?? "";
    const payload = JSON.parse(Buffer.from(signedHeader, "base64").toString());
    const authorization = payload.payload?.authorization;
    const payer = settlement.payer ?? authorization?.from;
    if (typeof payer !== "string" || !/^0x[0-9a-f]{40}$/i.test(payer)) throw new Error("Settled payment has no verifiable payer");
    const access = await c.res.clone().json() as {cloneUrl:string;expiresAt:string|null};
    const reference = `x402:${createHash("sha256").update(`${payer.toLowerCase()}:${authorization?.nonce ?? signedHeader}`).digest("hex")}`;
    await recordPurchase(listing, {reference,buyerWallet:payer,currency:"USDC",channel:"x402",gatewayReference:settlement.transaction,transactionHash: /^0x[0-9a-f]{64}$/i.test(settlement.transaction ?? "") ? settlement.transaction : undefined}, access);
});

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

app.route("/api/access", accessRoutes);

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
    if (process.env.CHECKOUT_CONTRACT_ADDRESS) return c.json({ error: "Use contract checkout for new purchases." }, 410);
    const listing = await getListing(c.req.param("id"));
    if (!listing) return c.json({ error: "Unknown listing" }, 404);

    if (!allowsCheckout(listing.accessPolicy, "wallet")) return c.json({ error: "This listing only accepts x402 checkout." }, 403);

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
    await recordPurchase(listing, { reference: txHash, buyerWallet: result.payer!, currency: paymentToken, channel: "wallet", transactionHash: txHash }, response);
    return c.json(response);
});

// Old credential-bearing URLs are no longer accepted by the delivery endpoint.
app.post("/api/download-zip", c => c.json({ error: "Use the scoped access link from your purchase." }, 410));

// Agent sidebar: a chat-driven shopping assistant with its own funded Arc-testnet
// wallet, independent of any human buyer's connected wallet. Conversation history
// is keyed off an anonymous per-visitor cookie, not GitHub login — browsing/buying
// doesn't require an account.
function getOrCreateAgentSessionId(c: Parameters<typeof getCookie>[0]): string {
    let sessionId = getCookie(c, AGENT_SESSION_COOKIE);
    if (!sessionId) {
        sessionId = randomBytes(16).toString("hex");
        setCookie(c, AGENT_SESSION_COOKIE, sessionId, {
            httpOnly: true,
            sameSite: "Lax",
            secure: APP_URL.startsWith("https"),
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
        });
    }
    return sessionId;
}

app.get("/api/agent/wallet", async (c) => {
    return c.json(await getAgentWalletBalance(getOrCreateAgentSessionId(c)));
});

app.post("/api/agent/wallet", async (c) => {
    const session = getOrCreateAgentSessionId(c);
    const { mode } = await c.req.json();
    if (mode !== 'shared' && mode !== 'personal') return c.json({error: 'Invalid wallet mode'}, 400);
    await selectAgentWallet(session, mode);
    return c.json(await getAgentWalletBalance(session));
});
app.post("/api/agent/gateway-deposit", async (c) => {
    const { amount, requestId } = await c.req.json();
    if (typeof amount !== 'string' || typeof requestId !== 'string') return c.json({error: 'Amount and request ID required'}, 400);
    try { return c.json(await depositAgentGateway(getOrCreateAgentSessionId(c), amount, requestId)); }
    catch (error) { return c.json({error: error instanceof Error ? error.message : 'Deposit failed'}, 400); }
});

app.post("/api/agent/chat", async (c) => {
    const sessionId = getOrCreateAgentSessionId(c);
    const githubSession = await getSession(getCookie(c, SESSION_COOKIE));

    const { message } = await c.req.json<{ message?: string }>();
    if (!message || !message.trim()) return c.json({ error: "message is required" }, 400);

    const result = await runAgentTurn(sessionId, message.trim(), githubSession);
    return c.json(result);
});

app.get("/api/agent/settings", async (c) => {
    const sessionId = getOrCreateAgentSessionId(c);
    return c.json(await getAgentSettings(sessionId));
});

app.post("/api/agent/settings", async (c) => {
    const sessionId = getOrCreateAgentSessionId(c);
    const { apiKey, model } = await c.req.json<{ apiKey?: string; model?: string }>();
    return c.json(await updateAgentSettings(sessionId, { apiKey, model }));
});

app.get("/api/agent/models", async (c) => {
    return c.json(await listAgentModels());
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
    if (!userRes.ok) return c.text("GitHub could not verify your account. Please reconnect.", 502);
    const user = (await userRes.json()) as { id: number; login: string; name: string | null; avatar_url: string };
    await refreshSellerCredential(user.login, tokenJson.access_token);

    const sessionId = await createSession({
        githubAccessToken: tokenJson.access_token,
        login: user.login,
        githubId: user.id,
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

    return c.redirect(new URL("/works", APP_URL).toString());
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

    const token = await getRefreshedSellerCredential(session.login) ?? session.githubAccessToken;
    const reposRes = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner",
        {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
            },
        },
    );

    if (!reposRes.ok) {
        return c.json({ error: reposRes.status === 401 ? "GitHub access has expired. Reconnect GitHub to load your repositories." : "GitHub could not load repositories. Please try again." }, reposRes.status === 401 ? 401 : 502);
    }

    const repos = (await reposRes.json()) as Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
        description: string | null;
        html_url: string;
        homepage?: string | null;
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
            homepage: normalizeDemoUrl(r.homepage),
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

async function fetchReadmeText(fullName: string, githubAccessToken: string): Promise<string | null> {
    const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
        headers: { Authorization: `Bearer ${githubAccessToken}`, Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: string; encoding?: string };
    if (!body.content || body.encoding !== "base64") return null;
    return Buffer.from(body.content, "base64").toString("utf-8");
}

app.get("/api/repos/readme", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const fullName = c.req.query("fullName");
    if (!fullName) return c.json({ error: "fullName is required" }, 400);

    const readme = await fetchReadmeText(fullName, session.githubAccessToken);
    if (readme === null) return c.json({ error: "This repo has no README" }, 404);
    return c.json({ content: readme });
});

app.post("/api/repos/generate-description", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);

    const { fullName } = await c.req.json<{ fullName?: string }>();
    if (!fullName) return c.json({ error: "fullName is required" }, 400);

    if (!process.env.OPENROUTER_API_KEY) {
        return c.json(
            { error: "AI description generation isn't configured — the site owner needs to set OPENROUTER_API_KEY." },
            503,
        );
    }

    const readme = await fetchReadmeText(fullName, session.githubAccessToken);
    const repoRes = await fetch(`https://api.github.com/repos/${fullName}`, {
        headers: { Authorization: `Bearer ${session.githubAccessToken}`, Accept: "application/vnd.github+json" },
    });
    const repo = repoRes.ok
        ? ((await repoRes.json()) as { description?: string | null; language?: string | null })
        : {};

    const prompt =
        `Write a compelling 2-3 sentence marketplace listing description for a GitHub repo, aimed at a ` +
        `buyer deciding whether to purchase access. Repo: ${fullName}. ` +
        `Language: ${repo.language ?? "unknown"}. ` +
        `GitHub description: ${repo.description ?? "none"}. ` +
        `README (may be truncated):\n${(readme ?? "none available").slice(0, 4000)}\n\n` +
        `Reply with only the description text, no preamble, no quotes.`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openrouter/free",
            messages: [{ role: "user", content: prompt }],
        }),
    });
    if (!aiRes.ok) return c.json({ error: "The AI model didn't respond" }, 502);
    const aiBody = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const description = aiBody.choices?.[0]?.message?.content?.trim();
    if (!description) return c.json({ error: "The AI model returned an empty response" }, 502);
    return c.json({ description });
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
        demoUrl?: string;
        accessPolicy?: unknown;
    }>();
    const { repoFullName, price, payoutAddress, sellerDescription, screenshots } = body;
    let accessPolicy;
    try { accessPolicy = parseAccessPolicy(body.accessPolicy); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : "Choose valid delivery terms." }, 400); }
    const demoUrl = normalizeDemoUrl(body.demoUrl);
    if (body.demoUrl && !demoUrl) return c.json({ error: "Enter a valid HTTP or HTTPS demo URL." }, 400);

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
        demoUrl,
        accessPolicy,
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

// Issues a margit API key for the signed-in user (browser-session authenticated).
app.post("/api/keys", async (c) => {
    const session = await getSession(getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: "Not authenticated" }, 401);
    const apiKey = await createApiKey(session.login, session.githubAccessToken);
    return c.json({ apiKey });
});

// External-agent-facing REST API — authenticated by a margit API key (not the
// browser session cookie), so any agent — including one calling through a
// Bazantic Gateway — can manage a seller's own listings on their behalf,
// given a key that seller generated and controls.
app.get("/api/agent-api/repos", async (c) => {
    const apiKey = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? c.req.query("apiKey");
    if (!apiKey) return c.json({ error: "Margit bearer key is required" }, 401);
    const owner = await resolveApiKey(apiKey);
    if (!owner) return c.json({ error: "Invalid or revoked API key" }, 401);
    return c.json(await listMyRepos(owner.githubAccessToken));
});

app.post("/api/agent-api/repos/list", async (c) => {
    const body = await c.req.json<{
        apiKey?: string;
        repoFullName?: string;
        price?: string;
        payoutAddress?: string;
        sellerDescription?: string;
        accessPolicy?: import("../../shared/accessPolicy.js").AccessPolicy;
    }>();
    const apiKey = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? body.apiKey;
    if (!apiKey) return c.json({ error: "Margit bearer key is required" }, 401);
    const owner = await resolveApiKey(apiKey);
    if (!owner) return c.json({ error: "Invalid or revoked API key" }, 401);
    if (!body.repoFullName || !body.price || !body.payoutAddress) {
        return c.json({ error: "repoFullName, price, and payoutAddress are required" }, 400);
    }

    const result = await createListingForUser(
        { login: owner.login, githubAccessToken: owner.githubAccessToken, name: null, avatarUrl: "" },
        {
            repoFullName: body.repoFullName,
            price: body.price,
            payoutAddress: body.payoutAddress,
            sellerDescription: body.sellerDescription,
            accessPolicy: body.accessPolicy,
        },
    );
    if (!result.ok) return c.json({ error: result.reason ?? "Failed to list repo" }, 400);
    return c.json(result.listing, 201);
});

app.post("/api/agent-api/repos/unlist", async (c) => {
    const body = await c.req.json<{ apiKey?: string; id?: string; repoFullName?: string }>();
    const apiKey = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? body.apiKey;
    if (!apiKey) return c.json({ error: "Margit bearer key is required" }, 401);
    const owner = await resolveApiKey(apiKey);
    if (!owner) return c.json({ error: "Invalid or revoked API key" }, 401);

    const result = await unlistRepoForUser(
        { login: owner.login, githubAccessToken: owner.githubAccessToken, name: null, avatarUrl: "" },
        { id: body.id, repoFullName: body.repoFullName },
    );
    if (!result.ok) return c.json({ error: result.reason ?? "Failed to unlist" }, 400);
    return c.json({ ok: true });
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


// Vercel invokes the exported app through api/index.ts instead of opening a port.
if (!process.env.VERCEL) {
    serve({ fetch: app.fetch, port: Number(process.env.PORT ?? '8787') }, info => {
        console.log(`[margit] API server listening on http://localhost:${info.port}`);
    });
}
