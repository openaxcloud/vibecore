import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.subprocessors);

export default function SubprocessorsRoute() {
  return <MarketingStaticPage page={marketingPages.subprocessors} />;
}
