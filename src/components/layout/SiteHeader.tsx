import { useEffect, useRef, useState } from 'react';
import type { Me } from '../../api';
import { ProfileDropdown } from '../NavBar';
import { Logo } from './Logo';
import { MenuContent } from './MenuContent';

export function SiteHeader({ home, me, onLogout, agentOpen, onToggleAgent, path }: {
  home: boolean; me: Me; onLogout: () => void; agentOpen: boolean; onToggleAgent: () => void; path: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('template.theme') || 'light');
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    document.documentElement.setAttribute('color-scheme', theme);
    localStorage.setItem('template.theme', theme);
  }, [theme]);
  useEffect(() => {
    if(!menuOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    menuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if(event.key === 'Escape') setMenuOpen(false);
      if(event.key === 'Tab') {
        const sidebarNodes = !home && agentOpen
          ? [...document.querySelectorAll<HTMLElement>('.agent-sidebar.open a[href], .agent-sidebar.open button:not(:disabled), .agent-sidebar.open input:not(:disabled), .agent-sidebar.open textarea:not(:disabled), .agent-sidebar.open select:not(:disabled)')].filter(node => node.getClientRects().length > 0)
          : [];
        const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []), toggleRef.current, ...sidebarNodes].filter((n): n is HTMLElement => !!n);
        const index = nodes.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        nodes[(index + (event.shiftKey ? nodes.length - 1 : 1)) % nodes.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [menuOpen, agentOpen, home]);
  // A keyed header in the layout closes its menu on navigation without DOM scripts.
  return <>
    {menuOpen && <div ref={menuRef} className="site-menu mxd-nav__wrap" role="dialog" aria-modal={!agentOpen || home} aria-label="Main navigation" onClick={(event) => {
      if((event.target as HTMLElement).closest('a')) setMenuOpen(false);
      if((event.target as HTMLElement).classList.contains('mxd-menu__base')) setMenuOpen(false);
    }}><MenuContent /></div>}
    <header id="header" className={`mxd-header site-header ${home ? 'site-header-home' : ''} ${menuOpen ? 'site-menu-open' : ''}`} data-page={path}>
      <div className="mxd-header__logo"><a href="/" className="mxd-logo"><Logo /><span className="mxd-logo__text" style={{ fontSize: '4rem' }}>Margit</span></a></div>
      <div className="mxd-header__controls">
        <button className="mxd-color-switcher" type="button" role="switch" aria-label="light/dark mode" aria-checked={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><i className={theme === 'dark' ? 'ph ph-sun' : 'ph ph-moon-stars'} /></button>
        {home ? <a className="btn btn-anim btn-default btn-mobile-icon btn-outline slide-right" href="/catalog" aria-label="Browse Catalog"><span className="btn-caption">Catalog</span><i className="ph-bold ph-shopping-cart-simple" /></a> : <>
          <button type="button" className="btn btn-anim btn-default btn-mobile-icon btn-outline slide-right-up" aria-label="Agent" aria-expanded={agentOpen} onClick={onToggleAgent}><span className="btn-caption">Agent</span><i className="ph-fill ph-robot" /></button>
          <ProfileDropdown me={me} onLogout={onLogout} />
        </>}
        <button ref={toggleRef} type="button" className={`header-hamburger-proxy ${menuOpen ? 'is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><div className="hamburger__base" /><div className="hamburger__line" /><div className="hamburger__line" /></button>
      </div>
    </header>
  </>;
}
