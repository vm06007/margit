# Margit checkout — current deployment

**Arc Testnet · chain 5042002**

[0x72c54ecd669acb19d6e6d5b5160f67d03b4d5b7b](https://testnet.arcscan.app/address/0x72c54ecd669acb19d6e6d5b5160f67d03b4d5b7b?tab=contract)

- Start block: **60959124**
- Admin and treasury: `0x4d2A622F53a2ac4D3Ee1c06bCeB4641a8a6fE6aa`
- Quote signer: `0x9548A6c29885D8a52170ec6D249c31065e3318A0`
- Publisher fee: **0.5% (50 basis points)**, fixed for this deployment
- Graph: [MargitArc](https://thegraph.com/studio/subgraph/margit-arc), query endpoint `https://api.studio.thegraph.com/query/2012/margit-arc/v0.4.0`

The deployment metadata is [deployment.arc-testnet.json](deployment.arc-testnet.json). Earlier test iterations are retained as historical metadata and Graph data sources; they are not the active checkout.

## Purchase flow

1. A publisher connects GitHub, sets a price and payout wallet, and sees the publisher-fee disclosure. Publishing requires no contract transaction.
2. Margit checks repository delivery and signs a five-minute EIP-712 quote containing the order ID, opaque listing ID, terms hash, buyer, publisher, token, gross amount and expiry. The domain binds the quote to this chain and contract.
3. USDC buyers call payable `buy` with native USDC: six-decimal quoted units multiplied by 10^12. EURC buyers approve the gross amount when necessary, then call `buy` with zero native value.
4. The contract verifies the buyer, signature, expiry, allowed token and unused order. It sends the publisher the net amount and the treasury the fee. Both payouts must succeed; failures revert the whole purchase.
5. `PurchaseCompleted` records the gross payment. `PurchaseFeeCollected` records the fee and publisher net. Fees use integer division by 200, rounded down; the publisher receives the remainder.
6. The backend validates the purchase receipt and returns access using a private claim secret. It records collected fees without creating deferred debt. Graph indexes the events without controlling delivery authorization.

The buyer pays the advertised price plus any network gas. For 1 USDC, the publisher receives 0.995 and the treasury receives 0.005. Native USDC is still one purchase transaction.

## x402 and deferred settlement

Circle Gateway x402 pays the publisher outside this checkout. Margit accrues 0.5% in the publisher ledger for sales after `PLATFORM_FEES_STARTED_AT`. Old recorded sales are not charged retroactively.

My Portfolio displays gross, net, collected, deferred, paid and owed amounts. An authenticated publisher can settle USDC debt by calling `payDeferredFees(sellerId)` with native value. The contract forwards the payment to the treasury and emits `DeferredFeesPaid`.

The backend verifies the receipt's contract and publisher ID before recording a credit. Confirmations are idempotent; browser recovery can confirm a pending transaction without paying again. Overpayments remain fee credit. No listing restriction is currently enabled.

See [fee accounting and boundaries](../docs/fee-model.md).

## Administration

- The deployer starts as `admin`.
- `setAllowedToken(_token, _allowed)` enables or disables contract addresses. Disabling prevents new payments using that token, including unfulfilled quotes.
- `transferAdmin(_newAdmin)` nominates a replacement; the nominee calls `acceptAdmin()`. The current admin can cancel or replace the nomination.
- Treasury, fee rate and quote signer are immutable. Admin transfer does not change treasury.
- Allowlisting alone does not add a currency to the app: metadata, decimals and pricing support must also be implemented.

There is no upgrade proxy, escrow, refund method or admin withdrawal. Named custom errors replace revert strings.

## Delivery and recovery

GitHub credentials and access policy enforcement stay on the backend. Publishers can sign out without stopping delivery, but revoked GitHub access prevents delivery. Preflight cannot guarantee future availability.

Access expiry starts at the purchase block timestamp. Repeating confirmation neither extends expiry nor resets a consumed download. Saved quotes retain their original contract address so earlier purchases remain recoverable. Public receipts contain no GitHub credentials or private access URL.

The browser persists transaction hashes for recovery. Loss of storage or interruption between broadcast and persistence may require confirming the known transaction manually. Production monitoring and reconciliation are still needed. The contract does not guarantee repository delivery.

## Reproduce deployment

```sh
npm run contracts:compile
anvil --silent --port 18545
# Another terminal:
npm run contracts:test
npm run contracts:deploy -- --fees
npm run contracts:verify
npm run graph:configure
npm run graph:codegen
npm run graph:build
npm run graph:deploy
```

The deployer uses `ARC_SELLER_PRIVATE_KEY`; `CHECKOUT_SIGNER_PRIVATE_KEY` is separate. The script validates chain, decimals, signer, admin, treasury and fee rate, caps deployment gas at 5 test USDC and retains pending transaction metadata. Re-running returns the existing deployment rather than deploying again.

Set `CHECKOUT_CONTRACT_ADDRESS` and `FEE_CONTRACT_ADDRESS` to the current address, `GRAPH_QUERY_URL` to the endpoint above, and `PLATFORM_FEES_STARTED_AT` to the UTC launch time. Preserve this launch timestamp across restarts. Restart the API after environment changes. Never commit keys or deployment credentials.

## Verification and tests

Compiler: Solidity `v0.8.36+commit.8a079791`, optimizer 200 runs, EVM paris. `npm run contracts:verify` checks exact creation bytecode and constructor arguments before submitting standard JSON to Arcscan. This is source verification, not an audit.

Tests cover quote validity, domain separation, replay, token permissions, admin transfer, native and ERC-20 payouts, rounding, failed treasury payout rollback, deferred fee receipts and idempotent publisher credits.

[smoke.arc-testnet.v4.json](smoke.arc-testnet.v4.json) records live automatic-fee and deferred-settlement self-transfer tests. They are deployment diagnostics, not repository sales or real publisher debts. Historical test events remain in Graph; the private portfolio ledger only lists actual application purchases.
