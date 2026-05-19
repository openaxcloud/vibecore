import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.partners);

export default function PartnersRoute() {
  return <MarketingStaticPage page={marketingPages.partners} />;
}
