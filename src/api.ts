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
