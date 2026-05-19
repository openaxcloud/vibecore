import {
  makeMarketingMeta,
  MarketingStaticPage,
  marketingCampaignPages,
} from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(marketingCampaignPages.bounties);

export default function BountiesRoute() {
  return <MarketingStaticPage page={marketingCampaignPages.bounties} />;
}
