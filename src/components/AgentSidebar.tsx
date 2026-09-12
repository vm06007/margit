import { OneClawVerification } from "./OneClawVerification";
import { connectCircleAgent, verifyCircleAgent, disconnectCircleAgent } from '../api';
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareTransaction, toWei } from "thirdweb";
import { thirdwebClient, arcTestnet } from "../lib/thirdweb";
import Markdown from "react-markdown";
import { agentSuggestions } from "../lib/agentSuggestions";
import remarkGfm from "remark-gfm";
import { remarkExplorerLinks } from "../lib/remarkExplorerLinks";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { shortenAddress } from "thirdweb/utils";
import {
    fetchAgentModels,
    fetchAgentSettings,
    fetchAgentWallet,
    selectAgentWallet,
    depositAgentGateway,
    sendAgentMessage,
    updateAgentSettings,
    type AgentListingChange,
    type AgentModel,
    type AgentPurchase,
    type AgentSettings,
    type AgentWallet,
} from "../api";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { CloneResult } from "./CloneResult";
import { MicIcon } from "./icons";
import { Toast } from "./Toast";

export function AgentSettingsPanel({ onSaved, onClose }: { onSaved: (settings: AgentSettings) => void; onClose: () => void }) {
    const [models, setModels] = useState<AgentModel[] | null>(null);
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [model, setModel] = useState("");
    const [customModel, setCustomModel] = useState(false);
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchAgentModels().catch(() => [] as AgentModel[]), fetchAgentSettings().catch(() => null)])
            .then(([modelList, savedSettings]) => {
                if (cancelled) return;
                setModels(modelList);
                if (!savedSettings) return;
                setSettings(savedSettings);
                const known = modelList.some((m) => m.id === savedSettings.model);
                setCustomModel(!known && Boolean(savedSettings.model));
                setModel(savedSettings.model);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const next = await updateAgentSettings({ model, ...(apiKey.trim() ? { apiKey } : {}) });
            setSettings(next);
            setApiKey("");
            setSaved(true);
            onSaved(next);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="agent-settings-panel open">
            <div className="agent-settings-header">
                <strong>AI Model Settings</strong>
                <button type="button" className="agent-icon-btn" onClick={onClose} aria-label="Close settings">
                    <i className="ph ph-x" />
                </button>
            </div>
            <label className="agent-settings-label" htmlFor="agent-model-select">
                Model
            </label>
            <select
                id="agent-model-select"
                className="agent-input"
                value={customModel ? "__custom__" : model}
                onChange={(e) => {
                    if (e.target.value === "__custom__") {
                        setCustomModel(true);
                        return;
                    }
                    setCustomModel(false);
                    setModel(e.target.value);
                }}
                disabled={models === null}
            >
                {(models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                        {m.name}
                        {m.free ? " (free)" : ""}
                    </option>
                ))}
                <option value="__custom__">Custom model id…</option>
            </select>
            {customModel && (
                <input
                    id="agent-model-input"
                    className="agent-input"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="provider/model-id"
                    aria-label="Custom model id"
                />
            )}

            <label className="agent-settings-label" htmlFor="agent-key-input">
                Your OpenRouter API key (optional)
            </label>
            <input
                id="agent-key-input"
                className="agent-input"
                type="password"
                autoComplete="off"
                placeholder={
                    settings?.hasCustomKey ? "•••••••• saved — leave blank to keep" : "Leave blank to use the shared default"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="hint">
                Bring your own for any model —{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                    get a free key
                </a>
                .{" "}
                {settings && !settings.hasCustomKey && !settings.hasSharedDefault && (
                    <strong>No shared key is configured — you need your own to use the agent.</strong>
                )}
            </p>

            {error && <p className="error">{error}</p>}
            <button type="button" className="btn btn-anim btn-default btn-small btn-accent" disabled={saving} onClick={save}>
                {saving ? "Saving…" : saved ? "Saved!" : "Save"}
            </button>
        </div>
    );
}

export interface AgentMessage {
    role: "user" | "assistant";
    text: string;
    purchase?: AgentPurchase;
}

export function AgentSidebar({
    path,
    open,
    onClose,
    onListingChange,
}: {
    path: string;
    open: boolean;
    onClose: () => void;
    onListingChange?: (change: AgentListingChange) => void;
}) {
    const [wallet, setWallet] = useState<AgentWallet | null>(null);
    const [, setSettings] = useState<AgentSettings | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showSearchOptions, setShowSearchOptions] = useState(false);
    const [bazanticEnabled, setBazanticEnabled] = useState(() => { try { return localStorage.getItem('margit:bazantic-search') === 'true'; } catch { return false; } });
    const searchClose = useRef<HTMLButtonElement>(null);
    useEffect(() => { if (showSearchOptions) searchClose.current?.focus(); }, [showSearchOptions]);
    const [showAgentSettings, setShowAgentSettings] = useState(false);
    const [pendingWalletMode, setPendingWalletMode] = useState<'shared' | 'personal' | 'circle' | 'oneclaw'>('shared');
    const [walletPreview, setWalletPreview] = useState<AgentWallet | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    useEffect(() => {
        if (!showAgentSettings) return;
        let cancelled = false;
        setPreviewLoading(true); setWalletPreview(null); setWalletError(null); setCircleSetup(false);
        if (pendingWalletMode === 'oneclaw') { setPreviewLoading(false); return; }
        fetchAgentWallet(pendingWalletMode).then(preview => {
            if (!cancelled) setWalletPreview(preview);
        }).catch(error => {
            if (cancelled) return;
            if (pendingWalletMode === 'circle') setCircleSetup(true);
            else setWalletError(error instanceof Error ? error.message : 'Unable to load wallet');
        }).finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; };
    }, [showAgentSettings, pendingWalletMode]);
    const agentSettingsRef = useRef<HTMLDivElement>(null);
    const account = useActiveAccount();
    const { mutateAsync: sendFunding } = useSendTransaction();
    const [walletBusy, setWalletBusy] = useState(false);
    const [balancesRefreshing, setBalancesRefreshing] = useState(false);
    const [fundAmount, setFundAmount] = useState("1");
    const [fundHash, setFundHash] = useState<string | null>(null);
    const [walletError, setWalletError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ message: string; tone: "error" | "success"; id: number } | null>(null);
    const dismissNotification = useCallback(() => setNotification(null), []);
    const notify = (message: string, tone: "error" | "success") => setNotification(previous => ({ message, tone, id: (previous?.id ?? 0) + 1 }));
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRoot = useRef<HTMLDivElement>(null);
    const menuTrigger = useRef<HTMLButtonElement>(null);
    const menuPanel = useRef<HTMLDivElement>(null);
    const [circleSetup, setCircleSetup] = useState(false);
    const [circleEmail, setCircleEmail] = useState("");
    const [circleOtp, setCircleOtp] = useState("");
    const [circleCodeSent, setCircleCodeSent] = useState(false);
    const [circleTerms, setCircleTerms] = useState(false);
    const [showCircleInfo, setShowCircleInfo] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [expandClosing, setExpandClosing] = useState(false);
    const [expandEntering, setExpandEntering] = useState(false);
    const expandOverlay = expanded || expandClosing;
    const [expandedWidthPx, setExpandedWidthPx] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const resizeDrag = useRef<{ startX: number; startWidth: number } | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const voice = useVoiceInput(setInput);

    useEffect(() => {
        if (!open) {
            setExpanded(false);
            setExpandClosing(false);
            setExpandEntering(false);
            setIsResizing(false);
            resizeDrag.current = null;
        }
    }, [open]);

    useEffect(() => {
        if (!expanded || expandedWidthPx !== null) return;
        setExpandedWidthPx(Math.round(window.innerWidth * 0.66));
    }, [expanded, expandedWidthPx]);

    useEffect(() => {
        if (!expandEntering) return;
        const timer = window.setTimeout(() => setExpandEntering(false), 400);
        return () => window.clearTimeout(timer);
    }, [expandEntering]);

    const clampExpandedWidth = useCallback((width: number) => {
        const min = Math.max(360, Math.round(window.innerWidth * 0.34));
        const max = Math.max(min, window.innerWidth - 24);
        return Math.min(max, Math.max(min, Math.round(width)));
    }, []);

    const onExpandResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!expanded || expandClosing) return;
        event.preventDefault();
        event.stopPropagation();
        setExpandEntering(false);
        const panel = event.currentTarget.parentElement;
        const startWidth = panel?.getBoundingClientRect().width ?? window.innerWidth * 0.66;
        resizeDrag.current = { startX: event.clientX, startWidth };
        setIsResizing(true);
        event.currentTarget.setPointerCapture(event.pointerId);
    }, [expanded, expandClosing]);

    const onExpandResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizeDrag.current) return;
        const delta = resizeDrag.current.startX - event.clientX;
        setExpandedWidthPx(clampExpandedWidth(resizeDrag.current.startWidth + delta));
    }, [clampExpandedWidth]);

    const onExpandResizePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizeDrag.current) return;
        resizeDrag.current = null;
        setExpandEntering(false);
        setIsResizing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    const collapseExpanded = useCallback(() => {
        if (!expanded || expandClosing) return;
        setExpandEntering(false);
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setExpanded(false);
            setExpandClosing(false);
            return;
        }
        setExpandClosing(true);
    }, [expanded, expandClosing]);

    const finishExpandClose = useCallback(() => {
        if (!expandClosing) return;
        setExpanded(false);
        setExpandClosing(false);
        setExpandEntering(false);
    }, [expandClosing]);

    const finishExpandEnter = useCallback(() => {
        if (!expandEntering) return;
        setExpandEntering(false);
    }, [expandEntering]);

    useEffect(() => {
        if (!open) return;
        fetchAgentWallet()
            .then(setWallet)
            .catch(() => setWallet({ error: "Could not load agent wallet" }));
        fetchAgentSettings()
            .then(setSettings)
            .catch(() => undefined);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const refresh = () => { void fetchAgentWallet().then(setWallet).catch(() => undefined); };
        const timer = window.setInterval(refresh, 15000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, [open]);

    useEffect(() => {
        if (!menuOpen) return;
        menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const outside = (event: PointerEvent) => {
            if (!menuRoot.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        document.addEventListener("pointerdown", outside);
        return () => document.removeEventListener("pointerdown", outside);
    }, [menuOpen]);

    const walletAction = async (action: () => Promise<void>) => {
        setWalletBusy(true); setWalletError(null); setFundHash(null);
        try { await action(); setWallet(await fetchAgentWallet()); }
        catch (err) { setWalletError(err instanceof Error ? err.message : 'Wallet action failed'); }
        finally { setWalletBusy(false); }
    };

    const refreshBalances = async () => {
        if (balancesRefreshing || walletBusy) return;
        setBalancesRefreshing(true);
        try {
            setWallet(await fetchAgentWallet());
        } catch {
            /* keep current balances on refresh failure */
        } finally {
            setBalancesRefreshing(false);
        }
    };

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, sending]);

    const closeAgentSettings = () => {
        setShowAgentSettings(false);
        setCircleSetup(false);
        requestAnimationFrame(() => menuTrigger.current?.focus());
    };
    useEffect(() => {
        if (showAgentSettings) agentSettingsRef.current?.querySelector<HTMLSelectElement>('select')?.focus();
    }, [showAgentSettings]);

    const send = async (prompt = input) => {
        if (circleSetup || walletBusy) return;
        const text = prompt.trim();
        if (!text || sending || walletBusy) return;
        setInput("");
        setError(null);
        setMessages((prev) => [...prev, { role: "user", text }]);
        setSending(true);
        try {
            const res = await sendAgentMessage(text, bazanticEnabled);
            setMessages((prev) => [...prev, { role: "assistant", text: res.reply, purchase: res.purchase }]);
            {
                fetchAgentWallet()
                    .then(setWallet)
                    .catch(() => undefined);
            }
            if (res.listingChange) onListingChange?.(res.listingChange);
        } catch (err) {
            setError(err instanceof Error ? err.message : "The agent didn't respond");
        } finally {
            setSending(false);
        }
    };

    return (
        <>
        {open && expandOverlay && (
            <button
                type="button"
                className={`agent-expand-backdrop${expandClosing ? " is-collapsing" : ""}`}
                aria-label="Collapse agent"
                onClick={collapseExpanded}
                onAnimationEnd={(event) => {
                    if (event.currentTarget === event.target) finishExpandClose();
                }}
            />
        )}
        <aside id="agent-sidebar" className={`agent-sidebar ${open ? "open" : ""}${expandOverlay ? " expanded" : ""}${expandClosing ? " is-collapsing" : ""}`} inert={!open}>
            <div
                className={`agent-sidebar-inner${wallet === null || walletBusy ? " is-loading" : ""}${showSettings || showAgentSettings || showCircleInfo || showSearchOptions ? " is-settings-open" : ""}${expandEntering ? " is-expanding" : ""}${isResizing ? " is-resizing" : ""}`}
                style={expandOverlay && expandedWidthPx != null ? { width: `${expandedWidthPx}px` } : undefined}
                onAnimationEnd={(event) => {
                    if (event.currentTarget !== event.target) return;
                    finishExpandEnter();
                    finishExpandClose();
                }}
            >
                {expandOverlay && (
                    <div
                        className="agent-expand-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize agent panel"
                        aria-valuenow={expandedWidthPx ?? undefined}
                        onPointerDown={onExpandResizePointerDown}
                        onPointerMove={onExpandResizePointerMove}
                        onPointerUp={onExpandResizePointerUp}
                        onPointerCancel={onExpandResizePointerUp}
                    />
                )}
                <div className="agent-sidebar-content" inert={showSettings || showAgentSettings || showCircleInfo || showSearchOptions} aria-busy={wallet === null || walletBusy}>
                <div className="agent-header">
                    <div>
                        <h3>
                            <i className="ph-fill ph-robot" /> Margit Agent
                        </h3>
                        {wallet?.address ? (
                            <p className="agent-wallet-meta">
                                <span className="agent-wallet-line">
                                    <i className="ph ph-wallet" aria-hidden="true" />
                                    <span className="agent-wallet-address-tooltip" tabIndex={0} aria-describedby="agent-wallet-balance-tooltip"><span className="agent-wallet-label">{wallet.mode === "oneclaw" ? "1Claw Agent Wallet" : wallet.mode === "circle" ? "Circle Agent Wallet" : wallet.mode === "personal" ? "My Agent Wallet" : "Demo Wallet"}</span>
                                    <span id="agent-wallet-balance-tooltip" role="tooltip" className="agent-wallet-tooltip">
                                        <span className="agent-wallet-tooltip-title">{wallet.mode === "oneclaw" ? "1Claw Agent Wallet" : wallet.mode === "circle" ? "Circle Agent Wallet" : wallet.mode === "personal" ? "My Agent Wallet" : "Demo Wallet"} Balance</span>
                                        <span className="agent-wallet-tooltip-coin"><img src="/icons/usdc.svg" alt="" />{Number(wallet.usdc ?? '0').toLocaleString(undefined, {maximumFractionDigits: 6})} USDC</span>
                                        <span className="agent-wallet-tooltip-coin"><img src="/icons/eurc.svg" alt="" />{Number(wallet.eurc ?? '0').toLocaleString(undefined, {maximumFractionDigits: 6})} EURC</span>
                                    </span>
                                    </span>
                                    <span className="agent-wallet-arrow" aria-hidden="true">→</span>
                                    <a
                                        className="agent-wallet-address-link graph-transaction-link"
                                        href={`https://testnet.arcscan.app/address/${wallet.address}?tab=txs`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <code>{shortenAddress(wallet.address)}</code>
                                    </a>
                                    <button
                                        type="button"
                                        className="agent-copy-address"
                                        aria-label="Copy wallet address"
                                        title="Copy address"
                                        onClick={() => {
                                            void navigator.clipboard.writeText(wallet.address!)
                                                .then(() => notify("Address copied", "success"))
                                                .catch(() => notify("Could not copy address", "error"));
                                        }}
                                    >
                                        <i className="ph ph-copy" aria-hidden="true" />
                                    </button>
                                </span>
                                <span className="agent-wallet-balances">
                                    <img src="/icons/usdc.svg" alt="" style={{width: '2rem', height: '2rem', flexShrink: 0}} />
                                    <span className="agent-wallet-label">x402 Gateway</span>
                                    <span className="agent-wallet-arrow" aria-hidden="true">→</span>
                                    {wallet.circle?.availableUsdc != null
                                        ? <a className="agent-wallet-address-link graph-transaction-link" href={`/api/agent/gateway-balance?address=${encodeURIComponent(wallet.address)}`} target="_blank" rel="noreferrer" title="Check this wallet’s balance with Circle Gateway">{Number(wallet.circle.availableUsdc).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USDC</a>
                                        : 'Unavailable'}
                                    <button
                                        type="button"
                                        className="agent-refresh-balances"
                                        aria-label="Refresh Gateway balance"
                                        title="Refresh Gateway balance"
                                        disabled={balancesRefreshing || walletBusy || sending}
                                        onClick={() => {
                                            void refreshBalances();
                                        }}
                                    >
                                        <i className={`ph ph-arrows-clockwise${balancesRefreshing ? " is-spinning" : ""}`} aria-hidden="true" />
                                    </button>
                                </span>

                            </p>
                        ) : wallet?.error ? (
                            <p className="hint">{wallet.error}</p>
                        ) : null}
                    </div>
                    <div
                        className="agent-header-actions"
                        ref={menuRoot}
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
                        }}
                    >
                        <button
                            ref={menuTrigger}
                            type="button"
                            className={`agent-icon-btn ${menuOpen || showCircleInfo || showSettings || showAgentSettings ? "active" : ""}`}
                            aria-label="Agent options"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((value) => !value)}
                        >
                            <i className="ph ph-dots-three-vertical" />
                        </button>
                        <button
                            type="button"
                            className={`agent-icon-btn${expanded ? " active" : ""}`}
                            aria-label={expanded ? "Collapse Panel" : "Expand Panel"}
                            title={expanded ? "Collapse Panel" : "Expand Panel"}
                            aria-pressed={expanded}
                            onClick={() => {
                                if (expanded) collapseExpanded();
                                else {
                                    setExpandClosing(false);
                                    setExpandEntering(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
                                    setExpanded(true);
                                }
                            }}
                        >
                            <i className={`ph ${expanded ? "ph-arrows-in-simple" : "ph-arrows-out-simple"}`} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className="agent-icon-btn"
                            aria-label="Close Agent"
                            title="Close Agent"
                            onClick={() => {
                                setMenuOpen(false);
                                setExpandClosing(false);
                                setExpanded(false);
                                onClose();
                            }}
                        >
                            <i className="ph ph-x" />
                        </button>
                        {menuOpen && (
                            <div
                                ref={menuPanel}
                                className="profile-menu agent-options-menu"
                                role="menu"
                                aria-label="Agent options"
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        event.preventDefault();
                                        setMenuOpen(false);
                                        menuTrigger.current?.focus();
                                    }
                                    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                                        event.preventDefault();
                                        const options = Array.from(menuPanel.current!.querySelectorAll<HTMLButtonElement>("button"));
                                        const index = options.indexOf(document.activeElement as HTMLButtonElement);
                                        options[
                                            event.key === "Home"
                                                ? 0
                                                : event.key === "End"
                                                  ? options.length - 1
                                                  : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length
                                        ]?.focus();
                                    }
                                }}
                            >
                                <button type="button" role="menuitem" className="profile-menu-item" disabled={sending} onClick={() => { setMenuOpen(false); setShowSearchOptions(true); }}><i className="ph ph-magnifying-glass" />Search options</button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="profile-menu-item"
                                    aria-pressed={showCircleInfo}
                                    onClick={() => {
                                        setShowCircleInfo((value) => !value);
                                        setShowSettings(false);
                                        setMenuOpen(false);
                                        menuTrigger.current?.focus();
                                    }}
                                >
                                    <i className="ph ph-info" aria-hidden="true" />
                                    <span>Circle Gateway</span>
                                </button>
                                <button type="button" role="menuitem" className="profile-menu-item" aria-pressed={showAgentSettings}
                                    onClick={() => { setPendingWalletMode(wallet?.mode ?? 'shared'); setShowAgentSettings(true); setShowCircleInfo(false); setShowSettings(false); setMenuOpen(false); setWalletError(null); }}>
                                    <i className="ph ph-sliders-horizontal" aria-hidden="true" />
                                    <span>Agent Settings</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="profile-menu-item"
                                    aria-pressed={showSettings}
                                    onClick={() => {
                                        setShowSettings((value) => !value);
                                        setShowCircleInfo(false);
                                        setMenuOpen(false);
                                        menuTrigger.current?.focus();
                                    }}
                                >
                                    <i className="ph ph-gear" aria-hidden="true" />
                                    <span>AI Model Settings</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="profile-menu-item"
                                    disabled={messages.length === 0 && !error}
                                    onClick={() => {
                                        setMessages([]);
                                        setError(null);
                                        setInput("");
                                        setMenuOpen(false);
                                        menuTrigger.current?.focus();
                                    }}
                                >
                                    <i className="ph ph-trash" aria-hidden="true" />
                                    <span>Clear Chat</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="agent-messages" ref={scrollRef}>
                    {messages.map((m, i) => (
                        <div key={i} className={`agent-message agent-message-${m.role}`}>
                            {m.role === "assistant" ? (
                                m.text.trim() && m.text.trim() !== "(no response)" ? (
                                    <div className="agent-markdown"><Markdown remarkPlugins={[remarkGfm, remarkExplorerLinks]} skipHtml components={{
                                        a: ({children, href}) => <a href={href} target={href?.startsWith('/') ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>,
                                        table: ({children}) => <div className="agent-table-wrap"><table>{children}</table></div>,
                                    }}>{m.text}</Markdown></div>
                                ) : m.purchase ? (
                                    <p>Purchase completed. Payment proof and repository access are shown below.</p>
                                ) : (
                                    <p className="hint">(no response)</p>
                                )
                            ) : <p>{m.text}</p>}
                            {m.purchase?.proof && <div className="agent-payment-proof">
                                <strong>Circle Gateway payment accepted</strong>
                                <span>{m.purchase.proof.amountUsdc} USDC · x402 · Arc testnet</span>
                                <span className="agent-payment-meta">Executed with {m.purchase.proof.sdk}</span>
                                <span className="agent-payment-meta">Signer: {m.purchase.proof.walletType} · {shortenAddress(m.purchase.proof.buyer)}</span>
                                <details><summary>Payment evidence</summary>
                                    <dl><dt>Payment fingerprint</dt><dd>{m.purchase.proof.paymentId}</dd>
                                        <dt>Buyer</dt><dd>{m.purchase.proof.buyer}</dd><dt>Seller</dt><dd>{m.purchase.proof.seller}</dd>
                                        <dt>Recorded</dt><dd>{m.purchase.proof.recordedAt}</dd>
                                        {m.purchase.proof.settlementReference && <><dt>Gateway reference</dt><dd>{m.purchase.proof.settlementReference}</dd></>}
                                    </dl>
                                </details>
                                {m.purchase.proof.settlementReference && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.purchase.proof.settlementReference) && <a className="agent-transaction-link" href={`https://gateway-api-testnet.circle.com/v1/x402/transfers/${m.purchase.proof.settlementReference}`} target="_blank" rel="noreferrer">Verify payment on Circle ↗</a>}
                                {!m.purchase.txHash && <p className="agent-payment-note">Gateway batches payments. Check Circle’s receipt for the current status and transaction hash when available.</p>}
                            </div>}
                            {m.purchase?.txHash && /^0x[0-9a-f]{64}$/i.test(m.purchase.txHash) && <a className="agent-transaction-link" href={`https://testnet.arcscan.app/tx/${m.purchase.txHash}`} target="_blank" rel="noreferrer">View transaction on Arc ↗</a>}
                            {m.purchase && (
                                <CloneResult cloneUrl={m.purchase.cloneUrl} repoFullName={m.purchase.repoFullName} />
                            )}
                        </div>
                    ))}
                    {sending && <p className="hint agent-typing" role="status"><span className="agent-thinking-spinner" aria-hidden="true" />Thinking…</p>}
                </div>
                {error && <p className="error agent-error">{error}</p>}
                {bazanticEnabled && <div className="agent-search-indicator">Bazantic search enabled</div>}
                <div className="agent-prompt-suggestions" aria-label="Suggested agent requests" data-lenis-prevent>
                    <div className="agent-prompt-spacer" aria-hidden="true" />
                    {agentSuggestions(path).map(([label, prompt]) => <button type="button" key={label} disabled={sending || walletBusy || circleSetup} onClick={() => {
                        setInput(prompt);
                        queueMicrotask(() => {
                            const field = inputRef.current;
                            if (!field) return;
                            field.focus();
                            field.setSelectionRange(0, 0);
                            field.scrollLeft = 0;
                        });
                    }}>{label}</button>)}
                    <div className="agent-prompt-spacer" aria-hidden="true" />
                </div>
                <form
                    className="agent-input-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        className="agent-input"
                        placeholder={voice.listening ? "Listening…" : "Ask the agent to find or buy a repo…"}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={sending || walletBusy || circleSetup}
                    />
                    {voice.supported && (
                        <button
                            type="button"
                            className={`btn-icon-plain agent-mic-btn ${voice.listening ? "listening" : ""}`}
                            onClick={voice.toggle}
                            aria-label={voice.listening ? "Stop voice input" : "Speak to the agent"}
                            title={voice.listening ? "Stop voice input" : "Speak to the agent"}
                        >
                            <MicIcon />
                        </button>
                    )}
                    <button type="submit" className="btn btn-anim btn-default btn-small btn-accent" disabled={sending || walletBusy || circleSetup || !input.trim()}>
                        Send
                    </button>
                </form>
                {notification && <Toast key={notification.id} message={notification.message} tone={notification.tone} onDismiss={dismissNotification} />}
                </div>
                {showCircleInfo && (!circleSetup || wallet?.mode === 'circle') && <div className="agent-settings-overlay" role="dialog" aria-modal="true" aria-label="Circle Gateway" onClick={e => {if(e.target === e.currentTarget) setShowCircleInfo(false);}} onKeyDown={e => {
                        if(e.key === 'Escape') {e.stopPropagation(); setShowCircleInfo(false); requestAnimationFrame(() => menuTrigger.current?.focus());}
                        if(e.key === 'Tab') {
                            const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], summary')).filter(el => el.getClientRects().length > 0);
                            const first = controls[0], last = controls[controls.length - 1];
                            if(e.shiftKey && document.activeElement === first) {e.preventDefault(); last?.focus();}
                            else if(!e.shiftKey && document.activeElement === last) {e.preventDefault(); first?.focus();}
                        }
                    }}>
                    <div id="agent-circle-info" className="agent-settings-panel open agent-circle-status">
                    <div className="agent-settings-header"><strong>Circle Gateway</strong><button autoFocus type="button" className="agent-icon-btn" aria-label="Close Gateway settings" onClick={() => {setShowCircleInfo(false); requestAnimationFrame(() => menuTrigger.current?.focus());}}><i className="ph ph-x" /></button></div>
                    <small>USDC · Arc testnet</small>
                    <span>{wallet?.circle?.availableUsdc !== undefined ? `${wallet.circle.availableUsdc} USDC available for x402` : wallet?.circle?.error ?? 'Checking Gateway balance…'}</span>
                    <small>{wallet?.mode === "oneclaw" ? "1Claw Agent Wallet" : wallet?.mode === "circle" ? "Circle Agent Wallet" : wallet?.mode === "personal" ? "My Agent Wallet" : "Demo Wallet"}</small>
                    <small>x402 purchases reduce this Gateway balance. The header shows funds held in the wallet.</small>
                    <p className="hint">{wallet?.mode === 'circle' ? 'Your Circle wallet funds Gateway through its signing account. Deposit to make that balance available for x402 purchases.' : (wallet?.mode === 'personal' || wallet?.mode === 'oneclaw') ? 'Your wallet and Gateway hold separate balances. Add testnet USDC to your wallet, then deposit the amount you want the agent to spend.' : 'This demo wallet and its Gateway balance are shared. Use My Agent Wallet or Circle Agent Wallet for your own funds.'}</p>
                    {wallet?.address && <>
                        <details className="agent-gateway-funding"><summary>{wallet.mode === 'shared' ? 'Refill demo balance' : 'Add funds'}</summary>
                        <small>Wallet funding address</small>
                        <code className="agent-wallet-address">{wallet.address}</code>
                        <button type="button" onClick={() => { void navigator.clipboard.writeText(wallet.address!).catch(() => setWalletError('Could not copy address')); }}>Copy wallet address</button>
                        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Fund with Circle faucet ↗</a>
                        <small>Select USDC and Arc Testnet, then paste this address.</small>
                        {wallet.mode === 'personal' && <small>This app stores your agent key encrypted. Access is tied to this browser; keep its cookies to return to this wallet.</small>}
                        <label htmlFor="agent-funding-amount">Amount (testnet USDC)</label>
                        <input id="agent-funding-amount" className="agent-input" inputMode="decimal" value={fundAmount} onChange={e => setFundAmount(e.target.value)} disabled={walletBusy || sending} />
                        {wallet.mode !== 'shared' && <button type="button" disabled={walletBusy || sending || !account} onClick={() => { void walletAction(async () => {
                            if (!/^\d+(\.\d{1,6})?$/.test(fundAmount) || Number(fundAmount) <= 0) throw new Error('Enter a positive amount.');
                            const receipt = await sendFunding(prepareTransaction({ client: thirdwebClient, chain: arcTestnet, to: wallet.address!, value: toWei(fundAmount) }));
                            setFundHash(receipt.transactionHash);
                        }); }}>Fund from connected wallet</button>}
                        {!account && wallet.mode !== 'shared' && <small>Connect a wallet in the navigation to transfer USDC, or use the faucet.</small>}
                        <button type="button" disabled={walletBusy || sending} onClick={() => { void walletAction(async () => {
                            const receipt = await depositAgentGateway(fundAmount, crypto.randomUUID());
                            setFundHash(receipt.depositTxHash);
                        }); }}>{walletBusy ? 'Working…' : 'Add to x402 Gateway'}</button>
                        <small>{wallet.mode === 'circle' ? 'Moves the entered amount from your Circle wallet to Gateway for x402 payments.' : 'Moves the entered amount from this wallet to Gateway. Leave some USDC in the wallet for gas.'}</small>
                        </details>
                        <button type="button" className="btn btn-anim btn-default btn-small btn-accent" disabled={walletBusy || balancesRefreshing} onClick={() => { void refreshBalances(); }}>{balancesRefreshing ? 'Refreshing…' : 'Refresh balances'}</button>
                    </>}
                    {fundHash && <a href={`https://testnet.arcscan.app/tx/${fundHash}`} target="_blank" rel="noreferrer">View funding transaction ↗</a>}
                    {walletError && <p role="alert">{walletError}</p>}
                    </div>
                </div>}
                {showAgentSettings && <div className="agent-settings-overlay" role="dialog" aria-modal="true" aria-label="Agent Settings"
                    onClick={e => { if (e.currentTarget === e.target) closeAgentSettings(); }}
                    onKeyDown={e => {
                        if (e.key === 'Escape') { e.stopPropagation(); closeAgentSettings(); }
                        if (e.key === 'Tab') {
                            const controls = Array.from(agentSettingsRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]') ?? []);
                            const first = controls[0], last = controls[controls.length - 1];
                            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
                        }
                    }}>
                    <div className="agent-settings-panel open" ref={agentSettingsRef}>
                        <div className="agent-settings-header">
                            <strong>Agent Settings</strong>
                            <button type="button" className="agent-icon-btn" aria-label="Close agent settings" onClick={closeAgentSettings}><i className="ph ph-x" /></button>
                        </div>
                        <select id="agent-wallet-select" aria-label="Agent wallet" className="agent-input" value={pendingWalletMode} disabled={sending || walletBusy}
                            onChange={e => setPendingWalletMode(e.target.value as 'shared' | 'personal' | 'circle' | 'oneclaw')}>
                            <option value="shared">Demo Wallet</option>
                            <option value="personal">My Agent Wallet</option>
                            <option value="circle">Circle Agent Wallet</option>
                            <option value="oneclaw">1Claw Agent Wallet</option>
                        </select>
                        <p className="hint">{pendingWalletMode === 'oneclaw' ? 'Use your 1Claw signer for Arc purchases and Gateway deposits.' : pendingWalletMode === 'circle' ? 'Connect your Circle account to use its agent wallet.' : pendingWalletMode === 'personal' ? 'A separate agent wallet for this browser, funded by you.' : 'Try the agent with the shared demo wallet on Arc testnet.'}</p>
                        {previewLoading && <p className="hint" role="status">Loading wallet…</p>}
                        {walletPreview?.address && <div className="agent-wallet-preview">
                            <span className="hint">Wallet address</span>
                            <p className="agent-wallet-preview-address">{walletPreview.address}</p>
                            <strong className="agent-wallet-preview-balances"><span><img src="/icons/usdc.svg" alt="" />{Number(walletPreview.usdc ?? 0).toFixed(2)} USDC</span><span><img src="/icons/eurc.svg" alt="" />{Number(walletPreview.eurc ?? 0).toFixed(2)} EURC</span></strong>
                        </div>}
                        {!circleSetup && pendingWalletMode !== 'oneclaw' && <button
                            type="button"
                            className="btn btn-anim btn-default btn-small btn-accent agent-circle-submit"
                            disabled={walletBusy || sending || previewLoading || !walletPreview?.address || !!walletError}
                            onClick={async () => {
                                setWalletBusy(true); setWalletError(null);
                                try {
                                    setWallet(await selectAgentWallet(pendingWalletMode));
                                    if (pendingWalletMode !== wallet?.mode) setMessages([]);
                                    closeAgentSettings();
                                } catch (error) { setWalletError(error instanceof Error ? error.message : 'Unable to select wallet'); }
                                finally { setWalletBusy(false); }
                            }}
                        >Confirm</button>}
                {circleSetup && wallet?.mode !== 'circle' && <div className="agent-circle-status">
                    <strong>Connect Circle Agent Wallet</strong>
                    <small>Use your Circle account to pay for x402 repositories on Arc testnet. Circle sends a verification code to your email. Chat is paused until you connect or select another wallet.</small>
                    <label htmlFor="circle-agent-email">Email</label>
                    <input id="circle-agent-email" className="agent-input" type="email" autoComplete="email" value={circleEmail} disabled={walletBusy || circleCodeSent} onChange={e => setCircleEmail(e.target.value)} />
                    {!circleCodeSent ? <>
                        <label className="agent-circle-consent"><input type="checkbox" checked={circleTerms} onChange={e => setCircleTerms(e.target.checked)} /><span>I accept Circle’s <a href="https://console.circle.com/legal/developer-terms" target="_blank" rel="noreferrer">Terms of Use</a> and <a href="https://www.circle.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>
                        <button type="button" className="btn btn-anim btn-default btn-small btn-accent agent-circle-submit" disabled={walletBusy || !circleTerms || !circleEmail.trim()} onClick={() => { void walletAction(async () => { await connectCircleAgent(circleEmail.trim(), circleTerms); setCircleCodeSent(true); }); }}>{walletBusy ? 'Connecting…' : 'Send verification code'}</button>
                    </> : <>
                        <label htmlFor="circle-agent-otp">Verification code</label>
                        <input id="circle-agent-otp" className="agent-input" autoComplete="one-time-code" value={circleOtp} onChange={e => setCircleOtp(e.target.value)} disabled={walletBusy} />
                        <button type="button" className="btn btn-anim btn-default btn-small btn-accent agent-circle-submit" disabled={walletBusy || !circleOtp.trim()} onClick={() => { void walletAction(async () => { setWallet(await verifyCircleAgent(circleOtp.trim())); setCircleOtp(''); setCircleCodeSent(false); setCircleSetup(false); setMessages([]); }); }}>{walletBusy ? 'Verifying…' : 'Connect wallet'}</button>
                        <button type="button" disabled={walletBusy} onClick={() => {setCircleCodeSent(false); setCircleOtp('');}}>Use another email or resend</button>
                    </>}
                    <small>Your Circle session is encrypted in Margit and tied to this browser. Connecting authorizes this chat to use the wallet for your requested actions.</small>
                    {walletError && <p role="alert">{walletError}</p>}
                </div>}
                    {pendingWalletMode === 'circle' && wallet?.mode === 'circle' && <button type="button" disabled={walletBusy || sending} onClick={() => { void walletAction(async () => {setWallet(await disconnectCircleAgent()); setCircleSetup(false); setMessages([]);}); }}>Disconnect Circle wallet</button>}
                        {!circleSetup && walletError && <p role="alert" className="error">{walletError}</p>}
                        {pendingWalletMode === 'oneclaw' && wallet?.mode === 'oneclaw' && <button type="button" disabled={sending || walletBusy} onClick={() => { void walletAction(async () => {
                            const response = await fetch('/api/agent/oneclaw/disconnect', {method:'POST'});
                            if (!response.ok) throw new Error('Could not disconnect 1Claw.');
                            setWallet(null); setMessages([]); setPendingWalletMode('shared');
                        }); }}>Disconnect 1Claw wallet</button>}
                        {pendingWalletMode === 'oneclaw' && wallet?.mode !== 'oneclaw' && <OneClawVerification disabled={sending || walletBusy} onConnected={() => { setMessages([]); void fetchAgentWallet().then(setWallet).catch(error => setWalletError(error instanceof Error ? error.message : 'Unable to refresh wallet')); closeAgentSettings(); }} />}
                    </div>
                </div>}
                {showSearchOptions && <div className="agent-settings-overlay" role="dialog" aria-modal="true" aria-label="Search options" onClick={event => { if (event.target === event.currentTarget) { setShowSearchOptions(false); menuTrigger.current?.focus(); } }} onKeyDown={event => {
                    if (event.key === 'Escape') { setShowSearchOptions(false); menuTrigger.current?.focus(); }
                    if (event.key === 'Tab') {
                        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, input'));
                        const next = controls[(controls.indexOf(document.activeElement as HTMLElement) + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
                        event.preventDefault(); next?.focus();
                    }
                }}><div className="agent-settings-panel open">
                    <div className="agent-settings-header"><strong>Search options</strong><button ref={searchClose} type="button" className="agent-icon-btn" aria-label="Close search options" onClick={() => { setShowSearchOptions(false); menuTrigger.current?.focus(); }}><i className="ph ph-x" /></button></div>
                    <label className="agent-bazantic-toggle"><span>Use Bazantic advisor</span><input type="checkbox" checked={bazanticEnabled} onChange={event => { const enabled = event.target.checked; setBazanticEnabled(enabled); try { localStorage.setItem('margit:bazantic-search', String(enabled)); } catch { /* Preference remains active for this session. */ } }} /></label>
                    <p className="hint">Compare repositories by project fit and budget. May take 20–60 seconds.</p>
                </div></div>}
                {showSettings && (
                    <div
                        className="agent-settings-overlay"
                        role="dialog"
                        aria-modal="true"
                        aria-label="AI Model Settings"
                        onClick={(event) => {
                            if (event.currentTarget === event.target) setShowSettings(false);
                        }}
                    >
                        <AgentSettingsPanel onSaved={setSettings} onClose={() => setShowSettings(false)} />
                    </div>
                )}
                {(wallet === null || walletBusy) && (
                    <div className="agent-loading-overlay" role="status" aria-live="polite" aria-label="Loading wallet">
                        <span className="agent-loading-spinner" aria-hidden="true" />
                    </div>
                )}
            </div>
        </aside>
        </>
    );
}
