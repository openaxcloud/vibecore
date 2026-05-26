import {
  makeMarketingMeta,
  MarketingStaticPage,
  marketingCampaignPages,
} from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingCampaignPages.teams);

export default function CollaborationRoute() {
  return <MarketingStaticPage page={{ ...marketingCampaignPages.teams, title: 'Collaboration' }} />;
}
