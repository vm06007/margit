import { useEffect, useRef } from "react";
import "../styles/toast.css";

export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
    const toast = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // The popover top layer keeps feedback visible above native dialogs.
        toast.current?.showPopover?.();
        const timer = window.setTimeout(onDismiss, 8000);
        return () => window.clearTimeout(timer);
    }, [message, onDismiss]);
    return <div ref={toast} popover="manual" className="error-toast" role="alert">
        <i className="ph ph-warning-circle" aria-hidden="true" />
        <span>{message}</span>
        <button type="button" aria-label="Dismiss error" onClick={onDismiss}>×</button>
    </div>;
}
