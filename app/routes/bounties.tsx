import { EcodeBountiesPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeExactProductMarketingPages';

export const meta = makeEcodeCampaignMeta('bounties');

export default function BountiesRoute() {
  return <EcodeBountiesPage />;
}
