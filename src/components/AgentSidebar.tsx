import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareTransaction, toWei } from "thirdweb";
import { thirdwebClient, arcTestnet } from "../lib/thirdweb";
import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
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

export function AgentSettingsPanel({ onSaved }: { onSaved: (settings: AgentSettings) => void }) {
    const [models, setModels] = useState<AgentModel[] | null>(null);
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [model, setModel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAgentModels()
            .then(setModels)
            .catch(() => setModels([]));
        fetchAgentSettings()
            .then((s) => {
                setSettings(s);
                setModel(s.model);
            })
            .catch(() => undefined);
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
            <label className="agent-settings-label" htmlFor="agent-model-input">
                Model
            </label>
            <input
                id="agent-model-input"
                className="agent-input"
                list="agent-model-options"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="openrouter/free"
            />
            <datalist id="agent-model-options">
                {(models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                        {m.name}
                        {m.free ? " (free)" : ""}
                    </option>
                ))}
            </datalist>

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
                    get a free key at openrouter.ai/keys
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
    const [showCircleInfo, setShowCircleInfo] = useState(false);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const voice = useVoiceInput(setInput);

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
        <aside id="agent-sidebar" className={`agent-sidebar ${open ? "open" : ""}`} inert={!open}>
            <div className="agent-sidebar-inner">
                <div className="agent-header">
                    <div>
                        <h3>
                            <i className="ph-fill ph-robot" /> margit agent
                        </h3>
                        {wallet?.address ? (
                            <p className="hint">
                                {wallet.mode === "personal" ? "Your agent wallet" : "Shared demo wallet"} · {shortenAddress(wallet.address)}<br />
                                {Number(wallet.usdc ?? "0").toFixed(2)} USDC ·{" "}
                                {Number(wallet.eurc ?? "0").toFixed(2)} EURC
                            </p>
                        ) : wallet?.error ? (
                            <p className="hint">{wallet.error}</p>
                        ) : (
                            <p className="hint">Loading wallet…</p>
                        )}
                    </div>
                    <div className="agent-header-actions">
                        <button type="button" className={`agent-icon-btn ${showCircleInfo ? "active" : ""}`} onClick={() => setShowCircleInfo((value) => !value)} aria-label="Circle Gateway information" aria-expanded={showCircleInfo} aria-controls="agent-circle-info">
                            <i className="ph ph-info" />
                        </button>
<button type="button" className="agent-icon-btn" onClick={onClose} aria-label="Close agent">
                            <i className="ph ph-x" />
                        </button>
<button
                            type="button"
                            className={`agent-icon-btn ${showSettings ? "active" : ""}`}
                            onClick={() => setShowSettings((v) => !v)}
                            aria-label="Agent settings"
                            title="Configure model / API key"
                        >
                            <i className="ph ph-gear" />
                        </button>
                    </div>
                </div>
                <div className="agent-wallet-choice" aria-label="Agent wallet">
                    <button type="button" disabled={sending || walletBusy} aria-pressed={wallet?.mode !== 'personal'} onClick={() => { void walletAction(async () => { setWallet(await selectAgentWallet('shared')); setMessages([]); }); }}>Shared wallet</button>
                    <button type="button" disabled={sending || walletBusy} aria-pressed={wallet?.mode === 'personal'} onClick={() => { setShowCircleInfo(true); void walletAction(async () => { setWallet(await selectAgentWallet('personal')); setMessages([]); }); }}>My agent wallet</button>
                </div>
                {showCircleInfo && <div id="agent-circle-info" className="agent-circle-status">
                    <strong>Circle Gateway · Arc testnet</strong>
                    <span>{wallet?.circle?.availableUsdc !== undefined ? `${wallet.circle.availableUsdc} USDC available for x402` : wallet?.circle?.error ?? 'Checking Gateway balance…'}</span>
                    <small>{wallet?.mode === "personal" ? "Personal agent wallet" : "Shared demo wallet"} · Circle Nanopayments SDK</small>
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
                {showSettings && <AgentSettingsPanel onSaved={setSettings} />}
                <div className="agent-prompt-suggestions" aria-label="Suggested agent requests">
                    {[
                        ['Find repositories', 'Find repositories accepting x402 for at most 0.10 USDC. Compare their language, price, and delivery terms. Do not buy yet.'],
                        ['Check Circle balance', 'Check the demo wallet and Circle Gateway balances on Arc testnet. Explain whether an x402 purchase is ready.'],
                        ['Try Circle x402', 'Choose the cheapest available x402-enabled repository costing at most 0.10 USDC. Explain its delivery terms, buy it with Circle Gateway x402 on Arc testnet, and show the returned payment proof. Do not use contract checkout.'],
                    ].map(([label, prompt]) => <button type="button" key={label} disabled={sending || walletBusy} onClick={() => { void send(prompt); }}>{label}</button>)}
                </div>
                <div className="agent-messages" ref={scrollRef}>
                    {messages.map((m, i) => (
                        <div key={i} className={`agent-message agent-message-${m.role}`}>
                            {m.role === "assistant" ? <div className="agent-markdown"><Markdown skipHtml components={{a: ({children, href}) => <a href={href} target={href?.startsWith('/') ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>}}>{m.text}</Markdown></div> : <p>{m.text}</p>}
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
                <form
                    className="agent-input-row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                >
                    <input
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
            </div>
        </aside>
    );
}
