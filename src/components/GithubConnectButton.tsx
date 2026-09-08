import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export function GithubConnectButton({ className, label = "Connect With GitHub" }: { className: string; label?: string }) {
    const [connecting, setConnecting] = useState(false);

    useEffect(() => {
        const reset = () => setConnecting(false);
        window.addEventListener("pageshow", reset);
        return () => window.removeEventListener("pageshow", reset);
    }, []);

    return (
        <a
            className={`${className} github-connect-button`}
            href="/api/auth/github/login"
            aria-label={connecting ? "Connecting with GitHub" : label}
            aria-busy={connecting}
            aria-disabled={connecting}
            onClick={(event) => {
                if (connecting) {
                    event.preventDefault();
                    return;
                }
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                flushSync(() => setConnecting(true));
            }}
        >
            <span className="btn-caption">{connecting ? "Connecting…" : label}</span>
            {connecting
                ? <i className="github-connect-loading" aria-hidden="true"><span className="github-connect-spinner" /></i>
                : <i className="ph-bold ph-github-logo" aria-hidden="true" />}
        </a>
    );
}
