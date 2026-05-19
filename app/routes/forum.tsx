import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.forum);

export default function ForumRoute() {
  return <MarketingStaticPage page={marketingPages.forum} />;
}
