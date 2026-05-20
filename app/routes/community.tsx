import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.community);

export default function CommunityPage() {
  return <MarketingStaticPage page={marketingPages.community} />;
}
