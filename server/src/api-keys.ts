import { randomBytes } from "node:crypto";
import { redis } from "./redis.js";
import { decryptToken, encryptToken } from "./crypto.js";

// Lets an external agent (e.g. one calling through a Bazantic Gateway) manage
// a specific seller's listings — a capability the browser-session cookie
// can't grant to anyone outside that browser. The seller generates this
// themselves (via the agent sidebar's generate_api_key tool) and controls it.

const API_KEY_PREFIX = "margit:apikey:";
const KEY_PUBLIC_PREFIX = "margit_sk_";

interface StoredApiKey {
    login: string;
    encryptedGithubAccessToken: string;
    createdAt: string;
}

export interface ApiKeyOwner {
    login: string;
    githubAccessToken: string;
}

export async function createApiKey(login: string, githubAccessToken: string): Promise<string> {
    const key = KEY_PUBLIC_PREFIX + randomBytes(24).toString("hex");
    const stored: StoredApiKey = {
        login,
        encryptedGithubAccessToken: encryptToken(githubAccessToken),
        createdAt: new Date().toISOString(),
    };
    await redis.set(API_KEY_PREFIX + key, stored);
    return key;
}

export async function resolveApiKey(key: string): Promise<ApiKeyOwner | undefined> {
    const stored = await redis.get<StoredApiKey>(API_KEY_PREFIX + key);
    if (!stored) return undefined;
    return { login: stored.login, githubAccessToken: decryptToken(stored.encryptedGithubAccessToken) };
}

export async function revokeApiKey(key: string): Promise<void> {
    await redis.del(API_KEY_PREFIX + key);
}
