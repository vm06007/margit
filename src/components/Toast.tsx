import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/toast.css";

export function Toast({ message, tone = "error", onDismiss }: { message: string; tone?: "error" | "success"; onDismiss: () => void }) {
    const toast = useRef<HTMLDivElement>(null);
    const [closing, setClosing] = useState(false);
    const close = useCallback(() => setClosing(true), []);
    useEffect(() => {
        // The popover top layer keeps feedback visible above native dialogs.
        toast.current?.showPopover?.();
        const timer = window.setTimeout(close, tone === "success" ? 3000 : 8000);
        return () => window.clearTimeout(timer);
    }, [message, tone, close]);
    useEffect(() => {
        if (!closing) return;
        const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
        const timer = window.setTimeout(onDismiss, delay);
        return () => window.clearTimeout(timer);
    }, [closing, onDismiss]);
    return <div ref={toast} popover="manual" className={`app-toast app-toast-${tone}${closing ? " app-toast-closing" : ""}`} role={tone === "error" ? "alert" : "status"}>
        <i className={tone === "error" ? "ph ph-warning-circle" : "ph ph-check-circle"} aria-hidden="true" />
        <span>{message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={close}>×</button>
    </div>;
}
