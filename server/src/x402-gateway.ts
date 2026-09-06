import { x402ResourceServer } from "@x402/hono";
import type { FacilitatorClient } from "@x402/core/server";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";

// Arc Testnet, CAIP-2 format (chain ID 5042002). USDC is Arc's native gas token.
export const ARC_TESTNET_NETWORK = "eip155:5042002";

const GATEWAY_FACILITATOR_URL =
    process.env.GATEWAY_FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";

const facilitator = new BatchFacilitatorClient({ url: GATEWAY_FACILITATOR_URL });

// @circle-fin/x402-batching redeclares its own PaymentPayload/PaymentRequirements
// shapes instead of importing @x402/core's, so its FacilitatorClient is structurally
// narrower (e.g. `resource.description` required vs optional) — harmless at runtime.
export const resourceServer = new x402ResourceServer([
    facilitator as unknown as FacilitatorClient,
]).register(ARC_TESTNET_NETWORK, new GatewayEvmScheme());
