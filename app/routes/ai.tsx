import { EcodeAiPlatformPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta = makeEcodeProductMeta('ai-platform');

export default function AiRoute() {
  return <EcodeAiPlatformPage />;
}
