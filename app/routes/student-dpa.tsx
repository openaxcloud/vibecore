import type { MetaFunction } from 'react-router';

import StudentDPA from '~/components/marketing/ecode-exact/pages/StudentDPA';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Student DPA — E-Code' },
  { name: 'description', content: 'E-Code Student Data Processing Agreement.' },
];

export default function StudentDpaRoute() {
  return <StudentDPA />;
}
