import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['student-dpa']);

export default function StudentDpaRoute() {
  return <MarketingStaticPage page={marketingPages['student-dpa']} />;
}
