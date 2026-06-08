import { EcodeSubprocessorsPage, makeEcodeLegalMeta } from '~/components/marketing/EcodeExactLegalPages';

export const meta = makeEcodeLegalMeta('subprocessors');

export default function SubprocessorsRoute() {
  return <EcodeSubprocessorsPage />;
}
