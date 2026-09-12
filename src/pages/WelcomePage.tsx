import { AgentIntegration } from "../components/home/AgentIntegration";
import type { Listing, Me } from "../api";
import { Hero } from "../components/home/Hero";
import { DemoGallery } from "../components/home/DemoGallery";
import { RolesMarquee } from "../components/home/RolesMarquee";
import { ResponsivePromo } from "../components/home/ResponsivePromo";
import { FeatureCards } from "../components/home/FeatureCards";
import { ListingCTA } from "../components/home/ListingCTA";
import { RecentSection } from "../components/home/RecentSection";
import { AmbientVideo } from "../components/home/AmbientVideo";

/** The complete homepage reference, expressed as editable React sections. */
export function WelcomePage({ listings = null, listingsError = null, onRetryListings, listingsLoading = false }: { onRetryListings: () => void; listingsLoading?: boolean; me?: Me; navigate?: (path: string) => void; listings?: Listing[] | null; listingsError?: string | null }) {
  return <>
    <Hero />
    <DemoGallery />
    <RolesMarquee />
    <AgentIntegration />
    <FeatureCards />
    <ResponsivePromo />
    <RecentSection onRetry={onRetryListings} loading={listingsLoading} listings={listings} listingsError={listingsError} />
    <ListingCTA />
    <AmbientVideo />
  </>;
}
