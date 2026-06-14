import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.explore);

export default function ExploreRoute() {
  return <MarketingStaticPage page={marketingPages.explore} />;
}
