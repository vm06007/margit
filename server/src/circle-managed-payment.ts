import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { createHash } from 'node:crypto';
import { formatUnits, parseUnits } from 'viem';
import { circleSign, getCircleIdentity, circleStorage } from './circle-managed.js';
import { validateCircleChallenge } from './circle-payment.js';
import { getListing } from './listings.js';
import { allowsCheckout } from '../../shared/accessPolicy.js';
import { ARC_TOKEN_ADDRESSES } from './payments.js';
import { redis } from './redis.js';
import { encryptToken, decryptToken } from './crypto.js';
import type { AgentPaymentProof } from '../../shared/agentPayment.js';

export async function buyWithManagedCircle(session: string, id: string) {
  const identity = await getCircleIdentity(session);
  const key = `margit:managed-purchase:${session}:${identity.buyer}:${id}`;
  type Purchase = { cloneUrl: string; repoFullName: string; proof: AgentPaymentProof };
  const prior = await circleStorage.get<string>(key);
  if (prior === 'pending') throw new Error('A Circle purchase is pending reconciliation. No second payment will be sent.');
  if (prior) return JSON.parse(decryptToken(prior)) as Purchase;
  const listing = await getListing(id);
  if (!listing || !allowsCheckout(listing.accessPolicy, 'x402')) throw new Error('Choose a repository that accepts x402.');
  const amount = parseUnits(listing.price.replace(/^\$/, ''), 6);
  const url = new URL('/api/listings/unlock', process.env.APP_URL ?? 'http://localhost:5173');
  url.searchParams.set('id', id);
  const initial = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (initial.status !== 402) throw new Error('Repository did not return a payment request.');
  const header = initial.headers.get('payment-required');
  const challenge = header ? JSON.parse(Buffer.from(header, 'base64').toString()) : await initial.json();
  const requirements = challenge.accepts?.find((r: { network: string }) => r.network === 'eip155:5042002');
  if (challenge.x402Version !== 2 || !requirements) throw new Error('Unsupported payment request.');
  validateCircleChallenge(requirements, { seller: listing.payoutAddress, amount, usdc: ARC_TOKEN_ADDRESSES.USDC,
    gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' });
  const current = await getListing(id);
  if (!current || current.price !== listing.price || current.payoutAddress !== listing.payoutAddress || JSON.stringify(current.accessPolicy) !== JSON.stringify(listing.accessPolicy)) throw new Error('Listing terms changed. Review the repository again.');
  if (!await redis.set(key, 'pending', { nx: true })) throw new Error('A purchase is already pending.');
  // Retain the intent even if signing times out: Circle may have authorized it remotely.
  const scheme = new BatchEvmScheme({
    address: identity.buyer,
    signTypedData: async data => circleSign(session, identity.address, JSON.stringify({ ...data,
      types: { EIP712Domain: [{name:'name',type:'string'}, {name:'version',type:'string'}, {name:'chainId',type:'uint256'}, {name:'verifyingContract',type:'address'}], ...data.types },
    }, (_, value) => typeof value === 'bigint' ? value.toString() : value)),
  });
  const signed = await scheme.createPaymentPayload(2, requirements);
  const payload = { ...signed, accepted: requirements, resource: challenge.resource };
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') } });
  const encodedReceipt = response.headers.get('payment-response');
  const receipt = encodedReceipt ? JSON.parse(Buffer.from(encodedReceipt, 'base64').toString()) : null;
  if (!response.ok || !receipt?.success || receipt.network !== 'eip155:5042002' || receipt.payer?.toLowerCase() !== identity.buyer.toLowerCase()) throw new Error('Payment needs reconciliation. Do not pay again.');
  const body = await response.json() as { cloneUrl?: unknown };
  if (typeof body.cloneUrl !== 'string') throw new Error('Payment accepted but access is missing. Do not pay again.');
  const access = new URL(body.cloneUrl);
  if (access.origin !== url.origin || !access.pathname.startsWith('/api/access/')) throw new Error('Payment accepted but access needs review. Do not pay again.');
  const reference = typeof receipt.transaction === 'string' ? receipt.transaction : undefined;
  const result: Purchase = { cloneUrl: access.href, repoFullName: listing.repoFullName, proof: {
    provider: 'Circle Gateway', sdk: '@circle-fin/x402-batching', network: 'Arc testnet', chainId: 5042002, protocol: 'x402',
    walletType: 'Circle Agent Wallet', buyer: identity.buyer, seller: listing.payoutAddress, amountUsdc: formatUnits(amount, 6),
    paymentId: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), status: 'accepted', recordedAt: new Date().toISOString(),
    ...(reference ? {settlementReference: reference} : {}), ...(reference && /^0x[0-9a-f]{64}$/i.test(reference) ? {transactionHash:reference} : {}),
  } };
  await redis.set(key, encryptToken(JSON.stringify(result)));
  return result;
}
