import { makeMarketingMeta, MarketingStaticPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(solutionPages.enterprise);

export default function EnterpriseRoute() {
  return <MarketingStaticPage page={solutionPages.enterprise} />;
}
