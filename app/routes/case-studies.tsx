import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['case-studies']);

export default function CaseStudiesRoute() {
  return <MarketingStaticPage page={marketingPages['case-studies']} />;
}
