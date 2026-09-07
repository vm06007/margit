# Margit checkout on Arc Testnet

`MargitCheckout.sol` implements payment and receipts, not repository custody. Arc Testnet chain ID is **5042002**. The deploy script writes the verified address, transaction, start block, token addresses and public quote signer to `deployment.arc-testnet.json` after deployment succeeds. Current v3 deployment: `0x2deb736ea29f140eb77919380b28d34b854e7ab2`, start block **60955382**. [Explorer](https://testnet.arcscan.app/address/0x2deb736ea29f140eb77919380b28d34b854e7ab2).

## Payment flow

1. Seller connects GitHub and lists a repository with price, payout wallet and delivery policy. No onchain listing transaction or seller wallet signature is required in this version.
2. Buyer requests `POST /api/checkout/quote`. Margit validates the listing and wallet purchase channel, checks GitHub archive delivery, and signs a five-minute EIP-712 quote with a separate backend signing key.
3. The quote contains a random order ID, opaque listing hash, terms hash, buyer, seller, token, amount and deadline. The domain binds it to this chain and deployment. A separate secret authorizes receipt recovery; it is never included in transaction calldata or events.
4. For USDC, the buyer calls payable `buy` with native value: quote amount (6 decimals) × 10^12 (18 native decimals). No approval is needed. EURC uses ERC-20 approval followed by `buy` with zero native value. The contract checks signature, buyer, expiry, supported token and order uniqueness. It transfers payment straight to the payout wallet and emits `PurchaseCompleted` in the same transaction. Failed transfers revert the order consumption.
5. Buyer submits their claim secret and transaction hash to `POST /api/checkout/confirm`. Margit verifies every receipt field and the emitting contract, then records the purchase and returns a repository-specific access link.
6. The Graph indexes purchase events for portfolio analytics. The backend's direct chain verification authorizes delivery without waiting for the indexer.

The original draft used reusable seller-signed listings. The integrated version uses backend-authorized, buyer-bound quotes so normal GitHub listing edits do not add a wallet-signing step. This deliberately trusts Margit's quote service. A issued quote remains payable for up to five minutes even if a seller changes/unlists the listing; previously issued terms are honored. Quotes are single-use.

## Delivery and recovery

The seller can sign out or close their browser; the stored GitHub authorization supports delivery independently. Revocation or loss of repository access prevents delivery. Preflight checks block an already unavailable repository before a payment request; they cannot guarantee access will remain available after payment.

Access time starts at the successful checkout block timestamp. Retrying confirmation reuses the same grant and purchase ID. It never extends expiry or resets a consumed one-time download. Browser checkout retains pending receipt credentials locally so "Recover purchase" retries confirmation instead of paying again. Do not share those credentials. Browser loss between transaction broadcast and persisting its hash still needs manual transaction recovery; the retained pending quote can be used with the hash. Pending quote records are encrypted in Redis and retained for recovery; retention/reconciliation needs production operational policy.

There is no escrow, refund mechanism, guaranteed repository snapshot, subscription, fee, upgrade proxy or admin withdrawal. GitHub ownership and delivery stay offchain. Public receipts expose wallet addresses, amounts, token, opaque listing ID and terms hash, not repository names or GitHub tokens. A terms hash is a commitment, not encryption of guessable terms.

## Deploy and test

```sh
npm run contracts:compile
anvil --silent --port 18545
# In a second terminal, with Anvil running:
npm run contracts:test
# Seller deployment wallet must have Arc test USDC for gas:
npm run contracts:deploy
npm run graph:configure
npm run graph:codegen
npm run graph:build
npm run graph:deploy
```

`contracts:deploy` uses the explicitly chosen `ARC_SELLER_PRIVATE_KEY`, checks chain ID/token decimals/balance, and caps the maximum deployment fee at 5 test USDC. It generates a separate `CHECKOUT_SIGNER_PRIVATE_KEY` in ignored `.env` if absent. Do not commit or log either key. Pending transaction and deployment files prevent accidental duplicate deployment. The quote signer is immutable; rotate it by deploying a new contract and updating configuration. Restart the API after changing `.env`.

Contract tests use only the public Anvil test mnemonic. They cover transfers, event emission, order replay, wrong buyer, modified amount, expiry, unsupported token, chain/contract domain separation, failed transfers and reentrancy. This is a testnet implementation, not an audited production contract.

## Graph and x402

Studio project: **MargitArc**, slug **margit-arc**, deployed version **v0.3.0**. [Studio](https://thegraph.com/studio/subgraph/margit-arc). Query endpoint: `https://api.studio.thegraph.com/query/2012/margit-arc/v0.3.0`. Deployment is in Studio; publishing to the decentralized network is a separate action. The manifest is generated from the actual deployment and indexes `PurchaseCompleted`. Configure `GRAPH_QUERY_URL` from Studio after deployment. The portfolio displays indexing status, and remains usable when Graph is unavailable.

Circle Gateway x402 remains an independent path: its accepted authorizations and batched settlements do not emit this checkout contract's events. Portfolio records distinguish Gateway acceptance from contract confirmation. The built-in agent uses the same contract quote/purchase/confirmation flow as wallet checkout. Future MCP tools should call these services, enforce the selected purchase channel and preserve buyer/session authorization; payment method is not proof of human or agent identity.

## Verified deployment

A 0.01 test-USDC self-transfer on v3 emitted purchase ID `0xebd043be6b81db1d7f159b4b37cfa917e4994250435a6e7eadf400f7a710925e` in transaction `0xa26fac8f426c32cde2ac498ddfd36bba5e444af5d6b4bd74285fecec033a4327`. This is a deployment test, not a repository purchase, and has no private portfolio ledger entry. See `smoke.arc-testnet.v3.json`. Earlier deployment metadata and smoke reports are retained.

## Explorer source verification

Run `npm run contracts:verify` to verify/publish the Solidity source on Arc's Blockscout explorer. The script recompiles and checks an exact match against the deployed creation bytecode, including constructor arguments, before submitting. No private key, wallet transaction or gas payment is required.

Compiler: `v0.8.36+commit.8a079791`; optimizer enabled, **200 runs**; EVM target **paris**; license **MIT**. The standard JSON input is saved as `artifacts/MargitCheckout.standard-input.json` for manual submission if needed. Source verification proves a source/bytecode match; it is not a security audit.

## Native USDC migration

Version 2 accepts native USDC through `msg.value`; EURC still uses `transferFrom`. Quote and event amounts remain in six decimals for both currencies. Named Solidity custom errors replace revert strings. Incorrect native value and failed payouts revert without consuming the order.

The legacy deployment is preserved in [deployment.arc-testnet.v1.json](deployment.arc-testnet.v1.json). Graph indexes v1, v2 and v3 addresses. Saved quotes retain their original contract address, so earlier purchase confirmation and recovery remain supported. New quotes use v3. Existing v1 approvals do not need renewal for native USDC.

Deploy the administration migration with `npm run contracts:deploy -- --admin`, then verify, configure Graph and deploy a new Studio version. Source changes after deployment require another deployment because the contract is not upgradeable.


## Administration (v3)

The deployed v3 contract adds deployer administration. Initial admin: `0x4d2A622F53a2ac4D3Ee1c06bCeB4641a8a6fE6aa`.

- `admin` starts as constructor `msg.sender`, independently of the backend quote signer.
- `setAllowedToken(token, allowed)` enables or disables a token. Enabling requires a nonzero contract address. Disabling rejects unfulfilled quotes for that token without consuming their order IDs.
- `transferAdmin(newAdmin)` nominates a replacement; `acceptAdmin()` completes the transfer from the nominated wallet. The existing admin retains control until acceptance and can cancel or replace the nomination.
- Admin changes and token permissions emit events. Admin cannot change the immutable quote signer.
- Token permission alone does not add a currency to the app. The quote service and wallet UI still support USDC and EURC; another token needs explicit metadata, decimal handling, pricing and client support.

Fee design research and the pending decision are recorded in [fee-model.md](../docs/fee-model.md).
