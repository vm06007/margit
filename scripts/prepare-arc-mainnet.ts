/** Read-only preparation. Never reads a private key, writes .env, or broadcasts. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPublicClient, defineChain, encodeDeployData, formatUnits, http, parseAbi, type Hex } from 'viem';
import { validateArcRelease, checkDeploymentBudget } from './lib/arc-release.js';

const manifestPath = process.argv[2];
const outputPath = process.argv[3] ?? 'contracts/arc-mainnet-plan.local.json';
if (!manifestPath) throw new Error('Usage: npm run arc:prepare-mainnet -- MANIFEST.json [OUTPUT.json]');
const config = validateArcRelease(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
if (fs.existsSync(outputPath)) throw new Error('Output already exists; choose a fresh plan path');
execFileSync(process.execPath, ['scripts/compile-checkout.mjs'], { stdio: 'inherit' });
const chain = defineChain({ id: config.chainId, name: 'Arc Mainnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl] } }, testnet: false });
const client = createPublicClient({ chain, transport: http(config.rpcUrl, { timeout: 15_000, retryCount: 1 }) });
if (await client.getChainId() !== config.chainId) throw new Error('RPC chainId does not match release manifest');
const tokenAbi = parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)']);
for (const [symbol, address] of [['USDC', config.usdcAddress], ['EURC', config.eurcAddress]] as const) {
    const [decimals, reportedSymbol] = await Promise.all([
        client.readContract({ address, abi: tokenAbi, functionName: 'decimals' }),
        client.readContract({ address, abi: tokenAbi, functionName: 'symbol' }),
    ]);
    if (decimals !== 6 || reportedSymbol !== symbol) throw new Error(`${symbol} token metadata does not match (official issuer verification is still required)`);
}
const abi = JSON.parse(fs.readFileSync('contracts/artifacts/MargitCheckout.abi.json', 'utf8'));
const bytecode = `0x${fs.readFileSync('contracts/artifacts/MargitCheckout.bytecode.txt', 'utf8').trim()}` as Hex;
const data = encodeDeployData({ abi, bytecode, args: [config.usdcAddress, config.eurcAddress, config.quoteSignerAddress] });
const [gas, gasPrice, balance] = await Promise.all([client.estimateGas({ account: config.deployerAddress, data }), client.getGasPrice(), client.getBalance({ address: config.deployerAddress })]);
const budget = checkDeploymentBudget(gas, gasPrice, balance, config.maxDeploymentFeeUsdc);
const sourceSha256 = createHash('sha256').update(fs.readFileSync('contracts/MargitCheckout.sol')).digest('hex');
const artifactSha256 = createHash('sha256').update(bytecode).digest('hex');
const report = { status: 'deployment-transaction-prepared-NOT-broadcast', preparedAt: new Date().toISOString(), network: config.network, chainId: config.chainId, sourceSha256, artifactSha256, constructor: { usdc: config.usdcAddress, eurc: config.eurcAddress, quoteSigner: config.quoteSignerAddress }, immutableTreasury: config.treasuryAddress, maximumFeeUsdc: formatUnits(budget.maximumFee, 18), unsignedTransaction: { from: config.deployerAddress, chainId: config.chainId, data, value: '0', gas: budget.gasLimit.toString(), maxFeePerGas: budget.maxFeePerGas.toString(), maxPriorityFeePerGas: '0' }, next: 'Review and sign using the declared deployer. This deployer permanently receives fees. Record receipt/address/startBlock, verify contract, then finish application cutover before accepting real funds.' };
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ outputPath, status: report.status, chainId: config.chainId, maximumFeeUsdc: report.maximumFeeUsdc }, null, 2));
