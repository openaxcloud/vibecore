import { EcodeBountiesPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeCampaignMeta('bounties');

export default function BountiesRoute() {
  return <EcodeBountiesPage />;
}
