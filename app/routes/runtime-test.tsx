import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['runtime-test']);

export default function RuntimeTestPage() {
  return <MarketingStaticPage page={marketingPages['runtime-test']} />;
}
