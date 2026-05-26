import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.accessibility);

export default function AccessibilityRoute() {
  return <MarketingStaticPage page={marketingPages.accessibility} />;
}
