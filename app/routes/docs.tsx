import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.docs);

export default function DocsRoute() {
  return <MarketingStaticPage page={marketingPages.docs} />;
}
