# Portfolio and agent integration

The contract/payment design, limitations, test and deployment steps are documented in [contracts/README.md](../contracts/README.md).

`/portfolio` shows durable sales and purchase records independently of expiring repository access. Wallet owners authenticate with a nonce signature; sellers use their GitHub session. The built-in agent's operator session can view its own purchases. History never includes encrypted access credentials. The access endpoint returns only the buyer/operator's original grant; retrieving it does not extend delivery terms.

Wallet and built-in agent checkout use buyer-specific contract quotes. Server receipt verification checks the emitting contract, order, listing, buyer, seller, token, amount and terms before recording access. Records contain contract address and onchain purchase ID for Graph enrichment. x402 Gateway records are kept separately and marked accepted, since batched settlement is not one contract receipt per purchase.

For a future MCP server or skill, expose browse/inspect terms, create/edit listings, request quote, approve/pay, confirm/recover purchase, list history and retrieve existing access. Use the same services and IDs as the app. Keep GitHub ownership, buyer wallet ownership, session authorization and payment method as separate checks. Do not expose seller tokens in tool results. Agent spending and listing mutations need authorization from its user. Do not pay again to recover a receipt.

Historical records are not backfilled because earlier versions did not maintain a purchase ledger. Redis persistence and backups remain required; The Graph does not contain private delivery credentials. Gateway reconciliation, paid-but-undeliverable recovery/refunds, pending-order cleanup and reliable recovery after browser/session loss remain production work.
