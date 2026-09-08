import { useEffect, useRef } from 'react';

export function PublisherFeeInfo({ owed, threshold, paused, recovering, onClose, onProceed }: { owed: string; threshold: string; paused: boolean; recovering: boolean; onClose: () => void; onProceed: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => element?.close();
    }, []);

    return <dialog ref={dialog} className="revoke-dialog portfolio-fee-dialog" aria-labelledby="publisher-fee-title" onCancel={event => { event.preventDefault(); onClose(); }}>
        <button type="button" autoFocus className="portfolio-fee-close" aria-label="Close payment details" onClick={onClose}><i className="ph ph-x" aria-hidden="true" /></button>
        <h2 id="publisher-fee-title">Platform fees</h2>
        <p className="portfolio-fee-balance">Unpaid fees: {owed} USDC</p>
        <p>Margit charges sellers 0.5% per sale. Contract checkout collects this automatically. Circle x402 pays sellers directly, so those fees accumulate on your seller account for later payment.</p>
        <h3>When fees reach {threshold} USDC</h3>
        <p>{paused ? 'Your x402 sales are currently paused.' : 'New x402 purchases pause across all your listings.'} Creating another agent does not reset the balance: fees belong to your GitHub seller account.</p>
        <p>You can still create listings and accept contract checkout payments. Existing purchases remain accessible under their original delivery terms.</p>
        <h3>Paying your fees</h3>
        <p>Proceeding requests a payment from your connected wallet on Arc testnet. Network gas is separate. Once payment is confirmed and unpaid fees fall below {threshold} USDC, x402 sales resume automatically.</p>
        {recovering && <p>A previous payment is pending confirmation. We’ll check its receipt without sending another payment.</p>}
        <div className="revoke-dialog-actions">
            <button type="button" className="btn btn-primary" onClick={onProceed}>{recovering ? 'Confirm previous payment' : `Pay ${owed} USDC fees`}</button>
        </div>
    </dialog>;
}
