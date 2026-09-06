import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const ARCNS_API = "https://arcname.services/api/v1/resolve/name";
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const ensClient = createPublicClient({ chain: mainnet, transport: http() });

interface ArcNsResponse {
    status: "ok" | "not_found" | "error";
    address?: string;
    hint?: string;
    code?: string;
}

async function resolveArcNs(name: string): Promise<string> {
    const res = await fetch(`${ARCNS_API}/${encodeURIComponent(name.toLowerCase())}`);
    const data = (await res.json().catch(() => ({}))) as ArcNsResponse;

    if (data.status === "ok" && data.address) return data.address;
    if (data.status === "not_found") throw new Error(`No ArcNS record for "${name}"`);
    throw new Error(data.hint ?? `ArcNS lookup failed (${res.status})`);
}

async function resolveEns(name: string): Promise<string> {
    const address = await ensClient.getEnsAddress({ name: normalize(name) });
    if (!address) throw new Error(`No ENS record for "${name}"`);
    return address;
}

/**
 * Resolves a payout address input that may already be a 0x address, an ENS
 * name (.eth), or an ArcNS name (.arc / .circle) into a real EVM address.
 */
export async function resolvePayoutAddress(input: string): Promise<string> {
    const trimmed = input.trim();
    if (EVM_ADDRESS_PATTERN.test(trimmed)) return trimmed;

    const lower = trimmed.toLowerCase();
    if (lower.endsWith(".eth")) return resolveEns(lower);
    if (lower.endsWith(".arc") || lower.endsWith(".circle")) return resolveArcNs(lower);

    throw new Error('payoutAddress must be a 0x address, an ENS name (.eth), or an ArcNS name (.arc / .circle)');
}
