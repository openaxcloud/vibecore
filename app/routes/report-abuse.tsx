import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['report-abuse']);

export default function ReportAbuseRoute() {
  return <MarketingStaticPage page={marketingPages['report-abuse']} />;
}
