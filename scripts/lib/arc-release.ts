import { isAddress, getAddress, parseUnits, type Address } from 'viem';

export interface ArcReleaseConfig {
    network: 'arc-mainnet'; chainId: number; rpcUrl: string; explorerUrl: string;
    officialNetworkSource: string; officialTokenSource: string;
    deployerAddress: Address; quoteSignerAddress: Address; treasuryAddress: Address;
    usdcAddress: Address; eurcAddress: Address; maxDeploymentFeeUsdc: string;
}

export function validateArcRelease(value: unknown): ArcReleaseConfig {
    if (!value || typeof value !== 'object') throw new Error('Release manifest must be an object');
    const input = value as Record<string, unknown>;
    const errors: string[] = [];
    if (input.network !== 'arc-mainnet') errors.push('network must be arc-mainnet');
    if (!Number.isSafeInteger(input.chainId) || Number(input.chainId) <= 0 || input.chainId === 5042002) errors.push('Set the officially confirmed MAINNET chainId (not 5042002)');
    for (const field of ['rpcUrl', 'explorerUrl', 'officialNetworkSource', 'officialTokenSource']) {
        try {
            const url = new URL(String(input[field]));
            if (url.protocol !== 'https:' || url.username || url.password || /testnet|localhost|127\.0\.0\.1/i.test(url.hostname)) throw new Error();
            if (field.startsWith('official') && !['docs.arc.io', 'docs.arc.network', 'developers.circle.com', 'www.circle.com', 'circle.com'].includes(url.hostname)) throw new Error();
        } catch { errors.push(`${field} must be a verified HTTPS URL${field.startsWith('official') ? ' on an official Arc/Circle documentation host' : ''}`); }
    }
    for (const field of ['deployerAddress', 'quoteSignerAddress', 'treasuryAddress', 'usdcAddress', 'eurcAddress']) {
        if (typeof input[field] !== 'string' || !isAddress(input[field] as string) || /^0x0{40}$/i.test(input[field] as string)) errors.push(`${field} must be a nonzero address`);
    }
    if (typeof input.maxDeploymentFeeUsdc !== 'string' || !/^\d+(\.\d{1,6})?$/.test(input.maxDeploymentFeeUsdc) || Number(input.maxDeploymentFeeUsdc) <= 0) errors.push('maxDeploymentFeeUsdc must be a positive USDC amount');
    if (errors.length) throw new Error(errors.join('\n'));
    const config = input as unknown as ArcReleaseConfig;
    if (getAddress(config.deployerAddress) !== getAddress(config.treasuryAddress)) throw new Error('Current v4 treasury is immutable msg.sender: deployerAddress MUST equal treasuryAddress. Admin transfer does not move treasury.');
    if (getAddress(config.quoteSignerAddress) === getAddress(config.deployerAddress)) throw new Error('Use separate quote-signing and deployment/treasury keys');
    if (getAddress(config.usdcAddress) === getAddress(config.eurcAddress)) throw new Error('USDC and EURC must be distinct tokens');
    return config;
}

export function checkDeploymentBudget(gas: bigint, gasPrice: bigint, balance: bigint, maxUsdc: string) {
    const gasLimit = gas * 120n / 100n;
    const maxFeePerGas = gasPrice * 2n;
    const maximumFee = gasLimit * maxFeePerGas;
    if (maximumFee > parseUnits(maxUsdc, 18)) throw new Error('Deployment estimate exceeds configured USDC fee cap');
    if (maximumFee > balance) throw new Error('Deployer has insufficient native USDC for the maximum deployment fee');
    return { gasLimit, maxFeePerGas, maximumFee };
}
