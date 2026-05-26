import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.about);

export default function AboutRoute() {
  return <MarketingStaticPage page={marketingPages.about} />;
}
