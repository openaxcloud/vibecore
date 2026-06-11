import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['theme-validation']);

export default function ThemeValidationRoute() {
  return <MarketingStaticPage page={marketingPages['theme-validation']} />;
}
