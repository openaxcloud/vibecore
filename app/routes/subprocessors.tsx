import type { MetaFunction } from '@remix-run/cloudflare';

import Subprocessors from '~/components/marketing/ecode-exact/pages/Subprocessors';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Subprocessors — E-Code' },
  { name: 'description', content: 'E-Code subprocessors list.' },
];

export default function SubprocessorsRoute() {
  return <Subprocessors />;
}
