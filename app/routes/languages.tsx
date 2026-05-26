import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.languages);

export default function LanguagesRoute() {
  return <MarketingStaticPage page={marketingPages.languages} />;
}
