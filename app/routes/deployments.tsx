import {
  makeMarketingMeta,
  MarketingStaticPage,
  marketingCampaignPages,
} from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingCampaignPages.deployments);

export default function DeploymentsRoute() {
  return <MarketingStaticPage page={marketingCampaignPages.deployments} />;
}
