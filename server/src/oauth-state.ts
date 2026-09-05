import { randomBytes } from "node:crypto";
import { redis } from "./redis.js";

const STATE_PREFIX = "margit:oauth-state:";
const STATE_TTL_SECONDS = 5 * 60;

export async function issueState(): Promise<string> {
    const state = randomBytes(16).toString("hex");
    await redis.set(STATE_PREFIX + state, 1, { ex: STATE_TTL_SECONDS });
    return state;
}

export async function consumeState(state: string | undefined): Promise<boolean> {
    if (!state) return false;
    const deleted = await redis.del(STATE_PREFIX + state);
    return deleted > 0;
}
