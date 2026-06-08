import { EcodeLegalPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('legal');

export default function LegalRoute() {
  return <EcodeLegalPage />;
}
