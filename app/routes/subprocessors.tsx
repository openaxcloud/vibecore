import type { MetaFunction } from 'react-router';

import Subprocessors from '~/components/marketing/ecode-exact/pages/Subprocessors';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Subprocessors — VibeCore' },
  { name: 'description', content: 'VibeCore subprocessors list.' },
];

export default function SubprocessorsRoute() {
  return <Subprocessors />;
}
