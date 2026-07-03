import type { MetaFunction } from 'react-router';

/*
 * bolt.diy-heritage compatibility route for /user/:username public builder
 * profiles — the same fake-brochure disease as /u/:username and
 * /profile/:username (fixed in G26): it rendered a templated marketing page
 * echoing the URL param back as if it were a real builder profile. E-Code has
 * NO public-profile backend: the User model has no `username` field and
 * services/api exposes no profile-by-username or public-projects-by-user
 * endpoint (re-verified).
 *
 * Until a real public-profile data source exists, serve an honest HTTP 404.
 * Throw it from the loader (not the component) so the document status is a
 * true 404 rather than a soft-404 — see surface-not-found-status.spec.ts.
 * The file itself stays so the /user/:username pattern in
 * ecode-route-coverage.spec.ts remains backed by a route module.
 */
export const loader = () => {
  throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
};

export const meta: MetaFunction = () => [{ title: 'Profile not found - E-Code' }];

export default function UserSurfaceRoute() {
  // Unreachable: the loader always throws; the root ErrorBoundary renders.
  return null;
}
