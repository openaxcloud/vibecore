import { EcodeSecurityPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('security');

export default function SecurityRoute() {
  return <EcodeSecurityPage />;
}
