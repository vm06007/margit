import { ARC_EURC_ADDRESS, ARC_CIRBTC_ADDRESS } from "./constants";
import { createThirdwebClient } from "thirdweb";
import { arcTestnet } from "thirdweb/chains";
import { darkTheme } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim() ?? "";
const walletConnectProjectId =
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || "9bfbc3dd1bc5aa9fb800471ee00c0eb5";

if (!clientId) {
    throw new Error(
        "Missing VITE_THIRDWEB_CLIENT_ID. Set it in .env locally and in Vercel Project Settings.",
    );
}

export const thirdwebClient = createThirdwebClient({ clientId });

export { arcTestnet };

export const thirdwebAppMetadata = {
    name: "margit",
    url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
    description: "margit — sell access to private GitHub repos, paid in USDC on Arc",
};

// Native USDC is included automatically by Thirdweb's asset list.
export const thirdwebSupportedTokens = {
    [arcTestnet.id]: [
        { address: ARC_EURC_ADDRESS, name: "EURC", symbol: "EURC", icon: `${thirdwebAppMetadata.url}/icons/eurc.svg` },
        { address: ARC_CIRBTC_ADDRESS, name: "Circle Wrapped Bitcoin", symbol: "cirBTC", icon: `${thirdwebAppMetadata.url}/icons/cirbtc.svg` },
    ],
};

// Injects our WalletConnect projectId + app metadata into every WalletConnect-based
// connect() call — without this, external wallets' WalletConnect flow (and often their
// icon/name metadata) fails to load.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withWalletConnect(wallet: any): any {
    const orig = wallet.connect.bind(wallet);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet.connect = (options: any) => {
        if (options?.walletConnect) {
            return orig({
                ...options,
                walletConnect: {
                    ...options.walletConnect,
                    projectId: walletConnectProjectId,
                    appMetadata: thirdwebAppMetadata,
                },
            });
        }
        return orig(options);
    };
    return wallet;
}

export const thirdwebWallets = [
    inAppWallet({
        auth: {
            options: ["google", "email", "passkey", "github", "apple", "guest"],
        },
    }),
    withWalletConnect(createWallet("io.metamask")),
    withWalletConnect(createWallet("io.rabby")),
    withWalletConnect(createWallet("com.coinbase.wallet", { appMetadata: thirdwebAppMetadata })),
];

// Same accent as our own .btn-primary (--accent).
export const thirdwebTheme = darkTheme({
    colors: {
        modalBg: "#16171c",
        borderColor: "#2a2c33",
        accentText: "#4da3ff",
        accentButtonBg: "#4da3ff",
        primaryButtonBg: "#4da3ff",
        primaryButtonText: "#061019",
        connectedButtonBg: "transparent",
        connectedButtonBgHover: "transparent",
        secondaryButtonHoverBg: "rgba(77, 163, 255, 0.15)",
        secondaryText: "#8b8d97",
        primaryText: "#f5f6f8",
    },
});
