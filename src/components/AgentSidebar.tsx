import { useEffect, useRef, useState } from "react";
import { shortenAddress } from "thirdweb/utils";
import {
    fetchAgentModels,
    fetchAgentSettings,
    fetchAgentWallet,
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
import { CloseIcon, GearIcon, MicIcon, RobotIcon } from "./icons";

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
            const next = await updateAgentSettings({ model, apiKey });
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
        <div className="agent-settings">
            <label className="agent-settings-label" htmlFor="agent-model-input">
                Model
            </label>
            <input
                id="agent-model-input"
                className="input"
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
                className="input"
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
            <button type="button" className="btn btn-primary btn-small" disabled={saving} onClick={save}>
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
    const [settings, setSettings] = useState<AgentSettings | null>(null);
    const [showSettings, setShowSettings] = useState(false);
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
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, sending]);

    const send = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setInput("");
        setError(null);
        setMessages((prev) => [...prev, { role: "user", text }]);
        setSending(true);
        try {
            const res = await sendAgentMessage(text);
            setMessages((prev) => [...prev, { role: "assistant", text: res.reply, purchase: res.purchase }]);
            if (res.purchase) {
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
        <aside className={`agent-sidebar ${open ? "open" : ""}`}>
            <div className="agent-sidebar-inner">
                <div className="agent-header">
                    <div>
                        <h3>
                            <RobotIcon /> margit agent
                        </h3>
                        {wallet?.address ? (
                            <p className="hint">
                                {shortenAddress(wallet.address)} · {Number(wallet.usdc ?? "0").toFixed(2)} USDC ·{" "}
                                {Number(wallet.eurc ?? "0").toFixed(2)} EURC
                            </p>
                        ) : wallet?.error ? (
                            <p className="hint">{wallet.error}</p>
                        ) : (
                            <p className="hint">Loading wallet…</p>
                        )}
                        {settings && (
                            <p className="hint agent-model-line">
                                Model: {settings.model} (
                                {settings.hasCustomKey
                                    ? "your key"
                                    : settings.hasSharedDefault
                                      ? "shared key"
                                      : "no key configured"}
                                )
                            </p>
                        )}
                    </div>
                    <div className="agent-header-actions">
                        <button
                            type="button"
                            className={`btn-icon-plain ${showSettings ? "active" : ""}`}
                            onClick={() => setShowSettings((v) => !v)}
                            aria-label="Agent settings"
                            title="Configure model / API key"
                        >
                            <GearIcon />
                        </button>
                        <button type="button" className="btn-icon-plain" onClick={onClose} aria-label="Close agent">
                            <CloseIcon />
                        </button>
                    </div>
                </div>
                {showSettings && <AgentSettingsPanel onSaved={setSettings} />}
                <div className="agent-messages" ref={scrollRef}>
                    {messages.length === 0 && (
                        <p className="hint agent-empty">
                            Ask me to find a repo, or tell me to buy one — I have my own funded wallet and can pay
                            for it directly.
                        </p>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`agent-message agent-message-${m.role}`}>
                            <p>{m.text}</p>
                            {m.purchase && (
                                <CloneResult cloneUrl={m.purchase.cloneUrl} repoFullName={m.purchase.repoFullName} />
                            )}
                        </div>
                    ))}
                    {sending && <p className="hint agent-typing">Thinking…</p>}
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
                        className="input"
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
                    <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                        Send
                    </button>
                </form>
            </div>
        </aside>
    );
}
