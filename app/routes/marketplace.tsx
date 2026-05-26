import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.marketplace);

export default function MarketplacePage() {
  return <MarketingStaticPage page={marketingPages.marketplace} />;
}
