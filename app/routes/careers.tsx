import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.careers);

export default function CareersRoute() {
  return <MarketingStaticPage page={marketingPages.careers} />;
}
