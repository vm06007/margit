import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareTransaction, toWei } from "thirdweb";
import { thirdwebClient, arcTestnet } from "../lib/thirdweb";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useRef, useState } from "react";
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
    open,
    onClose,
    onListingChange,
}: {
    open: boolean;
    onClose: () => void;
    onListingChange?: (change: AgentListingChange) => void;
}) {
    const [wallet, setWallet] = useState<AgentWallet | null>(null);
    const [, setSettings] = useState<AgentSettings | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const account = useActiveAccount();
    const { mutateAsync: sendFunding } = useSendTransaction();
    const [walletBusy, setWalletBusy] = useState(false);
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
    const [showCircleInfo, setShowCircleInfo] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [expandClosing, setExpandClosing] = useState(false);
    const expandOverlay = expanded || expandClosing;
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
        }
    }, [open]);

    const collapseExpanded = useCallback(() => {
        if (!expanded || expandClosing) return;
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
    }, [expandClosing]);

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

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, sending]);

    const send = async (prompt = input) => {
        const text = prompt.trim();
        if (!text || sending || walletBusy) return;
        setInput("");
        setError(null);
        setMessages((prev) => [...prev, { role: "user", text }]);
        setSending(true);
        try {
            const res = await sendAgentMessage(text);
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
                className={`agent-sidebar-inner${wallet === null || walletBusy ? " is-loading" : ""}${showSettings ? " is-settings-open" : ""}`}
                onAnimationEnd={(event) => {
                    if (event.currentTarget === event.target) finishExpandClose();
                }}
            >
                <div className="agent-sidebar-content" aria-busy={wallet === null || walletBusy}>
                <div className="agent-header">
                    <div>
                        <h3>
                            <i className="ph-fill ph-robot" /> Margit Agent
                        </h3>
                        {wallet?.address ? (
                            <p className="agent-wallet-meta">
                                <span className="agent-wallet-line">
                                    <i className="ph ph-wallet" aria-hidden="true" />
                                    <span className="agent-wallet-label">{wallet.mode === "personal" ? "Your agent wallet" : "Demo Wallet"}</span>
                                    <span className="agent-wallet-arrow" aria-hidden="true">→</span>
                                    <a
                                        className="agent-wallet-address-link"
                                        href={`https://testnet.arcscan.app/address/${wallet.address}?tab=txs`}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="View on Arc Explorer"
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
                                <br />
                                {Number(wallet.usdc ?? "0").toFixed(2)} USDC ·{" "}
                                {Number(wallet.eurc ?? "0").toFixed(2)} EURC
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
                            className={`agent-icon-btn ${menuOpen || showCircleInfo || showSettings ? "active" : ""}`}
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
                <div className="agent-wallet-choice" aria-label="Agent wallet">
                    <button type="button" disabled={sending || walletBusy} aria-pressed={wallet?.mode !== 'personal'} onClick={() => { void walletAction(async () => { setWallet(await selectAgentWallet('shared')); setMessages([]); }); }}>Demo Wallet</button>
                    <button type="button" disabled={sending || walletBusy} aria-pressed={wallet?.mode === 'personal'} onClick={() => { setShowCircleInfo(true); void walletAction(async () => { setWallet(await selectAgentWallet('personal')); setMessages([]); }); }}>My agent wallet</button>
                </div>
                {showCircleInfo && <div id="agent-circle-info" className="agent-circle-status">
                    <strong>Circle Gateway · Arc testnet</strong>
                    <span>{wallet?.circle?.availableUsdc !== undefined ? `${wallet.circle.availableUsdc} USDC available for x402` : wallet?.circle?.error ?? 'Checking Gateway balance…'}</span>
                    <small>{wallet?.mode === "personal" ? "Personal agent wallet" : "Demo Wallet"} · Circle Nanopayments SDK</small>
                    <small>x402 purchases reduce this Gateway balance. The header shows funds held in the wallet.</small>
                    {wallet?.address && <>
                        <code className="agent-wallet-address">{wallet.address}</code>
                        <button type="button" onClick={() => { void navigator.clipboard.writeText(wallet.address!).catch(() => setWalletError('Could not copy address')); }}>Copy wallet address</button>
                        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Fund with Circle faucet ↗</a>
                        <small>Select USDC and Arc Testnet, then paste this address.</small>
                        {wallet.mode === 'personal' && <small>This app stores your agent key encrypted. Access is tied to this browser; keep its cookies to return to this wallet.</small>}
                        <label htmlFor="agent-funding-amount">Amount (testnet USDC)</label>
                        <input id="agent-funding-amount" className="agent-input" inputMode="decimal" value={fundAmount} onChange={e => setFundAmount(e.target.value)} disabled={walletBusy || sending} />
                        <button type="button" disabled={walletBusy || sending || !account} onClick={() => { void walletAction(async () => {
                            if (!/^\d+(\.\d{1,6})?$/.test(fundAmount) || Number(fundAmount) <= 0) throw new Error('Enter a positive amount.');
                            const receipt = await sendFunding(prepareTransaction({ client: thirdwebClient, chain: arcTestnet, to: wallet.address!, value: toWei(fundAmount) }));
                            setFundHash(receipt.transactionHash);
                        }); }}>Fund from connected wallet</button>
                        {!account && <small>Connect a wallet in the navigation to transfer USDC, or use the faucet.</small>}
                        <button type="button" disabled={walletBusy || sending} onClick={() => { void walletAction(async () => {
                            const receipt = await depositAgentGateway(fundAmount, crypto.randomUUID());
                            setFundHash(receipt.depositTxHash);
                        }); }}>{walletBusy ? 'Working…' : 'Add to x402 Gateway'}</button>
                        <small>Moves this amount from the selected wallet into Gateway. Leave some USDC in the wallet for gas. You can also send /gateway 1 in chat to deposit 1 USDC.</small>
                        <button type="button" disabled={walletBusy} onClick={() => { void walletAction(async () => {}); }}>Refresh balances</button>
                    </>}
                    {fundHash && <a href={`https://testnet.arcscan.app/tx/${fundHash}`} target="_blank" rel="noreferrer">View funding transaction ↗</a>}
                    {walletError && <p role="alert">{walletError}</p>}
                    <a href="/proofs/circle-arc-testnet.json" target="_blank" rel="noreferrer">View recorded test evidence ↗</a>
                </div>}
                <div className="agent-messages" ref={scrollRef}>
                    {messages.map((m, i) => (
                        <div key={i} className={`agent-message agent-message-${m.role}`}>
                            {m.role === "assistant" ? <div className="agent-markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
                                a: ({children, href}) => <a href={href} target={href?.startsWith('/') ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>,
                                table: ({children}) => <div className="agent-table-wrap"><table>{children}</table></div>,
                            }}>{m.text}</Markdown></div> : <p>{m.text}</p>}
                            {m.purchase?.proof && <div className="agent-payment-proof">
                                <strong>Circle Gateway payment accepted</strong>
                                <span>{m.purchase.proof.amountUsdc} USDC · x402 · Arc testnet</span>
                                <small>Executed with {m.purchase.proof.sdk}</small>
                                <small>Signer: {m.purchase.proof.walletType} · {shortenAddress(m.purchase.proof.buyer)}</small>
                                <details><summary>Payment evidence</summary>
                                    <dl><dt>Payment fingerprint</dt><dd>{m.purchase.proof.paymentId}</dd>
                                        <dt>Buyer</dt><dd>{m.purchase.proof.buyer}</dd><dt>Seller</dt><dd>{m.purchase.proof.seller}</dd>
                                        <dt>Recorded</dt><dd>{m.purchase.proof.recordedAt}</dd>
                                        {m.purchase.proof.settlementReference && <><dt>Gateway reference</dt><dd>{m.purchase.proof.settlementReference}</dd></>}
                                    </dl>
                                </details>
                                {m.purchase.proof.settlementReference && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.purchase.proof.settlementReference) && <a className="agent-transaction-link" href={`https://gateway-api-testnet.circle.com/v1/x402/transfers/${m.purchase.proof.settlementReference}`} target="_blank" rel="noreferrer">Verify payment on Circle ↗</a>}
                                {!m.purchase.txHash && <small>Gateway batches payments. Check Circle’s receipt for the current status and transaction hash when available.</small>}
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
                <div className="agent-prompt-suggestions" aria-label="Suggested agent requests" data-lenis-prevent>
                    <div className="agent-prompt-spacer" aria-hidden="true" />
                    {[
                        ['Find repositories', 'Find repositories accepting x402 for at most 0.10 USDC. Compare their language, price, and delivery terms. Do not buy yet.'],
                        ['Check Circle balance', 'Check the demo wallet and Circle Gateway balances on Arc testnet. Explain whether an x402 purchase is ready.'],
                        ['Try Circle x402', 'Choose the cheapest available x402-enabled repository costing at most 0.10 USDC. Explain its delivery terms, buy it with Circle Gateway x402 on Arc testnet, and show the returned payment proof. Do not use contract checkout.'],
                        ['Latest listings', 'Show the most recently listed repositories from the catalog. Include language, price, checkout options, and when each was listed. Do not buy yet.'],
                        ['Most popular', 'Using on-chain purchase activity from The Graph when available, rank the most popular repositories by completed purchases. Join those results with live catalog details (price, language, access terms). If Graph data is unavailable, say so and fall back to the catalog. Do not buy yet.'],
                        ['Recently sold', 'Using The Graph purchase receipts when available, list the repositories sold most recently on Arc. Include buyer/seller if public in the indexer, amount, token, and matching catalog listing details. Do not buy yet.'],
                        ['Top sellers', 'Using The Graph when available, identify the top sellers by purchase count or volume, then show their current live listings from the catalog. Do not buy yet.'],
                        ['Trending under $0.10', 'Find repositories priced at most $0.10 that look active from recent Graph purchase activity when available. Prefer x402-capable listings and compare language, price, and delivery terms. Do not buy yet.'],
                    ].map(([label, prompt]) => <button type="button" key={label} disabled={sending || walletBusy} onClick={() => {
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
                        disabled={sending}
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
                    <button type="submit" className="btn btn-anim btn-default btn-small btn-accent" disabled={sending || !input.trim()}>
                        Send
                    </button>
                </form>
                {notification && <Toast key={notification.id} message={notification.message} tone={notification.tone} onDismiss={dismissNotification} />}
                </div>
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
