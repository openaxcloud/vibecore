import { EcodeAiAgentPage, makeEcodeProductMeta } from '~/components/marketing/EcodeExactProductMarketingPages';

export const meta = makeEcodeProductMeta('ai-agent');

export default function AiAgentRoute() {
  return <EcodeAiAgentPage />;
}
