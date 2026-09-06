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
    ownerLogin: string;
    isOrgOwned: boolean;
}

export interface Listing {
    id: string;
    repoFullName: string;
    ownerLogin: string;
    price: string;
    payoutAddress: string;
    createdAt: string;
    description: string | null;
    language: string | null;
    stargazersCount: number;
    sellerDescription: string | null;
    screenshots: string[];
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

export async function makeRepoPrivate(fullName: string): Promise<void> {
    const res = await fetch("/api/repos/make-private", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to make repo private (${res.status})`);
    }
}

export async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function revokeGithubAccess(): Promise<void> {
    const res = await fetch("/api/auth/revoke", { method: "POST", credentials: "include" });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to revoke access (${res.status})`);
    }
}

export function githubLoginUrl(): string {
    return "/api/auth/github/login";
}

export function fetchListings(): Promise<Listing[]> {
    return apiFetch<Listing[]>("/api/listings");
}

/** Resolves a 0x address, ENS (.eth) name, or ArcNS (.arc / .circle) name to a real address. */
export async function resolveName(name: string): Promise<string> {
    const res = await fetch(`/api/resolve-name?name=${encodeURIComponent(name)}`, { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { address?: string; error?: string };
    if (!res.ok || !data.address) throw new Error(data.error ?? "Could not resolve name");
    return data.address;
}

/** Reverse lookup: verified primary ArcNS name for an address, or null if none/unavailable. */
export async function resolveArcNsReverse(address: string): Promise<string | null> {
    const res = await fetch(`/api/resolve-address?address=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { name?: string | null };
    return data.name ?? null;
}

export async function createListing(input: {
    repoFullName: string;
    price: string;
    payoutAddress: string;
    sellerDescription?: string;
    screenshots?: string[];
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

export async function deleteListing(id: string): Promise<void> {
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to unlist (${res.status})`);
    }
}

/** Downloads a purchased repo as a zip via our server (proxies GitHub's zipball API). */
export async function downloadZip(cloneUrl: string, repoName: string): Promise<void> {
    const res = await fetch("/api/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloneUrl }),
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Download failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repoName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
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
