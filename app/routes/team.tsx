import { EcodeTeamsPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeExactProductMarketingPages';

export const meta = makeEcodeCampaignMeta('teams');

export default function TeamRoute() {
  return <EcodeTeamsPage />;
}
