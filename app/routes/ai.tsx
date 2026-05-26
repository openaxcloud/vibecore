import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.ai);

export default function AiRoute() {
  return <MarketingStaticPage page={marketingPages.ai} />;
}
