import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.search);

export default function SearchPage() {
  return <MarketingStaticPage page={marketingPages.search} />;
}
