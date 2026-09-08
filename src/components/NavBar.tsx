import { GithubConnectButton } from "./GithubConnectButton";
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
                <NavLink to="/works" path={path} navigate={navigate}>
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
    const revokeDialog = useRef<HTMLDialogElement>(null);
    const [revoking, setRevoking] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const closeRevoke = () => {
        if (revoking) return;
        revokeDialog.current?.close();
        if (revokeError) onLogout();
        else ref.current?.querySelector<HTMLButtonElement>(".profile-trigger")?.focus();
    };

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
        if (revoking) return;
        setRevoking(true);
        setRevokeError(null);
        try {
            await revokeGithubAccess();
            revokeDialog.current?.close();
            onLogout();
        } catch (error) {
            setRevokeError(error instanceof Error ? error.message : "Could not revoke GitHub access.");
        } finally {
            setRevoking(false);
        }
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

    if (!me.authenticated) return <GithubConnectButton className="btn btn-anim btn-default btn-mobile-icon btn-outline slide-right-up" />;

    return (
        <div className="profile-dropdown" ref={ref}>
            <button type="button" className="profile-trigger btn btn-anim btn-default btn-mobile-icon btn-outline" onClick={() => setOpen((v) => !v)}>
                {me.authenticated ? (
                    <>
                        {me.avatarUrl && <img src={me.avatarUrl} alt="" className="profile-avatar" />}
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
                <div className="profile-menu"><a href="/portfolio" className="profile-menu-item"><i className="ph ph-chart-line" /> My Portfolio</a><a href="/works" className="profile-menu-item"><i className="ph-bold ph-folder" /> My Repos</a>
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
                                onClick={() => {
                                    setOpen(false);
                                    setRevokeError(null);
                                    revokeDialog.current?.showModal();
                                }}
                            >
                                <TrashIcon /> Revoke GitHub access
                            </button>
                        </>
                    )}
                </div>
            )}
            <dialog ref={revokeDialog} className="revoke-dialog" aria-labelledby="revoke-title" aria-describedby="revoke-description"
                onCancel={event => { event.preventDefault(); closeRevoke(); }}>
                <h2 id="revoke-title">Revoke GitHub access?</h2>
                <p id="revoke-description">This removes Margit’s access to your GitHub account and signs you out. You’ll need to approve access again the next time you connect.</p>
                {revokeError && <p className="revoke-dialog-error" role="alert">{revokeError} Revocation could not be confirmed. Close this dialog to sign out.</p>}
                <div className="revoke-dialog-actions">
                    <button type="button" className="btn btn-default btn-outline" autoFocus disabled={revoking} onClick={closeRevoke}>{revokeError ? "Close" : "Cancel"}</button>
                    {!revokeError && <button type="button" className="btn btn-default revoke-dialog-confirm" disabled={revoking} onClick={revoke}>{revoking ? "Revoking…" : "Revoke access"}</button>}
                </div>
            </dialog>
        </div>
    );
}
