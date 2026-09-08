import { HomeFooter } from './HomeFooter';

export function SiteFooter({ variant }: { variant: 'home' | 'catalog' | 'works' }) {
    if (variant === 'home') return <HomeFooter />;
    return null;
}
