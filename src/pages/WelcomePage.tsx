import type { Listing, Me } from "../api";
import { Hero } from "../components/home/Hero";
import { DemoGallery } from "../components/home/DemoGallery";
import { RolesMarquee } from "../components/home/RolesMarquee";
import { DemoCards } from "../components/home/DemoCards";
import { ResponsivePromo } from "../components/home/ResponsivePromo";
import { PagesMarquee } from "../components/home/PagesMarquee";
import { FeaturesPromo } from "../components/home/FeaturesPromo";
import { FeatureCards } from "../components/home/FeatureCards";
import { ListingCTA } from "../components/home/ListingCTA";
import { RecentSection } from "../components/home/RecentSection";
import { AmbientVideo } from "../components/home/AmbientVideo";
import { FeedbackCTA } from "../components/home/FeedbackCTA";

/** The complete homepage reference, expressed as editable React sections. */
export function WelcomePage({ listings = null, listingsError = null }: { me?: Me; navigate?: (path: string) => void; listings?: Listing[] | null; listingsError?: string | null }) {
  return <>
    <Hero />
    <DemoGallery />
    <RolesMarquee />
    <DemoCards />
    <ResponsivePromo />
    <PagesMarquee />
    <FeaturesPromo />
    <FeatureCards />
    <ListingCTA />
    <RecentSection listings={listings} listingsError={listingsError} />
    <AmbientVideo />
    <FeedbackCTA />
  </>;
}
