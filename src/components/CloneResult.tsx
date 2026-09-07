import { useState } from "react";
import { downloadZip } from "../api";
import { CopyIcon, DownloadIcon } from "./icons";

/** Shown after a successful purchase — the clone URL plus copy/download shortcuts. */
export function CloneResult({ cloneUrl, repoFullName }: { cloneUrl: string; repoFullName: string }) {
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const repoName = repoFullName.split("/")[1] ?? repoFullName;

    const copyCommand = async () => {
        await navigator.clipboard.writeText(`git clone ${cloneUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const download = async () => {
        setDownloadError(null);
        setDownloading(true);
        try {
            await downloadZip(cloneUrl, repoName);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="buy-result">
            <p className="hint">Purchased — clone URL:</p>
            <code>{cloneUrl}</code>
            <div className="clone-actions">
                <button type="button" className="btn btn-primary btn-small" disabled={downloading} onClick={download}>
                    <DownloadIcon /> {downloading ? "Downloading…" : "Download ZIP"}
                </button>
                <button type="button" className="btn btn-outline btn-small" onClick={copyCommand}>
                    <CopyIcon /> {copied ? "Copied!" : "Copy Command"}
                </button>
            </div>
            {downloadError && <p className="error">{downloadError}</p>}
        </div>
    );
}
