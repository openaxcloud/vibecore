import type { MetaFunction } from 'react-router';
import PublicDeploymentsPage from '~/components/marketing/ecode-exact/pages/PublicDeploymentsPage';

/*
 * Dedicated React route for /marketing/deployments. It is MORE specific than the
 * catch-all `marketing.$slug` (which renders the pre-built ecode-static SPA
 * bundle that still ships the old purple theme), so RR7 routes this slug here
 * and serves the real, on-theme (E-Code orange) React page instead.
 */
export const meta: MetaFunction = () => [
  { title: 'Deployments — E-Code' },
  {
    name: 'description',
    content:
      'Ship production-grade apps straight from your E-Code workspace — one-click deploys, live logs and status.',
  },
];

export default function MarketingDeploymentsRoute() {
  return <PublicDeploymentsPage />;
}
