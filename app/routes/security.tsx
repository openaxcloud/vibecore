import type { MetaFunction } from 'react-router';

import Security from '~/components/marketing/ecode-exact/pages/Security';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Security — E-Code' },
  { name: 'description', content: 'E-Code security practices and vulnerability disclosure.' },
];

export default function SecurityRoute() {
  return <Security />;
}
