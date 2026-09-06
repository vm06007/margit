export interface Me {
    authenticated: boolean;
    login?: string;
    name?: string | null;
    avatarUrl?: string;
}

export interface Repo {
    id: number;
    name: string;
    fullName: string;
    private: boolean;
    description: string | null;
    htmlUrl: string;
    stargazersCount: number;
    language: string | null;
    updatedAt: string;
}

export interface Listing {
    id: string;
    repoFullName: string;
    ownerLogin: string;
    price: string;
    payoutAddress: string;
    createdAt: string;
}

export interface UnlockRequirement {
    /** Atomic USDC units (6 decimals) */
    amount: string;
    payTo: string;
    network: string;
    asset: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, { credentials: "include", ...init });
    if (!res.ok) {
        throw new Error(`${path} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export function fetchMe(): Promise<Me> {
    return fetch("/api/me", { credentials: "include" }).then((res) =>
        res.ok ? (res.json() as Promise<Me>) : { authenticated: false },
    );
}

export function fetchRepos(): Promise<Repo[]> {
    return apiFetch<Repo[]>("/api/repos");
}

export async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export function githubLoginUrl(): string {
    return "/api/auth/github/login";
}

export function fetchListings(): Promise<Listing[]> {
    return apiFetch<Listing[]>("/api/listings");
}

export async function createListing(input: {
    repoFullName: string;
    price: string;
    payoutAddress: string;
}): Promise<Listing> {
    const res = await fetch("/api/listings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to create listing (${res.status})`);
    }
    return res.json() as Promise<Listing>;
}

/** Fetches the real x402 payment challenge for a listing (no payment is made). */
export async function fetchUnlockRequirements(listingId: string): Promise<UnlockRequirement> {
    const res = await fetch(`/api/listings/unlock?id=${encodeURIComponent(listingId)}`, {
        credentials: "include",
    });
    if (res.status !== 402) {
        throw new Error(`Expected a 402 payment challenge, got ${res.status}`);
    }
    const header = res.headers.get("payment-required");
    if (!header) throw new Error("Missing payment-required header");

    const decoded = JSON.parse(atob(header)) as {
        accepts: Array<{ amount: string; payTo: string; network: string; asset: string }>;
    };
    const accept = decoded.accepts[0];
    if (!accept) throw new Error("No payment options in response");
    return { amount: accept.amount, payTo: accept.payTo, network: accept.network, asset: accept.asset };
}
