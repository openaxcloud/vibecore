import { EcodeMobilePage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeProductMeta('mobile-app');

export default function MobileRoute() {
  return <EcodeMobilePage />;
}
