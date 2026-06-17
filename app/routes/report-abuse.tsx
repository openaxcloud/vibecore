import type { MetaFunction } from 'react-router';

import ReportAbuse from '~/components/marketing/ecode-exact/pages/ReportAbuse';

// In-repo SSR (main Remix app) rather than the prebuilt external marketing bundle.
export const meta: MetaFunction = () => [
  { title: 'Report Abuse — E-Code' },
  { name: 'description', content: 'Report abuse on E-Code.' },
];

export default function ReportAbuseRoute() {
  return <ReportAbuse />;
}
