# Publisher fees

Margit charges 0.5% of each eligible sale, deducted from publisher earnings rather than added to the buyer's advertised price. Network gas is separate.

## Contract checkout

The checkout uses a fixed 50 basis-point rate and an immutable treasury initialized to the deployment wallet. Quotes commit to gross amounts and the verifying contract; the fee cannot change underneath a signed quote. Administration transfers do not move the treasury.

The fee is integer division of gross token units by 200, rounded down. The publisher receives the remainder. USDC quote/event amounts use six decimals and native transfers use eighteen. EURC transfers remain ERC-20 transfers. If either payout fails, the entire purchase reverts.

PurchaseCompleted retains the gross amount. PurchaseFeeCollected records fee, net proceeds, token and treasury. The backend records these as automatically collected fees, never as x402 debt.

## Circle Gateway x402

Gateway pays the publisher without calling checkout. Eligible sales are recorded with a deferred 0.5% fee after PLATFORM_FEES_STARTED_AT. Existing purchase records remain unchanged; retries do not create another sale or fee.

My Portfolio shows gross sales, net earnings, fees collected automatically, deferred fees accrued, payments, balance owed and any excess credit. Accounting uses integer token units, not floating-point sums. Net earnings deduct fees whether collected or still owed.

## Publisher settlement

A GitHub-authenticated publisher requests POST /api/portfolio/fees/prepare. The server returns the current USDC balance, fee contract and a seller ID derived from the normalized GitHub login.

The wallet calls payDeferredFees(sellerId) with native USDC. The contract forwards funds to the treasury and emits DeferredFeesPaid with the seller ID, payer and six-decimal amount. This ID is public and does not encode credentials.

POST /api/portfolio/fees/confirm verifies the successful transaction, exact fee contract and matching publisher ID. Payment credit is persisted once per contract, transaction and seller; repeated confirmations repair indexing without double-crediting. Another wallet can pay on behalf of the publisher, but another publisher cannot claim that receipt.

Browser storage retains a pending transaction for recovery before another payment is requested. If storage is lost, the authenticated publisher can confirm their transaction hash through the same endpoint. Concurrent payments may create credit; credit offsets later debt and is not automatically refunded.

## Boundaries

Only USDC is supported for deferred settlement because the current Gateway path charges USDC. Contract checkout supports USDC, EURC, and seller-enabled cirBTC. New tokens require application metadata and pricing support in addition to the contract allowlist.

At 1.00 USDC owed, new x402 purchases are blocked across every listing owned by the seller. Listing creation is still allowed, but does not bypass the purchase gate. Contract checkout remains available because it collects fees automatically. Existing access grants retain their original terms. This restricts further sales, not the ability to abandon unpaid debt. No retroactive fees are charged for recorded sales before launch.

## Collection model

Margit uses deferred billing for Circle Gateway payments and atomic fee collection for purchases processed by its checkout contract.

## Why this model and how it compares with other x402 integrations

Contract checkout collects our fee automatically. Circle x402 pays sellers directly, and we track the platform fee against their seller account for later settlement. This keeps the payment flow simple. New x402 purchases pause at 1.00 USDC in unpaid fees and resume once the balance is below that threshold.

The fee is a publisher obligation, not an agent-wallet obligation. Creating a new buyer agent does not clear it. The permanent GitHub account ID owns the fee eligibility identity. Verified historical login aliases are aggregated for sales and fee credits, retaining the original ledger login for compatible contract receipts. Renaming the account or replacing the buyer agent does not reset debt. A different GitHub account cannot claim an existing login’s ledger without identity review. Publisher reputation encourages settlement but does not guarantee it.

### Documented capabilities

As reviewed on September 8, 2026, our installed Circle Nanopayments SDK (`@circle-fin/x402-batching` 3.4.0) and its [public SDK reference](https://developers.circle.com/gateway/nanopayments/references/sdk) use a single recipient for a payment. We found no documented native parameter for splitting one purchase between publisher and platform. This is a limitation of the integration surface reviewed, not a claim that every Circle product or future SDK lacks fee functionality.

The [x402 seller quickstart](https://docs.x402.org/getting-started/quickstart-for-sellers) likewise advertises a price and a `payTo` recipient. This works naturally for an API operator selling its own service: the operator receives the price and its margin is part of that price. A marketplace introduces a separate seller and platform. A facilitator's own processing fee is a different charge from the marketplace's commission; paying a facilitator does not collect Margit's 0.5%.

### Application design options

These are architectural options, not claims that all x402 facilitators implement them:

- **Direct seller payment plus separate billing:** our current model. Preserves direct payment and avoids Margit holding seller proceeds; leaves collection risk.
- **Prepaid seller credit:** deduct commissions from seller credit and reject new purchases before payment if credit is insufficient. Requires funded credit and concurrency-safe accounting.
- **Platform collection followed by net payouts:** receive the gross amount, retain the fee, and distribute seller earnings. Requires custody of proceeds, a payout ledger, reconciliation, and recovery. Circle acceptance and available funds are distinct stages; see [batched settlement](https://developers.circle.com/gateway/nanopayments/concepts/batched-settlement).
- **Custom atomic settlement split:** use a compatible contract/scheme/facilitator that executes both allocations together. Our contract checkout already splits atomically, but it is a separate payment route. Merely pointing a standard token transfer at a splitter contract does not guarantee its payout logic executes. Compatibility must be demonstrated with the chosen x402 scheme and facilitator.

There is no universally required marketplace commission mechanism in the standard flow cited above. Margit deliberately keeps deferred billing for the current testnet demo and documents the tradeoff rather than presenting it as enforced collection.

### Suggested Circle enhancement

A useful marketplace extension would let the buyer authorize the gross price, seller recipient, platform recipient, and fee together, and return verifiable receipts for both allocations. It should define rounding, atomic failure behavior, and replay protection without increasing the advertised buyer price. This is a product suggestion, not functionality we claim to have implemented or requested from Circle.

## Threshold operation and legacy seller backfill

The threshold is `1.00` USDC (`X402_FEE_DEBT_LIMIT` in `server/src/fee-eligibility.ts`). The shared server middleware checks both unpaid discovery requests and signed purchase retries, before the Circle middleware can accept payment. Signed requests are serialized by permanent GitHub ID across listings until purchase recording completes. A sale admitted below the limit can take debt above it; the next sale is rejected. This is a stop threshold, not a hard upper bound on debt. Confirmed fee payments below the limit automatically restore eligibility on the next request.

Storage or identity lookup failures fail closed. An ambiguous signed settlement retains its seller lock (`margit:x402-fee-lock:<github-id>`). An operator must reconcile the Circle receipt and purchase record before deleting that lock; it must not be cleared solely because time has elapsed.

For an existing deployment, backfill all legacy listings before announcing rename-resistant enforcement:

```sh
node --env-file=.env --import tsx scripts/backfill-seller-identities.ts
```

The script verifies stored seller credentials against GitHub and attaches legacy login aliases to the immutable ID. It is idempotent and does not move funds. Revoked credentials require the seller to reconnect or operator review. Run it on each deployment's database; local migration does not migrate a separate production database. Existing receipt hashes and debt records are retained rather than rewritten. Future listing creation authenticates the permanent identity, and authenticated portfolio requests resolve the same ledger.
