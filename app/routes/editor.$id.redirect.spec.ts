import { describe, expect, it } from 'vitest';

import { loader } from './editor.$id';
import { toResponse } from '~/lib/test/rr7-data';

/*
 * `/editor/:id` used to render `createEditorSurfacePage(params.id)`: a
 * templated MARKETING page titled "Editor Session", describing "Editor
 * compatibility route for session {editorId}" — for ANY string, publicly, with
 * HTTP 200.
 *
 * Same defect as `/project/:id`, and as the three profile routes G26 fixed.
 * Correcting one occurrence and leaving the next is how this class survived
 * three cleanups, so this guard is deliberately the twin of
 * `project.$id.redirect.spec.ts`.
 *
 * The target follows the sibling `editor.new.tsx`, which already redirects to
 * `/projects/new`: this family lands in the `/projects/*` space, and the editor
 * is the IDE.
 */
function redirectOf(id: string) {
  const response = toResponse(loader({ params: { id } } as never)) as Response;

  return { status: response.status, location: response.headers.get('location') };
}

describe('/editor/:id compatibility route', () => {
  it('permanently redirects to the canonical IDE page', () => {
    expect(redirectOf('cmsusbw8q00040nbf7dddmsq1')).toEqual({
      status: 301,
      location: '/projects/cmsusbw8q00040nbf7dddmsq1/ide',
    });
  });

  /**
   * The load-bearing assertion: it must NOT answer 200 with a page. A 200 here
   * is the brochure returning, whatever the body says.
   */
  it('never answers 200 with a rendered page', () => {
    for (const id of ['does-not-exist', 'someone-elses-session', '../etc/passwd', '']) {
      expect(redirectOf(id).status, `/editor/${id} must not render`).not.toBe(200);
    }
  });

  /**
   * The id is interpolated into the Location header, so a value carrying a
   * slash or a scheme must not steer the redirect off the canonical prefix —
   * an open redirect would be worse than the brochure it replaces.
   */
  it('keeps a hostile id inside the canonical prefix', () => {
    for (const id of ['../../evil', '//evil.example.com', 'https://evil.example.com', 'a/b']) {
      const { location } = redirectOf(id);

      expect(location, `${id} escaped the prefix`).toMatch(/^\/projects\/[^/]*\/ide$/u);
    }
  });
});
