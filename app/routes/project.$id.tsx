import { redirect, type LoaderFunctionArgs } from 'react-router';

/*
 * bolt.diy-heritage compatibility route for the singular `/project/:id`.
 *
 * It used to render `createProjectCompatSurfacePage(params.id)` — a templated
 * MARKETING page titled "Project Compatibility Overview" that echoed the URL
 * parameter back as "Compatibility route for legacy E-Code project {projectId},
 * with links into the E-Code project workspace". For ANY string. Publicly, with
 * HTTP 200. A project that never existed, or one the visitor cannot access, got
 * a confident page about itself.
 *
 * That is the same fake-brochure defect G26 fixed on `/u/:username`,
 * `/user/:username` and `/profile/:username`; this route was left behind. Those
 * three ended as honest 404s because E-Code has NO public-profile backend. Here
 * the situation differs and the honest answer differs with it: projects DO
 * exist, `/projects/:projectId` is their canonical page, and both paths carry
 * the same project id. A compatibility route's job is to send the visitor to
 * the canonical URL, not to describe it.
 *
 * So: a permanent redirect, the same treatment `user.settings.tsx` already
 * gives `/user/settings` → `/account-settings`. Whether the id resolves is then
 * decided by the real project page — including its authentication and its own
 * 404 — instead of being papered over here.
 *
 * The file stays so the `/project/:id` pattern in `ecode-route-coverage.spec.ts`
 * and `ecodeCompatibilityRoutePatterns` remains backed by a route module.
 */
export function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/projects/${encodeURIComponent(params.id ?? '')}`, 301);
}

export default function ProjectCompatRoute() {
  // Unreachable: the loader always redirects.
  return null;
}
