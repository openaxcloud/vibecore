import type { MetaFunction } from 'react-router';

import Enforcement from '~/components/marketing/ecode-exact/pages/Enforcement';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Enforcement Policy — E-Code' },
  { name: 'description', content: 'How E-Code responds to policy violations, and how to appeal.' },
];

export default function EnforcementRoute() {
  return <Enforcement />;
}
