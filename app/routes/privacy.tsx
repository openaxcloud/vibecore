import type { MetaFunction } from 'react-router';

import Privacy from '~/components/marketing/ecode-exact/pages/Privacy';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Privacy Policy — VibeCore' },
  { name: 'description', content: 'VibeCore Privacy Policy.' },
];

export default function PrivacyRoute() {
  return <Privacy />;
}
