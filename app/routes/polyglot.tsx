import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.polyglot);

export default function PolyglotRoute() {
  return <MarketingStaticPage page={marketingPages.polyglot} />;
}
