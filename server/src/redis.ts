import { Redis } from "@upstash/redis";

const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    console.warn(
        "[margit] Missing KV_REST_API_URL / KV_REST_API_TOKEN in .env — session storage will fail.",
    );
}

export const redis = new Redis({
    url: KV_REST_API_URL ?? "",
    token: KV_REST_API_TOKEN ?? "",
});
