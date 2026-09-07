# Margit checkout on Arc Testnet

`MargitCheckout.sol` implements payment and receipts, not repository custody. Arc Testnet chain ID is **5042002**. The deploy script writes the verified address, transaction, start block, token addresses and public quote signer to `deployment.arc-testnet.json` after deployment succeeds. Current deployment: `0x3adc0cce0f7a5c7b543a09bc3b783f8317c9108b`, start block **60950495**. [Explorer](https://testnet.arcscan.app/address/0x3adc0cce0f7a5c7b543a09bc3b783f8317c9108b).

## Payment flow

1. Seller connects GitHub and lists a repository with price, payout wallet and delivery policy. No onchain listing transaction or seller wallet signature is required in this version.
2. Buyer requests `POST /api/checkout/quote`. Margit validates the listing and wallet purchase channel, checks GitHub archive delivery, and signs a five-minute EIP-712 quote with a separate backend signing key.
3. The quote contains a random order ID, opaque listing hash, terms hash, buyer, seller, token, amount and deadline. The domain binds it to this chain and deployment. A separate secret authorizes receipt recovery; it is never included in transaction calldata or events.
4. Buyer approves the checkout contract for the required ERC-20 amount, then calls `buy`. The contract checks signature, buyer, expiry, supported token and order uniqueness. It transfers payment straight to the payout wallet and emits `PurchaseCompleted` in the same transaction. Failed transfers revert the order consumption.
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

Studio project: **MargitArc**, slug **margit-arc**, deployed version **v0.1.0**. [Studio](https://thegraph.com/studio/subgraph/margit-arc). Query endpoint: `https://api.studio.thegraph.com/query/2012/margit-arc/v0.1.0`. Deployment is in Studio; publishing to the decentralized network is a separate action. The manifest is generated from the actual deployment and indexes `PurchaseCompleted`. Configure `GRAPH_QUERY_URL` from Studio after deployment. The portfolio displays indexing status, and remains usable when Graph is unavailable.

Circle Gateway x402 remains an independent path: its accepted authorizations and batched settlements do not emit this checkout contract's events. Portfolio records distinguish Gateway acceptance from contract confirmation. The built-in agent uses the same contract quote/purchase/confirmation flow as wallet checkout. Future MCP tools should call these services, enforce the selected purchase channel and preserve buyer/session authorization; payment method is not proof of human or agent identity.

## Verified deployment

A 0.01 test-USDC self-transfer smoke test emitted purchase ID `0xfed311682e012e48ae8826a1a823b64eedc2d62a13e222b4a89d38c276696cd4` in transaction `0x4a6d44337212ee1b97794cdc98c71d7bf887a6f56efda596520c93a9488ea440`. Studio returned this receipt with no indexing errors. This event is a deployment test, not a repository purchase, and has no private portfolio ledger entry. See `smoke.arc-testnet.json`.
