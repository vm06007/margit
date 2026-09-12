# 1Claw purchasing wallet

Select **1Claw Agent Wallet** in the agent wallet settings, enter your agent ID, agent API key (`ocv_`), and EVM signing address, then authorize encrypted credential storage and connect. Margit verifies a fresh message signature before selecting the wallet. Private keys remain with 1Claw; the agent credential is encrypted in Redis and tied to the browser's agent session.

## Signing permissions

Enable Intents, `arc-testnet` transactions, personal signing for connection verification, and EIP-712 typed-data signing. Allow the Circle Gateway verifying contract `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` for x402. Transaction policies must allow the deployed Margit checkout contract and, for Gateway deposits, USDC approvals and Gateway deposits. Configure spending limits in 1Claw appropriate to your wallet.

Official request formats: [Arc example](https://github.com/1clawAI/1claw-examples/tree/main/arc-stablecoin), [EVM signing examples](https://github.com/1clawAI/1claw-examples/tree/main/evm-signing).

## Using the wallet

Fund the displayed Arc testnet address. Contract checkout uses the listing's accepted currency; gas uses native USDC. For x402, use **Add to x402 Gateway** to deposit USDC first. Purchases use the selected wallet, with no fallback to the demo wallet. Disconnect removes the stored credential and selects demo mode; it does not transfer funds or revoke previously signed authorizations.

The remote adapter verifies the signer and transaction fields before broadcasting. x402 retains the existing listing/challenge validation and duplicate-payment locks. An uncertain operation remains locked for reconciliation rather than automatically spending again.

## Implementation and verification

- [Remote signer and encrypted connection](../server/src/oneclaw.ts)
- [Wallet selection and Gateway deposits](../server/src/agent-wallet.ts)
- [Contract purchase flow](../server/src/agent.ts)
- [Remote x402 payment flow](../server/src/circle-managed-payment.ts)
- [Adapter regression test](../server/src/tests/oneclaw.test.ts)

Tests use synthetic credentials and a local signer behind mocked HTTP responses. Live 1Claw credentials, funding, signing-policy configuration, and an actual Arc checkout still need an end-to-end verification run. Connecting does not itself prove transaction or EIP-712 permissions; policy denials are surfaced during the requested operation.
