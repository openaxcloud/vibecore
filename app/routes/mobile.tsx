import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.mobile);

export default function MobileRoute() {
  return <MarketingStaticPage page={marketingPages.mobile} />;
}
