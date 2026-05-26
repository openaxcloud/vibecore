import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.tutorials);

export default function TutorialsRoute() {
  return <MarketingStaticPage page={marketingPages.tutorials} />;
}
