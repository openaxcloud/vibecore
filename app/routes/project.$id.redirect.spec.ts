import { describe, expect, it } from 'vitest';

import { loader } from './project.$id';
import { toResponse } from '~/lib/test/rr7-data';

/*
 * `/project/:id` used to render `createProjectCompatSurfacePage(params.id)`: a
 * templated MARKETING page titled "Project Compatibility Overview", describing
 * "legacy E-Code project {projectId}, with links into the E-Code project
 * workspace" — for ANY string, publicly, with HTTP 200. A project that never
 * existed got a confident page about itself.
 *
 * Same fake-brochure defect G26 fixed on /u/:username, /user/:username and
 * /profile/:username; this singular route was left behind. Those three became
 * honest 404s because E-Code has no public-profile backend. Here projects DO
 * exist and `/projects/:projectId` is their canonical page, so the honest answer
 * is the one a compatibility route owes: send the visitor to the canonical URL
 * and let the real page decide about auth and existence.
 */
function redirectOf(id: string) {
  const response = toResponse(loader({ params: { id } } as never)) as Response;

  return { status: response.status, location: response.headers.get('location') };
}

describe('/project/:id compatibility route', () => {
  it('permanently redirects to the canonical project page', () => {
    expect(redirectOf('cmsusbw8q00040nbf7dddmsq1')).toEqual({
      status: 301,
      location: '/projects/cmsusbw8q00040nbf7dddmsq1',
    });
  });

  /**
   * The load-bearing assertion: it must NOT answer 200 with a page. A 200 here
   * is the defect returning, whatever the body says.
   */
  it('never answers 200 with a rendered page', () => {
    for (const id of ['does-not-exist', 'someone-elses-project', '../etc/passwd', '']) {
      expect(redirectOf(id).status, `/project/${id} must not render`).not.toBe(200);
    }
  });

  /**
   * The id is interpolated into the Location header, so a value carrying a slash
   * or a scheme must not be able to steer the redirect off the canonical prefix
   * — an open redirect would be a worse defect than the brochure it replaced.
   */
  it('keeps a hostile id inside the canonical prefix', () => {
    for (const id of ['../../evil', '//evil.example.com', 'https://evil.example.com', 'a/b']) {
      const { location } = redirectOf(id);

      expect(location, `${id} escaped the prefix`).toMatch(/^\/projects\/[^/]*$/u);
      expect(location, `${id} produced a protocol-relative target`).not.toMatch(/^\/projects\/\/{0,}$/u);
    }
  });
});
