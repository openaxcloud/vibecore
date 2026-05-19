import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['ai-documentation']);

export default function AiDocumentationRoute() {
  return <MarketingStaticPage page={marketingPages['ai-documentation']} />;
}
