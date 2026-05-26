import {
  makeMarketingMeta,
  MarketingStaticPage,
  marketingCampaignPages,
} from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingCampaignPages.teams);

export default function TeamRoute() {
  return <MarketingStaticPage page={marketingCampaignPages.teams} />;
}
