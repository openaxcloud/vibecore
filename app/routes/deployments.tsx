import { EcodeDeploymentsPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeExactProductMarketingPages';

export const meta = makeEcodeCampaignMeta('deployments');

export default function DeploymentsRoute() {
  return <EcodeDeploymentsPage />;
}
