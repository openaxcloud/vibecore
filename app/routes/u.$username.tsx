import type { MetaFunction } from 'react-router';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';

/*
 * bolt.diy-heritage compatibility route for /u/:username public builder
 * profiles. E-Code has NO public-profile backend: the User model has no
 * `username` field (packages/database/prisma/schema.prisma) and services/api
 * exposes no profile-by-username endpoint. This route previously rendered a
 * templated marketing page that echoed the URL param back as if it were a
 * real builder profile — fake data on a public URL.
 *
 * Until a real public-profile data source exists, serve an honest HTTP 404.
 * Throw it from the loader (not the component) so the document status is a
 * true 404 rather than a soft-404 — see surface-not-found-status.spec.ts and
 * $slug.tsx for the rationale. The file itself stays so the /u/:username
 * pattern in ecode-route-coverage.spec.ts remains backed by a route module.
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
    path: `/u/${encodeURIComponent(params.username ?? '')}`,
    language: rootData?.language,
    noindex: true,
  });
};

export default function PublicUserPage() {
  // Unreachable: the loader always throws; the root ErrorBoundary renders.
  return null;
}
