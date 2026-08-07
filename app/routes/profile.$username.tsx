import type { MetaFunction } from 'react-router';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';

/*
 * bolt.diy-heritage compatibility route for /profile/:username public
 * profiles. E-Code has NO public-profile backend: the User model has no
 * `username` field (packages/database/prisma/schema.prisma) and services/api
 * exposes no profile-by-username endpoint. This route previously rendered a
 * templated "surface" page (createProfileSurfacePage) that echoed the URL
 * param back as if it were a real profile — fake data on a public URL.
 *
 * Until a real public-profile data source exists, serve an honest HTTP 404
 * thrown from the loader (true 404 status, not a soft-404 — see
 * surface-not-found-status.spec.ts). The file stays so the
 * /profile/:username pattern in ecode-route-coverage.spec.ts remains backed
 * by a route module.
 */
export const loader = () => {
  throw new Response(null, { status: 404 });
};

export const meta: MetaFunction = ({ matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getRemainingRouteShellsCopy(rootData?.language);

  return buildRemainingRouteMeta({
    title: copy['remainingRoutes.profileNotFound.title'],
    description: copy['remainingRoutes.profileNotFound.description'],
    path: `/profile/${encodeURIComponent(params.username ?? '')}`,
    language: rootData?.language,
    noindex: true,
  });
};

export default function ProfileSurfaceRoute() {
  // Unreachable: the loader always throws; the root ErrorBoundary renders.
  return null;
}
