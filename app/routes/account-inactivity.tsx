import type { MetaFunction } from 'react-router';

import AccountInactivity from '~/components/marketing/ecode-exact/pages/AccountInactivity';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Account Inactivity Policy — E-Code' },
  { name: 'description', content: 'When inactive free accounts are removed, and how to stay active.' },
];

export default function AccountInactivityRoute() {
  return <AccountInactivity />;
}
