import type { MetaFunction } from 'react-router';

/*
 * bolt.diy-heritage compatibility route for /u/:username/:projectname public
 * project pages. E-Code has NO public-profile/public-project backend for this
 * URL shape: the User model has no `username` field
 * (packages/database/prisma/schema.prisma) and services/api exposes no
 * project-by-username endpoint (real project sharing lives at /share/:shareId).
 * This route previously rendered a templated marketing page that echoed the
 * URL params back as if they were a real builder's project — fake data on a
 * public URL.
 *
 * Until a real data source exists, serve an honest HTTP 404 thrown from the
 * loader (true 404 status, not a soft-404 — see
 * surface-not-found-status.spec.ts). The file stays so the
 * /u/:username/:projectname pattern in ecode-route-coverage.spec.ts remains
 * backed by a route module.
 */
export const loader = () => {
  throw new Response('Not Found', { status: 404, statusText: 'Not Found' });
};

export const meta: MetaFunction = () => [{ title: 'Project not found - E-Code' }];

export default function PublicUserProjectPage() {
  // Unreachable: the loader always throws; the root ErrorBoundary renders.
  return null;
}
