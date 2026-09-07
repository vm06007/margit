import { fireCelebrationBurst } from "./celebrationConfetti";
import { accessPolicyLabel } from "../../shared/accessPolicy";
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import type { Listing } from "../api";
import { arcTestnet } from "../lib/thirdweb";
import { FireExplosionBurst } from "./FireExplosionBurst";
import { CloneResult } from "./CloneResult";

export interface PurchaseReceipt {
    cloneUrl: string;
    checkoutContract?: string;
    expiresAt?: string;
    transactionHash?: string;
    currency: string;
    method: "wallet" | "x402";
}

export function PurchaseSuccess({ receipt, listing }: { receipt: PurchaseReceipt; listing: Listing }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const reopen = useRef<HTMLButtonElement>(null);
    const replayConfetti = useRef<(() => void) | null>(null);
    const celebrationClicks = useRef(0);
    const [explosionReplay, setExplosionReplay] = useState(0);
    const celebrate = () => {
        celebrationClicks.current += 1;
        if (celebrationClicks.current === 3) {
            celebrationClicks.current = 0;
            replayConfetti.current?.();
            setExplosionReplay(value => value + 1);
        }
    };
    useEffect(() => {
        dialog.current?.showModal();
        if (!canvas.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        // Vitenix's burn explosion, rendered in the dialog's top layer.
        const fire = confetti.create(canvas.current, { resize: true });
        const replay = () => {
            fireCelebrationBurst(fire);
        };
        replayConfetti.current = replay;
        replay();
        return () => { replayConfetti.current = null; fire.reset(); };
    }, []);
    const close = () => { dialog.current?.close(); reopen.current?.focus(); };
    const hash = receipt.transactionHash && /^0x[\da-f]{64}$/i.test(receipt.transactionHash) ? receipt.transactionHash : undefined;
    const explorer = arcTestnet.blockExplorers?.[0]?.url;
    const shortHash = hash ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : undefined;
    return <>
        <i className="ph ph-check-circle purchase-success-icon" aria-hidden="true" />
        <h3>You’ve purchased this</h3>
        <p className="hint">{receipt.cloneUrl.endsWith("download.zip") ? "Your repository is ready to download." : "Your repository is ready to clone or download."}</p>
        <button ref={reopen} type="button" className="btn btn-primary repository-connect-wallet" onClick={() => dialog.current?.showModal()}>View purchase details</button>
        <a className="btn btn-outline repository-connect-wallet" href="/portfolio" style={{marginTop:"1rem"}}>My Portfolio</a>
        <dialog ref={dialog} className="purchase-success-dialog" aria-labelledby="purchase-success-title" onCancel={event => {event.preventDefault(); close()}}>
            <canvas ref={canvas} className="purchase-confetti" aria-hidden="true" />
            <FireExplosionBurst replay={explosionReplay} />
            <button type="button" className="purchase-success-close" aria-label="Close purchase details" onClick={close}>×</button>
            <header className="purchase-success-header">
                <button type="button" className="purchase-celebrate" aria-label="Replay confetti with three clicks" onClick={celebrate}>
                    <i className="ph ph-check-circle purchase-success-icon" aria-hidden="true" />
                </button>
                <h2 id="purchase-success-title">You’ve purchased this!</h2>
            </header>
            <div className="purchase-success-columns">
                <section className="purchase-summary" aria-labelledby="purchase-summary-title">
                    <h3 id="purchase-summary-title">Purchase details</h3>
                    <dl className="purchase-receipt">
                        <div><dt>Repository</dt><dd>{listing.repoFullName}</dd></div>
                        {receipt.expiresAt && <div><dt>Expires</dt><dd>{new Date(receipt.expiresAt).toLocaleString()}</dd></div>}
                        <div><dt>Amount</dt><dd>{listing.price.replace("$", "")} {receipt.currency}</dd></div>
                        <div><dt>Payment</dt><dd>{receipt.method === "wallet" ? (receipt.checkoutContract ? "Margit checkout" : "Direct transfer") : "x402 / Circle Gateway"} · Arc testnet</dd></div>
                        <div><dt>Transaction</dt><dd>{hash ? (explorer ? <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" title={hash}>{shortHash} ↗</a> : <span title={hash}>{shortHash}</span>) : "No transaction hash was returned for this settlement."}</dd></div>
                    </dl>
                </section>
                <section className="purchase-access" aria-labelledby="purchase-access-title">
                    <h3 id="purchase-access-title">Get your code</h3>
                    <p className="hint">{receipt.cloneUrl.endsWith("download.zip") ? "Download your repository as a ZIP. This link allows one download start." : "Run this command in your terminal to clone the repository, or download a ZIP before access expires."}</p>
                    <CloneResult cloneUrl={receipt.cloneUrl} repoFullName={listing.repoFullName} accessTerms={
                        <dl className="purchase-receipt purchase-access-terms">
                            <div><dt>Access terms</dt><dd>{accessPolicyLabel(listing.accessPolicy)}</dd></div>
                        </dl>
                    } />
                </section>
            </div>
        </dialog>
    </>;
}
