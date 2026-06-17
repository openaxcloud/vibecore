import type { MetaFunction } from 'react-router';

import ReportAbuse from '~/components/marketing/ecode-exact/pages/ReportAbuse';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Report Abuse — VibeCore' },
  { name: 'description', content: 'Report abuse on VibeCore.' },
];

export default function ReportAbuseRoute() {
  return <ReportAbuse />;
}
