import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArcRelease, checkDeploymentBudget } from '../lib/arc-release.js';
// Synthetic chain and token values for validation tests; NOT Arc mainnet metadata.
const valid = () => ({ network: 'arc-mainnet', chainId: 987654321, rpcUrl: 'https://rpc.example.com', explorerUrl: 'https://explorer.example.com', officialNetworkSource: 'https://docs.arc.io/arc/references/connect-to-arc', officialTokenSource: 'https://developers.circle.com/assets/usdc-contract-addresses', deployerAddress: `0x${'1'.repeat(40)}`, treasuryAddress: `0x${'1'.repeat(40)}`, quoteSignerAddress: `0x${'2'.repeat(40)}`, usdcAddress: `0x${'3'.repeat(40)}`, eurcAddress: `0x${'4'.repeat(40)}`, maxDeploymentFeeUsdc: '5.00' });
test('accepts a complete manifest with separate signer and correct immutable treasury', () => { assert.equal(validateArcRelease(valid()).chainId, 987654321); });
test('rejects missing values and testnet identifiers', () => {
    assert.throws(() => validateArcRelease({}), /chainId/);
    assert.throws(() => validateArcRelease({ ...valid(), chainId: 5042002 }), /MAINNET/);
    assert.throws(() => validateArcRelease({ ...valid(), rpcUrl: 'https://rpc.testnet.arc.io' }), /rpcUrl/);
});
test('rejects untrusted documentation sources and credential-bearing URLs', () => {
    assert.throws(() => validateArcRelease({ ...valid(), officialTokenSource: 'https://example.com/fake' }), /officialTokenSource/);
    assert.throws(() => validateArcRelease({ ...valid(), rpcUrl: 'https://secret:token@rpc.example.com' }), /rpcUrl/);
});
test('rejects treasury mismatch and signing-key reuse', () => {
    assert.throws(() => validateArcRelease({ ...valid(), treasuryAddress: `0x${'5'.repeat(40)}` }), /immutable/);
    assert.throws(() => validateArcRelease({ ...valid(), quoteSignerAddress: valid().deployerAddress }), /separate/);
});
test('rejects zero addresses and duplicate assets', () => {
    assert.throws(() => validateArcRelease({ ...valid(), usdcAddress: `0x${'0'.repeat(40)}` }), /nonzero/);
    assert.throws(() => validateArcRelease({ ...valid(), eurcAddress: valid().usdcAddress }), /distinct/);
});
test('deployment budget includes gas buffer and gas-price ceiling in native 18-decimal USDC', () => {
    assert.equal(checkDeploymentBudget(1_000_000n, 1_000_000_000n, 10n ** 18n, '1').maximumFee, 2_400_000_000_000_000n);
    assert.throws(() => checkDeploymentBudget(1_000_000n, 1_000_000_000n, 10n ** 18n, '0.001'), /cap/);
    assert.throws(() => checkDeploymentBudget(1_000_000n, 1_000_000_000n, 1n, '1'), /insufficient/);
});
