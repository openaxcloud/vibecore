import { EcodeFeaturesPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeProductMeta('ide');

export default function FeaturesRoute() {
  return <EcodeFeaturesPage />;
}
