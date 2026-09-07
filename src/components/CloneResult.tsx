import { useState } from "react";
import { downloadZip } from "../api";
import { CopyIcon, DownloadIcon } from "./icons";

/** Shown after a successful purchase — the clone URL plus copy/download shortcuts. */
export function CloneResult({ cloneUrl, repoFullName }: { cloneUrl: string; repoFullName: string }) {
    const singleDownload = cloneUrl.endsWith("download.zip");
    const [downloaded, setDownloaded] = useState(false);
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
            setDownloaded(true);
        } catch (err) {
            setDownloadError(err instanceof Error ? err.message : "Download failed");
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="buy-result">
            {!singleDownload && <div className="clone-code">
                <div className="clone-code-label">Terminal</div>
                <pre tabIndex={0} aria-label="Git clone command"><code>git clone {cloneUrl}</code></pre>
            </div>}
            <div className="clone-actions">
                <button type="button" className="btn btn-primary btn-small" disabled={downloading || (singleDownload && downloaded)} onClick={download}>
                    <DownloadIcon /> {downloading ? "Downloading…" : singleDownload && downloaded ? "Downloaded" : "Download ZIP"}
                </button>
                {!singleDownload && <button type="button" className="btn btn-outline btn-small" onClick={copyCommand}>
                    <CopyIcon /> {copied ? "Copied!" : "Copy Command"}
                </button>}
            </div>
            {downloadError && <p className="error">{downloadError}</p>}
        </div>
    );
}
