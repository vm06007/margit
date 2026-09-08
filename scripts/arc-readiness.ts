/** Offline, read-only release assessment; nonzero exit means NOT mainnet ready. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateArcRelease } from './lib/arc-release.js';
const blockers: Array<{ area: string; reason: string }> = [];
const manifestPath = process.argv[2] ?? 'config/arc-mainnet.example.json';
try { validateArcRelease(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))); }
catch (error) { blockers.push({ area: 'Official mainnet deployment configuration', reason: error instanceof Error ? error.message : 'Invalid manifest' }); }
const checks = [
    ['server/src/payments.ts', /id:\s*5042002/, 'Backend RPC still selects testnet'],
    ['src/lib/thirdweb.ts', /import\s*\{\s*arcTestnet\s*\}\s*from\s*["']thirdweb\/chains/, 'Browser wallet still selects testnet'],
    ['shared/checkout.ts', /CHECKOUT_CHAIN_ID\s*=\s*5042002/, 'Checkout EIP-712 chain domain still selects testnet'],
    ['shared/paymentTokens.ts', /89B50855Aa3bE2F677cD6303Cec089B5F319D72a/i, 'Token constants include the testnet EURC address'],
    ['server/src/x402-gateway.ts', /eip155:5042002|gateway-api-testnet/, 'x402 network/facilitator still selects testnet; verify mainnet support or disable this path'],
    ['server/src/agent.ts', /ARC_DEMO_BUYER_PRIVATE_KEY/, 'Agent uses a shared demo wallet; isolate wallets and enforce spending limits before funding with real USDC'],
] as const;
for (const [file, pattern, reason] of checks) if (pattern.test(fs.readFileSync(file, 'utf8'))) blockers.push({ area: file, reason });
// These operational requirements need reviewed evidence, never inferred from a passing build.
blockers.push({ area: 'Release evidence', reason: 'Require a reviewed mainnet deployment receipt, contract verification, treasury custody decision, isolated production Redis, mainnet indexing or explicit UI fallback, end-to-end purchase/receipt/access smoke test, monitoring and rollback evidence.' });
let revision = 'unknown';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
console.log(JSON.stringify({ status: blockers.length ? 'NOT_MAINNET_READY' : 'READY', checkedAt: new Date().toISOString(), revision, manifestPath, blockers, readyComponents: ['Arc testnet checkout and automatic 0.5% fee split', 'Buyer-bound signed quotes, receipt recovery and delivery policies', 'MCP tools, skill discovery and test client', 'Mainnet manifest validation and unsigned deployment preparation'] }, null, 2));
process.exitCode = blockers.length ? 1 : 0;
