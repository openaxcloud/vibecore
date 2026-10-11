import { redirect, type LoaderFunctionArgs } from 'react-router';

/*
 * bolt.diy-heritage compatibility route for `/editor/:id`.
 *
 * It rendered `createEditorSurfacePage(params.id)` — a templated MARKETING page
 * titled "Editor Session", describing "Editor compatibility route for session
 * {editorId}, preserving the E-Code path into the E-Code IDE flow". For ANY
 * string, publicly, with HTTP 200. A session that never existed got a confident
 * page about itself.
 *
 * Same fake-brochure defect as `/project/:id` (and as `/u/:username`,
 * `/user/:username`, `/profile/:username` before G26). Fixing one occurrence
 * and leaving the next is how this class survived three cleanups.
 *
 * The target is not guesswork: the sibling route `editor.new.tsx` already does
 * `redirect('/projects/new', 301)`, so this family redirects into the
 * `/projects/*` space by established convention. An id names a project, and the
 * editor IS the IDE, so `/projects/:id/ide` is where "open the editor for this"
 * belongs. Existence and authentication are then decided by the real page
 * instead of being papered over here — the surface's own "related routes"
 * pointed only at `/editor/new`, `/projects` and `/features`, which is what a
 * page with no real subject looks like.
 *
 * The file stays so the `/editor/:id` pattern in `ecode-route-coverage.spec.ts`
 * and `ecodeCompatibilityRoutePatterns` remains backed by a route module.
 */
export function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/projects/${encodeURIComponent(params.id ?? '')}/ide`, 301);
}

export default function EditorCompatRoute() {
  // Unreachable: the loader always redirects.
  return null;
}
