import { createThirdwebClient } from "thirdweb";
import { arcTestnet } from "thirdweb/chains";
import { createWallet, inAppWallet } from "thirdweb/wallets";

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim() ?? "";

if (!clientId) {
    console.warn(
        "[margit] Missing VITE_THIRDWEB_CLIENT_ID in .env — the Connect Wallet button will fail. " +
        "Get one free at https://thirdweb.com/dashboard (Settings > API Keys).",
    );
}

export const thirdwebClient = createThirdwebClient({ clientId });

export { arcTestnet };

export const thirdwebWallets = [
    inAppWallet({ auth: { options: ["google", "email", "passkey", "guest"] } }),
    createWallet("io.metamask"),
    createWallet("io.rabby"),
    createWallet("com.coinbase.wallet"),
];
