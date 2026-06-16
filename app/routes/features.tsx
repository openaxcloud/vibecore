import { EcodeFeaturesPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta = makeEcodeProductMeta('ide');

export default function FeaturesRoute() {
  return <EcodeFeaturesPage />;
}
