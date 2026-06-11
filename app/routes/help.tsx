import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['help-center']);

export default function HelpAliasRoute() {
  return <MarketingStaticPage page={marketingPages['help-center']} />;
}
