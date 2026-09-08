import { createHash } from 'node:crypto';
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { formatUnits } from 'viem';
import type { AgentPaymentProof } from '../../shared/agentPayment.js';

const HASH = /^0x[0-9a-f]{64}$/i;

export function validateCircleChallenge(
    requirements: { scheme: string; network: string; asset: string; amount: string; payTo: string; extra?: Record<string, unknown> },
    expected: { seller: string; amount: bigint; usdc: string; gatewayWallet: string },
): void {
    if (requirements.scheme !== 'exact' || requirements.network !== 'eip155:5042002') throw new Error('Only Arc testnet x402 payments are allowed.');
    if (requirements.asset.toLowerCase() !== expected.usdc.toLowerCase()) throw new Error('Only USDC payments are allowed.');
    if (requirements.payTo.toLowerCase() !== expected.seller.toLowerCase()) throw new Error('Payment recipient changed.');
    if (!/^\d+$/.test(requirements.amount)) throw new Error('Invalid payment amount.');
    const amount = BigInt(requirements.amount);
    if (amount <= 0n || amount !== expected.amount) throw new Error('Payment price does not match the listing.');
    const extra = requirements.extra;
    if (extra?.name !== 'GatewayWalletBatched' || extra.version !== '1' ||
        typeof extra.verifyingContract !== 'string' || extra.verifyingContract.toLowerCase() !== expected.gatewayWallet.toLowerCase()) {
        throw new Error('The challenge is not from the expected Circle Gateway contract.');
    }
}

/** Circle's real buyer SDK; no fallback to contract checkout or a second payment. */
export async function payWithCircle(options: {
    client: GatewayClient;
    url: string;
    seller: string;
    amount: bigint;
    beforeSign: () => Promise<void>;
    afterSign: () => Promise<void>;
}) {
    const { client } = options;
    if (client.chainConfig.chain.id !== 5042002) throw new Error('Mainnet payments are disabled.');
    let signed = false;
    let paymentId = '';
    let accepted = false;
    let settlementReference: string | undefined;
    client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
        validateCircleChallenge(selectedRequirements, { seller: options.seller, amount: options.amount,
            usdc: client.chainConfig.usdc, gatewayWallet: client.chainConfig.gatewayWallet });
        await options.beforeSign();
    });
    client.onAfterPaymentCreation(async ({ paymentPayload }) => {
        // Fingerprint only. Never put the signature or access credential in public proof.
        paymentId = createHash('sha256').update(JSON.stringify(paymentPayload)).digest('hex');
        signed = true;
        await options.afterSign();
    });
    client.onPaymentResponse(async ({ settleResponse, error }) => {
        accepted = !error && settleResponse?.success === true &&
            settleResponse.network === 'eip155:5042002' &&
            settleResponse.payer?.toLowerCase() === client.address.toLowerCase();
        settlementReference = typeof settleResponse?.transaction === 'string' ? settleResponse.transaction : undefined;
        // Deliberately do not return recovered:true: that would sign and spend again.
    });
    const result = await client.pay<{ cloneUrl?: unknown; expiresAt?: unknown }>(options.url);
    if (!signed || !accepted || result.amount !== options.amount) throw new Error('No verified Circle payment response. Check the pending payment before retrying.');
    if (typeof result.data.cloneUrl !== 'string') throw new Error('Payment accepted but access is missing. Do not pay again.');
    const access = new URL(result.data.cloneUrl);
    if (access.origin !== new URL(options.url).origin || !access.pathname.startsWith('/api/access/')) {
        throw new Error('Payment accepted but access URL is invalid. Do not pay again.');
    }
    const proof: AgentPaymentProof = {
        provider: 'Circle Gateway', sdk: '@circle-fin/x402-batching', network: 'Arc testnet', chainId: 5042002,
        protocol: 'x402', walletType: 'Demo EOA', buyer: client.address, seller: options.seller,
        amountUsdc: formatUnits(result.amount, 6), paymentId, status: 'accepted', recordedAt: new Date().toISOString(),
        ...(settlementReference ? { settlementReference } : {}),
        ...(settlementReference && HASH.test(settlementReference) ? { transactionHash: settlementReference } : {}),
    };
    return { cloneUrl: result.data.cloneUrl, proof };
}
