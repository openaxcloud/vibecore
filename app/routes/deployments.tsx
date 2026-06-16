import { EcodeDeploymentsPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta = makeEcodeProductMeta('deployments');

export default function DeploymentsRoute() {
  return <EcodeDeploymentsPage />;
}
