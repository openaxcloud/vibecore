import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.dpa);

export default function DpaRoute() {
  return <MarketingStaticPage page={marketingPages.dpa} />;
}
