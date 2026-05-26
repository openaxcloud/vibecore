import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.product);

export default function ProductRoute() {
  return <MarketingStaticPage page={marketingPages.product} />;
}
