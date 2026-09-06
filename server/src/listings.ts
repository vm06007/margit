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
}): Promise<Listing> {
    const id = randomBytes(8).toString("hex");
    const stored: StoredListing = {
        id,
        repoFullName: input.repoFullName,
        ownerLogin: input.ownerLogin,
        price: input.price,
        payoutAddress: input.payoutAddress,
        createdAt: new Date().toISOString(),
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

function toPublicListing(stored: StoredListing): Listing {
    const { encryptedOwnerToken: _encryptedOwnerToken, ...pub } = stored;
    return pub;
}
