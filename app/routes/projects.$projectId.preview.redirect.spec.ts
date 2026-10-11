import { describe, expect, it } from 'vitest';

import { loader } from './projects.$projectId.preview';
import { toResponse } from '~/lib/test/rr7-data';

/*
 * Troisième et dernière occurrence de la brochure marketing (après
 * `/project/:id` en #408 et `/editor/:id` ci-contre) : cette route rendait une
 * page « Project Preview » décrivant « visual QA, runtime readiness and
 * shareable review » pour n'importe quelle chaîne, en HTTP 200 — sans rien
 * prévisualiser.
 *
 * L'aperçu est un vrai panneau de l'éditeur (`panel-registry.ts`), atteint par
 * `?panel=preview` : la cible n'est donc pas un choix, c'est l'endroit où
 * l'aperçu se trouve.
 */
function redirectOf(projectId: string) {
  const response = toResponse(loader({ params: { projectId } } as never)) as Response;

  return { status: response.status, location: response.headers.get('location') };
}

describe('/projects/:projectId/preview compatibility route', () => {
  it('permanently redirects to the IDE preview panel', () => {
    expect(redirectOf('cmsusbw8q00040nbf7dddmsq1')).toEqual({
      status: 301,
      location: '/projects/cmsusbw8q00040nbf7dddmsq1/ide?panel=preview',
    });
  });

  it('never answers 200 with a rendered page', () => {
    for (const id of ['does-not-exist', '../etc/passwd', '']) {
      expect(redirectOf(id).status, `/projects/${id}/preview must not render`).not.toBe(200);
    }
  });

  /**
   * The id lands in the Location header before a query string, so it must not
   * be able to escape the path segment nor forge extra query parameters.
   */
  it('keeps a hostile id inside the canonical path and query', () => {
    for (const id of ['../../evil', '//evil.example.com', 'a/b', 'x&panel=editor']) {
      const { location } = redirectOf(id);

      expect(location, `${id} escaped the canonical shape`).toMatch(/^\/projects\/[^/?&]*\/ide\?panel=preview$/u);
    }
  });
});
