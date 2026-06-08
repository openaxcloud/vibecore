import { EcodeAiAgentPage, makeEcodeProductMeta } from '~/components/marketing/EcodeProductMarketingPages';

export const meta = makeEcodeProductMeta('ai-agent');

export default function AiAgentRoute() {
  return <EcodeAiAgentPage />;
}
