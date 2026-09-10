import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function DemoVideo({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    const player = video.current;
    element?.showModal();
    void player?.play().catch(() => { /* Native controls allow playback if autoplay is blocked. */ });
    return () => {
      player?.pause();
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="demo-preview demo-video-modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="demo-preview-panel">
      <header className="demo-preview-header">
        <h2 id={titleId}>Watch Demo</h2>
        <button type="button" className="demo-preview-control" aria-label="Close demo video" autoFocus onClick={onClose}>×</button>
      </header>
      <video ref={video} src="/videos/demo.mp4" controls autoPlay playsInline preload="metadata" onError={() => setFailed(true)} />
      {failed && <p className="demo-video-error" role="alert">The demo video is unavailable. Please try again later.</p>}
    </div>
  </dialog>, document.body);
}
