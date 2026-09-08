import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { fireCelebrationBurst } from "./celebrationConfetti";
import type { Listing } from "../api";

export function ListingSuccess({ listing, updated, onClose, onView }: {
    listing: Listing;
    updated: boolean;
    onClose: () => void;
    onView: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        dialog.current?.showModal();
        if (!canvas.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const fire = confetti.create(canvas.current, { resize: true });
        fireCelebrationBurst(fire);
        return () => fire.reset();
    }, []);
    return <dialog ref={dialog} className="revoke-dialog privacy-dialog" aria-labelledby="listing-success-title" aria-describedby="listing-success-description" onCancel={event => { event.preventDefault(); onClose(); }}>
        <canvas ref={canvas} className="privacy-confetti" aria-hidden="true" />
        <i className="ph ph-check-circle privacy-icon" aria-hidden="true" />
        <h2 id="listing-success-title">{updated ? "Listing updated!" : "Your repository is listed!"}</h2>
        <p className="privacy-repo-name">{listing.repoFullName}</p>
        <p id="listing-success-description">{updated ? "Your changes are saved. Take a look at your updated listing." : "Your repository is ready for buyers. View your listing to see how it looks."}</p>
        <div className="revoke-dialog-actions">
            <button type="button" className="btn btn-default btn-outline" onClick={onClose}>Done</button>
            <button type="button" className="btn btn-default btn-accent" autoFocus onClick={onView}>View listing ↗</button>
        </div>
    </dialog>;
}
