import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.marketplace);

export default function MarketplaceRoute() {
  return <MarketingStaticPage page={marketingPages.marketplace} />;
}
