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

Only USDC is supported for deferred settlement because the current Gateway path charges USDC. Contract checkout supports USDC and EURC. New tokens require application metadata and pricing support in addition to the contract allowlist.

No new-listing or existing-listing restriction is enabled for unpaid fees. Collection currently depends on publishers settling; the dashboard does not imply guaranteed collection. No retroactive fees are charged for recorded sales before launch.

## Collection model

Margit uses deferred billing for Circle Gateway payments and atomic fee collection for purchases processed by its checkout contract.
