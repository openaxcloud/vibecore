import type { MetaFunction } from 'react-router';

import DPA from '~/components/marketing/ecode-exact/pages/DPA';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Data Processing Agreement — E-Code' },
  { name: 'description', content: 'E-Code Data Processing Agreement.' },
];

export default function DpaRoute() {
  return <DPA />;
}
