import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { downloadZip } from "../api";
import { CopyIcon, DownloadIcon } from "./icons";
import { Toast } from "./Toast";

/** Shown after a successful purchase — the clone URL plus copy/download shortcuts. */
export function CloneResult({ cloneUrl, repoFullName, accessTerms }: { cloneUrl: string; repoFullName: string; accessTerms?: ReactNode }) {
    const singleDownload = cloneUrl.endsWith("download.zip");
    const [downloaded, setDownloaded] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [notification, setNotification] = useState<{ message: string; tone: "error" | "success"; id: number } | null>(null);
    const dismissNotification = useCallback(() => setNotification(null), []);
    const notify = (message: string, tone: "error" | "success") => setNotification(previous => ({ message, tone, id: (previous?.id ?? 0) + 1 }));
    const repoName = repoFullName.split("/")[1] ?? repoFullName;

    const copyCommand = async () => {
        try {
            await navigator.clipboard.writeText(`git clone ${cloneUrl}`);
            notify("Command copied", "success");
        } catch {
            notify("Could not copy the command. Please select and copy it manually.", "error");
        }
    };

    const download = async () => {
        setNotification(null);
        setDownloading(true);
        try {
            await downloadZip(cloneUrl, repoName);
            setDownloaded(true);
        } catch (err) {
            notify(err instanceof Error ? err.message : "Download failed", "error");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="buy-result">
            {!singleDownload && <div className="clone-code">
                <div className="clone-code-label"><span>Terminal</span><button type="button" className="clone-header-copy" onClick={copyCommand} aria-label="Copy clone command" title="Copy command"><CopyIcon /></button></div>
                <pre tabIndex={0} aria-label="Git clone command"><code>git clone {cloneUrl}</code></pre>
            </div>}
            {accessTerms}
            <div className="clone-actions">
                <button type="button" className="btn btn-primary btn-small" disabled={downloading || (singleDownload && downloaded)} onClick={download}>
                    <DownloadIcon /> {downloading ? "Downloading…" : singleDownload && downloaded ? "Downloaded" : "Download ZIP"}
                </button>
                {!singleDownload && <button type="button" className="btn btn-outline btn-small" onClick={copyCommand}>
                    <CopyIcon /> Copy Command
                </button>}
            </div>
            {notification && <Toast key={notification.id} message={notification.message} tone={notification.tone} onDismiss={dismissNotification} />}
        </div>
    );
}
