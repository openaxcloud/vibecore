import type { MetaFunction } from 'react-router';

import Terms from '~/components/marketing/ecode-exact/pages/Terms';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Terms of Service — E-Code' },
  { name: 'description', content: 'E-Code Terms of Service.' },
];

export default function TermsRoute() {
  return <Terms />;
}
