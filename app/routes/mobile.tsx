import { EcodeMobilePage, makeEcodeProductMeta } from '~/components/marketing/EcodeExactProductMarketingPages';

export const meta = makeEcodeProductMeta('mobile-app');

export default function MobileRoute() {
  return <EcodeMobilePage />;
}
