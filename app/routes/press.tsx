import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.press);

export default function PressRoute() {
  return <MarketingStaticPage page={marketingPages.press} />;
}
