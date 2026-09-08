/** Dry-run by default. Add --enable to allow Circle's cirBTC on the configured Arc checkout. */
import { writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from '../server/src/payments.js';
import { checkoutAbi } from '../shared/checkout.js';
import { ARC_CIRBTC_ADDRESS } from '../shared/paymentTokens.js';

const contract = process.env.CHECKOUT_CONTRACT_ADDRESS as Hex;
const key = process.env.ARC_SELLER_PRIVATE_KEY as Hex;
if (!contract || !key) throw new Error('Checkout contract and admin wallet must be configured.');
const account = privateKeyToAccount(key);
const client = createPublicClient({ chain: arcTestnet, transport: http() });
const [chainId, admin, decimals, allowed] = await Promise.all([
    client.getChainId(),
    client.readContract({ address: contract, abi: checkoutAbi, functionName: 'admin' }),
    client.readContract({ address: ARC_CIRBTC_ADDRESS, abi: parseAbi(['function decimals() view returns (uint8)']), functionName: 'decimals' }),
    client.readContract({ address: contract, abi: checkoutAbi, functionName: 'allowedToken', args: [ARC_CIRBTC_ADDRESS] }),
]);
if (chainId !== 5042002 || admin.toLowerCase() !== account.address.toLowerCase() || decimals !== 8) throw new Error('Chain, admin, or token precision does not match.');
if (allowed) {
    console.log('cirBTC is already enabled on', contract);
} else {
    const { request } = await client.simulateContract({ account, address: contract, abi: checkoutAbi, functionName: 'setAllowedToken', args: [ARC_CIRBTC_ADDRESS, true] });
    console.log('Verified Arc testnet admin and 8-decimal cirBTC. Simulation passed for', contract);
    if (process.argv.includes('--enable')) {
        const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() });
        const hash = await wallet.writeContract(request);
        console.log('Submitted token configuration:', hash);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success' || !await client.readContract({ address: contract, abi: checkoutAbi, functionName: 'allowedToken', args: [ARC_CIRBTC_ADDRESS] })) throw new Error('Token configuration was not confirmed.');
        await writeFile('contracts/cirbtc.arc-testnet.json', JSON.stringify({ chainId, checkoutContract: contract, token: ARC_CIRBTC_ADDRESS, decimals, allowed: true, transactionHash: hash, blockNumber: receipt.blockNumber.toString() }, null, 2) + '\n');
        console.log('cirBTC enabled and verified.');
    }
}
