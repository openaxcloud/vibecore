import { makeMarketingMeta, MarketingStaticPage, marketingPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingPages['commercial-agreement']);

export default function CommercialAgreementRoute() {
  return <MarketingStaticPage page={marketingPages['commercial-agreement']} />;
}
