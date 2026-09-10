import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const slides = [
  ["0", "There's exponential growth of code on GitHub..."],
  ["7", "... since now agents store their work in repos"],
  ["8", "Adding an extra access layer to GitHub"],
  ["1", "Better than traditional marketplaces"],
  ["2", "Monetize more than code"],
  ["6", "Keep building on GitHub. Sell on Margit."],
  ["3", "Access a codebase that keeps evolving"],
  ["5", "Choose how you sell access"],
] as const;

export function DemoPreview({ initialIndex, onClose }: { initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const [expanded, setExpanded] = useState(false);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const moving = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [screen, title] = slides[index];
  const step = async (direction: number) => {
    if (moving.current) return;
    moving.current = true;
    const next = (index + direction + slides.length) % slides.length;
    const image = new Image();
    image.src = `/main_pics/${slides[next][0]}.webp`;
    try { await image.decode(); } catch { /* Let the image element expose a failed load. */ }
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setDirection(direction);
    setOutgoing(animate ? index : null);
    setIndex(next);
    if (!animate) moving.current = false;
  };

  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    // Fetch original-quality previews ahead of navigation, without re-encoding.
    slides.forEach(([screen]) => {
      const image = new Image();
      image.src = `/main_pics/${screen}.webp`;
    });
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialog} className={`demo-preview${expanded ? " is-expanded" : ""}`} aria-labelledby={titleId}
    onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
    <div className="demo-preview-panel">
      <header className="demo-preview-header">
        <h2 id={titleId} aria-live="polite">{title}</h2>
        <div className="demo-preview-actions">
          <button type="button" className="demo-preview-control" aria-label={expanded ? "Restore preview size" : "Expand preview to browser window"} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
            <i aria-hidden="true" className={`ph ${expanded ? "ph-corners-in" : "ph-corners-out"}`} />
          </button>
          <button type="button" className="demo-preview-control" aria-label="Close preview" onClick={onClose} autoFocus>×</button>
        </div>
      </header>
      <div className={`demo-preview-image${outgoing !== null ? " is-sliding" : ""}`} style={{ "--slide-direction": direction } as React.CSSProperties}>
        {outgoing !== null && <img className="demo-preview-outgoing" src={`/main_pics/${slides[outgoing][0]}.webp`} alt="" aria-hidden="true" />}
        <img key={screen} className="demo-preview-current" src={`/main_pics/${screen}.webp`} alt={`${title} preview`}
          onAnimationEnd={() => { setOutgoing(null); moving.current = false; }} />
      </div>
      <footer className="demo-preview-footer">
        <button type="button" className="demo-preview-control" aria-label="Previous preview" onClick={() => step(-1)}>←</button>
        <span aria-live="polite">{index + 1} / {slides.length}</span>
        <button type="button" className="demo-preview-control" aria-label="Next preview" onClick={() => step(1)}>→</button>
      </footer>
    </div>
  </dialog>, document.body);
}
