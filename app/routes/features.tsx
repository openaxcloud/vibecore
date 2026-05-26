import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.features);

export default function FeaturesRoute() {
  return <MarketingStaticPage page={marketingPages.features} />;
}
