import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.demo);

export default function DemoRoute() {
  return <MarketingStaticPage page={marketingPages.demo} />;
}
