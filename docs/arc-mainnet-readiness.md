# Arc mainnet readiness and launch runbook

Status as of September 8, 2026: **working Arc testnet MVP; mainnet deployment tooling prepared; application cutover and production sign-off pending.** The application currently runs on testnet.

Circle's [August 5 announcement](https://www.circle.com/es/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch) targets public mainnet on September 16. The [network reference](https://docs.arc.io/arc/references/connect-to-arc) currently documents testnet connection parameters. Populate mainnet values from Circle's official release information when available; do not substitute guessed chain IDs, testnet tokens, or third-party rumours.

## Repeatable readiness assessment

```sh
npm run arc:readiness
npm run arc:test-release
```

`arc:readiness` is offline and read-only. It prints JSON with the checked revision and known blockers and exits 1 while blocked. A green build is not mainnet sign-off. The checked-in example deliberately contains null network/address fields.

## Prepare an unsigned mainnet deployment

1. Copy `config/arc-mainnet.example.json` to an untracked local JSON file. Fill in official chain ID, RPC, explorer, official source URLs, confirmed USDC/EURC addresses, a dedicated deployment/treasury address and a separate quote signer. RPC metadata is not proof of issuer authenticity; verify addresses against Circle.
2. Review the current contract's custody model: **v4 fixes treasury to the deploying address forever**. Transferring admin changes control, not fee ownership. The tool rejects a treasury/deployer mismatch. If a multisig or separate treasury is required, change and review the constructor/deployment approach first; do not send fees to a temporary deployment wallet.
3. Fund the declared deployment address with native mainnet USDC for deployment gas only after that decision. This tooling reads only its public address. Keep production signing keys outside the manifest and repository.
4. Compile and prepare:

```sh
npm run arc:prepare-mainnet -- /absolute/path/arc-mainnet.local.json /absolute/path/arc-plan.local.json
```

The command recompiles the actual contract, validates the manifest, verifies RPC chain ID and USDC/EURC decimals and symbols, estimates deployment gas, checks available balance, applies a 20% gas buffer and 2× gas-price ceiling, and enforces the chosen maximum USDC fee. It writes an unsigned contract-creation transaction plus source/bytecode hashes. Output uses exclusive creation so an existing plan is not overwritten. It never loads a private key, signs, broadcasts, changes `.env`, or changes testnet deployments. Unsigned plans contain no signing keys; keep provider URLs/configuration private if your RPC provider embeds credentials in its URL.

5. Independently review the plan and submit it through the declared deployment wallet. Re-estimate if delayed; a plan is not a reserved gas price. Record the chain ID, successful receipt, deployed address, source hash, constructor values and start block. Verify source code and read back `quoteSigner`, `admin`, `treasury`, `FEE_BPS`, and `allowedToken` before accepting money.
6. Enable optional cirBTC only after official mainnet support/address verification. The existing `enable-cirbtc.ts` is TESTNET-ONLY. Do not reuse it for mainnet or assume testnet assets are available there.

## Application cutover

| Area | Required before real funds |
| --- | --- |
| Network selection | Replace testnet selections in backend `payments.ts`, browser `thirdweb.ts`, shared EIP-712 chain ID, token constants, explorer links and agent metadata with one reviewed production configuration. Browser/backend must agree. |
| x402 / Gateway | Confirm mainnet chain support and facilitator/domain/token configuration against [Circle's supported networks](https://developers.circle.com/gateway/references/supported-blockchains). If unsupported, disable x402 end-to-end and use contract wallet checkout. Do not point mainnet at the testnet facilitator. |
| State isolation | Use a separate production Redis instance and encryption key. Do not reuse testnet listings, grants, consumed transaction records, fee records or receipts as mainnet state. |
| Wallet custody | Disable the shared demo buyer wallet for production. Use per-user wallets with per-purchase and daily budgets, seller/token allowlists, concurrency-safe spend reservations and auditable decisions. |
| Secrets | Separate deployment, quote-signing, encryption and operational keys. Restrict production access and prepare quote signer/admin rotation. Never place secrets in VITE variables. |
| Treasury and contract | Decide permanent treasury custody; complete independent contract/security review. Confirm emergency pause/admin flows and fee accounting. Existing tests are not an audit. |
| Indexing | Configure mainnet Graph network, contract and start block if supported; otherwise disclose backend receipt reporting until indexing is live. Prevent testnet index data from appearing as mainnet proof. |
| Operations | HTTPS deployment, correct GitHub OAuth callback, backups/restore, RPC/quote/receipt/delivery monitoring, incident contact, and payment-disable rollback. Repository delivery depends on seller GitHub credentials; it is not an escrow guarantee. |
| Acceptance | Small authorized USDC and EURC purchases, insufficient funds, expired quote, wrong buyer/chain, replay rejection, fee split, confirmation retry, ZIP/clone access, expiry/permanent policies, seller reconnection, and MCP discovery. |

Preserve receipt recovery during an incident. Stop new payment initiation before disabling confirmations/access. Never recommend paying again when receipt confirmation is pending.

## Release record

Keep a release record with the deployed app URL, Git revision, build/test results, mainnet configuration source links, deployment/verification links, contract start block, treasury/signer decision, isolation/monitoring review, smoke-test evidence and rollback owner. The current `arc:readiness` command intentionally reports the source-level blockers and operational sign-off still required; it does not certify a production release automatically.
