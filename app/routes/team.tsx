import { EcodeTeamsPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta = makeEcodeProductMeta('teams');

export default function TeamRoute() {
  return <EcodeTeamsPage />;
}
