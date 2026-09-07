import { useEffect, useState } from 'react';

export function BackToTop({ path }: { path: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.site-page-wrap');
    const update = () => setVisible((page?.scrollTop ?? 0) > 400);
    update();
    page?.addEventListener('scroll', update, { passive: true });
    return () => page?.removeEventListener('scroll', update);
  }, [path]);
  return <button type="button" className={`btn btn-to-top site-to-top ${visible ? 'visible' : ''}`} aria-label="Back to top" tabIndex={visible ? 0 : -1} onClick={() => document.querySelector('.site-page-wrap')?.scrollTo({ top: 0, behavior: 'smooth' })}><i className="ph ph-arrow-up" /></button>;
}
