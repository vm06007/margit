import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActiveAccount, useConnectModal, useWalletDetailsModal } from "thirdweb/react";
import { shortenAddress } from "thirdweb/utils";
import { resolveArcNsReverse, revokeGithubAccess, type Me } from "../api";
import { arcTestnet, thirdwebAppMetadata, thirdwebClient, thirdwebTheme, thirdwebWallets } from "../lib/thirdweb";
import { ARC_USDC_ADDRESS } from "../lib/constants";
import { AccountIcon, GitHubIcon, LogoutIcon, RobotIcon, TrashIcon, WalletIcon } from "./icons";

export function NavLink({ to, path, navigate, children }: { to: string; path: string; navigate: (p: string) => void; children: ReactNode }) {
    const active = path === to;
    return (
        <a
            href={to}
            className={`nav-link ${active ? "nav-link-active" : ""}`}
            onClick={(e) => {
                e.preventDefault();
                navigate(to);
            }}
        >
            {children}
        </a>
    );
}

export function NavBar({
    path,
    navigate,
    me,
    onLogout,
    agentOpen,
    onToggleAgent,
}: {
    path: string;
    navigate: (p: string) => void;
    me: Me;
    onLogout: () => void;
    agentOpen: boolean;
    onToggleAgent: () => void;
}) {
    return (
        <header className="topbar">
            <div className="nav">
                <a href="/" className="brand">
                    margit
                </a>
                <NavLink to="/profile" path={path} navigate={navigate}>
                    My Repos
                </NavLink>
                <NavLink to="/catalog" path={path} navigate={navigate}>
                    Catalog
                </NavLink>
            </div>
            <div className="nav-right">
                <button
                    type="button"
                    className={`btn nav-agent-btn ${agentOpen ? "btn-primary" : "btn-outline"}`}
                    onClick={onToggleAgent}
                >
                    <RobotIcon /> Agent
                </button>
                <ProfileDropdown me={me} onLogout={onLogout} />
            </div>
        </header>
    );
}

export function ProfileDropdown({ me, onLogout }: { me: Me; onLogout: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const account = useActiveAccount();
    const [arcName, setArcName] = useState<string | null>(null);
    const connectModal = useConnectModal();
    const walletDetailsModal = useWalletDetailsModal();

    useEffect(() => {
        setArcName(null);
        if (!account) return;
        let cancelled = false;
        resolveArcNsReverse(account.address).then((name) => {
            if (!cancelled) setArcName(name);
        });
        return () => {
            cancelled = true;
        };
    }, [account]);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const revoke = async () => {
        if (
            !confirm(
                "This revokes margit's GitHub access entirely — you'll need to re-approve on next sign-in. Continue?",
            )
        ) {
            return;
        }
        try {
            await revokeGithubAccess();
        } catch {
            // Session is destroyed server-side either way; fall through to local logout.
        }
        setOpen(false);
        onLogout();
    };

    const handleWalletClick = () => {
        setOpen(false);
        if (account) {
            walletDetailsModal.open({
                client: thirdwebClient,
                chains: [arcTestnet],
                theme: thirdwebTheme,
                displayBalanceToken: { [arcTestnet.id]: ARC_USDC_ADDRESS },
                connectedAccountName: arcName ?? shortenAddress(account.address),
            });
        } else {
            connectModal
                .connect({
                    client: thirdwebClient,
                    wallets: thirdwebWallets,
                    chain: arcTestnet,
                    appMetadata: thirdwebAppMetadata,
                    theme: thirdwebTheme,
                })
                .catch(() => undefined); // user closed the modal without connecting
        }
    };

    return (
        <div className="profile-dropdown" ref={ref}>
            <button type="button" className="profile-trigger" onClick={() => setOpen((v) => !v)}>
                {me.authenticated ? (
                    <>
                        {me.avatarUrl && <img src={me.avatarUrl} alt="" className="avatar" />}
                        <span>{me.name ?? me.login}</span>
                    </>
                ) : (
                    <>
                        <AccountIcon />
                        <span>Account</span>
                    </>
                )}
            </button>
            {open && (
                <div className="profile-menu">
                    {me.authenticated && (
                        <div className="profile-menu-header">
                            <p className="hint">Signed in as</p>
                            <p>{me.login}</p>
                        </div>
                    )}
                    <button type="button" className="profile-menu-item" onClick={handleWalletClick}>
                        <WalletIcon /> {account ? (arcName ?? shortenAddress(account.address)) : "Connect Wallet"}
                    </button>
                    {me.authenticated && (
                        <>
                            <a
                                href={`https://github.com/${me.login}`}
                                target="_blank"
                                rel="noreferrer"
                                className="profile-menu-item github-icon-link"
                            >
                                <GitHubIcon /> GitHub profile
                            </a>
                            <button
                                type="button"
                                className="profile-menu-item"
                                onClick={() => {
                                    setOpen(false);
                                    onLogout();
                                }}
                            >
                                <LogoutIcon /> Log out
                            </button>
                            <button
                                type="button"
                                className="profile-menu-item profile-menu-danger btn-icon"
                                onClick={revoke}
                            >
                                <TrashIcon /> Revoke GitHub access
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
