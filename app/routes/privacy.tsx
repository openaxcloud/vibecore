import { EcodePrivacyPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('privacy');

export default function PrivacyRoute() {
  return <EcodePrivacyPage />;
}
