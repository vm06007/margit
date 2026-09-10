# Circle Agent Wallet in web chat

The third wallet option connects a visitor's Circle Agent Wallet on Arc testnet. It does not replace the existing demo or personal EOA wallets.

## Setup

Run `npm install` (or run `node scripts/prepare-circle-cli.mjs` after an install that skips lifecycle scripts). The integration pins `@circle-fin/cli` to 1.0.0. No additional Circle application API key is required by this CLI flow. Existing Redis and `TOKEN_ENCRYPTION_KEY` configuration is required.

The postinstall adapter disables the CLI's host keychain methods. This is mandatory for a multi-user service: Circle CLI normally uses a fixed host keychain account. Each command instead restores an encrypted per-visitor snapshot into a private temporary directory via `CIRCLE_CLI_HOME`, invokes Node without a shell, saves encrypted state to Redis, and removes the temporary directory. Never remove the adapter without replacing the isolation mechanism. Review the patch signatures when upgrading Circle CLI.

Vercel must include the CLI entrypoint and its runtime dependencies. The function duration is 300 seconds because Circle provisioning and contract confirmations can take longer than a normal API request. Deployment packaging and real email verification must be checked in the deployment environment.

## User flow

Choose Circle Agent Wallet, enter an email, accept Circle's terms, and enter the emailed code. Wallets are provisioned through Circle. The Arc SCA address is displayed for funding; Gateway payments use its backing EOA. Switching away preserves the Circle session. Disconnect deletes Margit's stored session; it does not delete the Circle account or move funds.

The chat is paused while connection is incomplete. Circle purchases use x402 only, with no demo-wallet or contract-checkout fallback. The app requests an Arc testnet challenge, validates the price, recipient, asset and Gateway contract before signing, then submits one paid request. A pending intent remains locked on uncertain failures. The returned settlement receipt and same-origin access URL are checked before displaying success.

Circle CLI stores authentication tokens, not an exported wallet private key, in the encrypted snapshot. Users should keep this browser's cookies to retain access to this connection, or reconnect with their Circle email. OTP requests have a cooldown and verification is limited to five attempts per request.

## Verification

`npx tsc -b`

`npx tsc --noEmit -p server/tsconfig.json`

`KV_REST_API_URL=https://example.com KV_REST_API_TOKEN=test node --import tsx --test server/tests/circle-managed.test.ts server/tests/agent-wallet.test.ts server/tests/circle-payment.test.ts`

A real login, funding and purchase still require the account holder's verification code and explicit payment instruction. Automated tests do not prove Circle's remote authentication or signing service availability.
