import { EcodeTermsPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('terms');

export default function TermsRoute() {
  return <EcodeTermsPage />;
}
