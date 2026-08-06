import type { MetaFunction } from 'react-router';

import Privacy from '~/components/marketing/ecode-exact/pages/Privacy';
import { socialMetaTags } from '~/utils/social-meta';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Privacy Policy — E-Code' },
  { name: 'description', content: 'E-Code Privacy Policy.' },
  ...socialMetaTags({ path: '/privacy', title: 'E-Code Privacy Policy', description: 'How E-Code collects, uses and protects your personal data.' }),
];

export default function PrivacyRoute() {
  return <Privacy />;
}
