import { randomBytes } from "node:crypto";
import { redis } from "./redis.js";
import { decryptToken, encryptToken } from "./crypto.js";

const SESSION_PREFIX = "margit:session:";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface SessionData {
    githubAccessToken: string;
    login: string;
    name: string | null;
    avatarUrl: string;
}

interface StoredSession {
    encryptedGithubAccessToken: string;
    login: string;
    name: string | null;
    avatarUrl: string;
}

export async function createSession(data: SessionData): Promise<string> {
    const id = randomBytes(32).toString("hex");
    const stored: StoredSession = {
        encryptedGithubAccessToken: encryptToken(data.githubAccessToken),
        login: data.login,
        name: data.name,
        avatarUrl: data.avatarUrl,
    };
    await redis.set(SESSION_PREFIX + id, stored, { ex: SESSION_TTL_SECONDS });
    return id;
}

export async function getSession(id: string | undefined): Promise<SessionData | undefined> {
    if (!id) return undefined;
    const stored = await redis.get<StoredSession>(SESSION_PREFIX + id);
    if (!stored) return undefined;
    return {
        githubAccessToken: decryptToken(stored.encryptedGithubAccessToken),
        login: stored.login,
        name: stored.name,
        avatarUrl: stored.avatarUrl,
    };
}

export async function destroySession(id: string | undefined): Promise<void> {
    if (!id) return;
    await redis.del(SESSION_PREFIX + id);
}
