import type { MetaFunction } from 'react-router';

import LandingOptimized from '~/components/marketing/ecode-exact/pages/LandingOptimized';
import { socialMetaTags } from '~/utils/social-meta';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'E-Code — Build, ship and scale apps with AI' },
  {
    name: 'description',
    content:
      'E-Code is where you create software with AI agents: build full-stack apps from a prompt, collaborate in real time, and deploy to production. Starter (free), Core, Pro and Enterprise plans.',
  },
  ...socialMetaTags({ title: 'E-Code', description: 'Build, ship and scale apps with AI agents.' }),
];

export default function IndexRoute() {
  return <LandingOptimized />;
}
