import { useEffect, useRef } from 'react';

/** Match the reference's character stagger over top 80% → top 20% of the viewport. */
export function RevealText({ text, underline }: { text: string; underline?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    const trigger = root?.parentElement;
    const scroller = root?.closest<HTMLElement>('.site-page-wrap');
    if (!root || !trigger || !scroller) return;
    const chars = [...root.querySelectorAll<HTMLElement>('.site-reveal-char')];
    const accent = root.querySelector<HTMLElement>('.site-reveal-accent');
    const accentChars = [...(accent?.querySelectorAll<HTMLElement>('.site-reveal-char') ?? [])];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const duration = 0.5;
    const stagger = 0.1;
    const total = duration + stagger * (chars.length - 1);
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = trigger.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const height = scroller.clientHeight;
      const progress = reducedMotion.matches ? 1 : Math.max(0, Math.min(1, (height * 0.8 - top) / (height * 0.6)));
      chars.forEach((char, index) => {
        const local = Math.max(0, Math.min(1, (progress * total - index * stagger) / duration));
        // GSAP's default power1.out easing, matching the original reveal.
        char.style.opacity = String(0.2 + 0.8 * (1 - (1 - local) ** 2));
      });
      if (accent && accentChars.length) {
        const opacity = accentChars.reduce((sum, char) => sum + Number(char.style.opacity), 0) / accentChars.length;
        accent.style.setProperty('--underline-opacity', String(opacity));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(trigger);
    scroller.addEventListener('scroll', schedule, { passive: true });
    reducedMotion.addEventListener('change', schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', schedule);
      reducedMotion.removeEventListener('change', schedule);
    };
  }, [text, underline]);

  const renderWords = (value: string) => value.split(/(\s+)/).map((word, i) => /^\s+$/.test(word) ? word :
      <span aria-hidden="true" key={i} className="site-reveal-word">
        {Array.from(word).map((char, j) => <span key={j} className="site-reveal-char">{char}</span>)}
      </span>);
  const index = underline ? text.indexOf(underline) : -1;
  return <span ref={ref} className="site-reveal-text" aria-label={text}>
    {index >= 0 && underline ? <>
      {renderWords(text.slice(0, index))}
      <span className="site-reveal-accent" aria-hidden="true">{renderWords(underline)}</span>
      {renderWords(text.slice(index + underline.length))}
    </> : renderWords(text)}
  </span>;
}
