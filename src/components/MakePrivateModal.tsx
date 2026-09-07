import { FireExplosionBurst } from "./FireExplosionBurst";
import { fireCelebrationBurst } from "./celebrationConfetti";
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { makeRepoPrivate, type Repo } from '../api';

export function MakePrivateModal({repo, onClose, onSuccess}: {repo: Repo; onClose: () => void; onSuccess: () => void}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<'confirm' | 'pending' | 'success'>('confirm');
    const clicks = useRef(0);
    const [replay, setReplay] = useState(0);
    const celebrate = () => {
        clicks.current += 1;
        if (clicks.current === 3) { clicks.current = 0; setReplay(value => value + 1); }
    };
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {dialog.current?.showModal()}, []);
    useEffect(() => {
        if (status !== 'success' || !canvas.current) return;
        const fire = confetti.create(canvas.current, {resize: true});
        fireCelebrationBurst(fire);
        return () => fire.reset();
    }, [status, replay]);
    const confirm = async () => {
        if (status !== 'confirm') return;
        setStatus('pending'); setError(null);
        try {await makeRepoPrivate(repo.fullName); setStatus('success'); onSuccess()}
        catch (e) {setError(e instanceof Error ? e.message : 'Could not change repository visibility.'); setStatus('confirm')}
    };
    return <dialog ref={dialog} className="revoke-dialog privacy-dialog" aria-labelledby="privacy-title" aria-describedby="privacy-description" onCancel={event => {event.preventDefault(); if(status !== 'pending') onClose()}}>
        <canvas ref={canvas} className="privacy-confetti" aria-hidden="true" />
        {status === 'success' ? <>
            <FireExplosionBurst replay={replay} className="privacy-confetti" />
            <button type="button" className="privacy-celebrate" aria-label="Replay confetti with three clicks" onClick={celebrate}>
                <i className="ph ph-check-circle privacy-icon" aria-hidden="true" />
            </button>
        </> : <i className="ph ph-lock-simple privacy-icon" aria-hidden="true" />}
        <h2 id="privacy-title">{status === 'success' ? 'Your repository is private!' : 'Make repository private?'}</h2>
        <p className="privacy-repo-name">{repo.fullName}</p>
        <p id="privacy-description">{status === 'success' ? 'GitHub confirmed the change. You can now find it under Private repos and list it for sale.' : 'This changes the repository’s visibility on GitHub. People without access will no longer be able to view or clone it. Existing public copies remain public.'}</p>
        {error && <p className="revoke-dialog-error" role="alert">{error}</p>}
        <div className="revoke-dialog-actions">
            {status === 'success' ? <button className="btn btn-default btn-accent" onClick={onClose}>Done</button> : <>
                <button autoFocus className="btn btn-default btn-outline" disabled={status === 'pending'} onClick={onClose}>Cancel</button>
                <button className="btn btn-default btn-accent" disabled={status === 'pending'} onClick={confirm}>{status === 'pending' ? 'Making private…' : 'Make private'}</button>
            </>}
        </div>
    </dialog>;
}
