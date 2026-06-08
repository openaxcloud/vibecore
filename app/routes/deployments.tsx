import { EcodeDeploymentsPage, makeEcodeCampaignMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeCampaignMeta('deployments');

export default function DeploymentsRoute() {
  return <EcodeDeploymentsPage />;
}
