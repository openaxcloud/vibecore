import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.blog);

export default function BlogRoute() {
  return <MarketingStaticPage page={marketingPages.blog} />;
}
