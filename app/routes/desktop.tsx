import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.desktop);

export default function DesktopRoute() {
  return <MarketingStaticPage page={marketingPages.desktop} />;
}
