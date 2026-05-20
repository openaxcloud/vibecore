import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['theme-validation']);

export default function ThemeValidationPage() {
  return <MarketingStaticPage page={marketingPages['theme-validation']} />;
}
