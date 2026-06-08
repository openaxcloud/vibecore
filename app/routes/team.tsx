import { EcodeTeamsPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeCampaignMeta('teams');

export default function TeamRoute() {
  return <EcodeTeamsPage />;
}
