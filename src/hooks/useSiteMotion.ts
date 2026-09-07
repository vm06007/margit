import { useEffect } from 'react';

/** React owns page lifecycle; no legacy page scripts mutate React's DOM. */
export function useSiteMotion(path: string) {
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.site-page-wrap');
    scroller?.scrollTo({ top: 0 });
    document.title = path === '/' ? 'Margit — Sell your work on GitHub' : path === '/catalog' ? 'Margit — Catalog' : path === '/works' ? 'Margit — My Repos' : 'Margit';
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(entries => {
      for(const entry of entries) {
        if(entry.isIntersecting) {
          entry.target.animate([{ opacity: .2, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'ease-out' });
          observer.unobserve(entry.target);
        }
      }
    }, { root: scroller, threshold: .08 });
    document.querySelectorAll('.site-app .anim-uni-in-up, .site-app .animate-card-3').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [path]);
}
