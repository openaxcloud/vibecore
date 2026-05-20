import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.demo);

export default function DemoPage() {
  return <MarketingStaticPage page={marketingPages.demo} />;
}
