import { EcodeDpaPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('dpa');

export default function DpaRoute() {
  return <EcodeDpaPage />;
}
