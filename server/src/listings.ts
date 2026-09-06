import { randomBytes } from "node:crypto";
import { redis } from "./redis.js";
import { decryptToken, encryptToken } from "./crypto.js";

export interface Listing {
    id: string;
    repoFullName: string;
    ownerLogin: string;
    price: string;
    payoutAddress: string;
    createdAt: string;
    // Snapshotted at listing time — once listed, the repo stays private, so we
    // can't live-fetch this from GitHub later without the owner's token.
    description: string | null;
    language: string | null;
    stargazersCount: number;
    // Seller-authored, shown in place of `description` when present.
    sellerDescription: string | null;
    // Data URLs (base64) — no external storage wired up, matches the simple
    // approach the reference project used.
    screenshots: string[];
}

interface StoredListing extends Listing {
    encryptedOwnerToken: string;
}

const LISTING_PREFIX = "margit:listing:";
const LISTING_INDEX = "margit:listings:index";

export async function createListing(input: {
    repoFullName: string;
    ownerLogin: string;
    ownerGithubToken: string;
    price: string;
    payoutAddress: string;
    description: string | null;
    language: string | null;
    stargazersCount: number;
    sellerDescription: string | null;
    screenshots: string[];
}): Promise<Listing> {
    const id = randomBytes(8).toString("hex");
    const stored: StoredListing = {
        id,
        repoFullName: input.repoFullName,
        ownerLogin: input.ownerLogin,
        price: input.price,
        payoutAddress: input.payoutAddress,
        createdAt: new Date().toISOString(),
        description: input.description,
        language: input.language,
        stargazersCount: input.stargazersCount,
        sellerDescription: input.sellerDescription,
        screenshots: input.screenshots,
        encryptedOwnerToken: encryptToken(input.ownerGithubToken),
    };
    await redis.set(LISTING_PREFIX + id, stored);
    await redis.sadd(LISTING_INDEX, id);
    return toPublicListing(stored);
}

export async function getListing(id: string): Promise<Listing | undefined> {
    const stored = await redis.get<StoredListing>(LISTING_PREFIX + id);
    return stored ? toPublicListing(stored) : undefined;
}

export async function getOwnerTokenForListing(id: string): Promise<string | undefined> {
    const stored = await redis.get<StoredListing>(LISTING_PREFIX + id);
    return stored ? decryptToken(stored.encryptedOwnerToken) : undefined;
}

export async function listListings(): Promise<Listing[]> {
    const ids = await redis.smembers(LISTING_INDEX);
    if (ids.length === 0) return [];
    const stored = await Promise.all(ids.map((id) => redis.get<StoredListing>(LISTING_PREFIX + id)));
    return stored.filter((s): s is StoredListing => s !== null).map(toPublicListing);
}

/** Deletes a listing if `ownerLogin` matches its owner. Returns false if not found/not owned. */
export async function deleteListing(id: string, ownerLogin: string): Promise<boolean> {
    const stored = await redis.get<StoredListing>(LISTING_PREFIX + id);
    if (!stored || stored.ownerLogin.toLowerCase() !== ownerLogin.toLowerCase()) return false;
    await redis.del(LISTING_PREFIX + id);
    await redis.srem(LISTING_INDEX, id);
    return true;
}

function toPublicListing(stored: StoredListing): Listing {
    const { encryptedOwnerToken: _encryptedOwnerToken, ...pub } = stored;
    // Backward-compat: listings created before these fields existed won't have them in Redis.
    return {
        ...pub,
        sellerDescription: pub.sellerDescription ?? null,
        screenshots: pub.screenshots ?? [],
    };
}
