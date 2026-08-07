import type { MetaFunction } from 'react-router';
import PublicDeploymentsPage from '~/components/marketing/ecode-exact/pages/PublicDeploymentsPage';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';

/*
 * Dedicated React route for /marketing/deployments. It is MORE specific than the
 * catch-all `marketing.$slug` (which renders the pre-built ecode-static SPA
 * bundle that still ships the old purple theme), so RR7 routes this slug here
 * and serves the real, on-theme (E-Code orange) React page instead.
 */
export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getRemainingRouteShellsCopy(rootData?.language);

  return buildRemainingRouteMeta({
    title: copy['remainingRoutes.deployments.title'],
    description: copy['remainingRoutes.deployments.description'],
    path: '/marketing/deployments',
    language: rootData?.language,
  });
};

export default function MarketingDeploymentsRoute() {
  return <PublicDeploymentsPage />;
}
