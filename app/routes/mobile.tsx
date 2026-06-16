import { EcodeMobilePage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta = makeEcodeProductMeta('mobile-app');

export default function MobileRoute() {
  return <EcodeMobilePage />;
}
