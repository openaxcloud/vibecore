import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.languages);

export default function TemplateLanguagesRoute() {
  return <MarketingStaticPage page={marketingPages.languages} />;
}
