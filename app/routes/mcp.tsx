import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.mcp);

export default function McpRoute() {
  return <MarketingStaticPage page={marketingPages.mcp} />;
}
