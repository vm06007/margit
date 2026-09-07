import { HomeFooter } from './HomeFooter';
import { MarketplaceFooter } from './MarketplaceFooter';

export function SiteFooter({ variant }: { variant: 'home' | 'catalog' | 'works' }) {
  if(variant === 'home') return <HomeFooter />;
  return <MarketplaceFooter />;
}
