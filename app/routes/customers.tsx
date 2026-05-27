import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.customers);

export default function CustomersRoute() {
  return <MarketingStaticPage page={marketingPages.customers} />;
}
