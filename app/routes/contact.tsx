import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages.contact);

export default function ContactRoute() {
  return <MarketingStaticPage page={marketingPages.contact} />;
}
