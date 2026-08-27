/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPersistedProjectRevision } from './ProjectWorkspaceProvider';

/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 3) — CHANGEMENT DE CONTRAT assumé.
 *
 * Ces tests décrivaient l'ancienne source de vérité : l'ETag de l'ide-state,
 * c'est-à-dire `ideState.version`. Or cette version est incrémentée par les
 * écritures d'INTERFACE — ouvrir un onglet, déplacer le curseur. Mesuré en réel
 * sur une seule session : 5 → 9 sans qu'un fichier ait changé. La comparaison
 * concluait donc « le stockage a bougé » à presque chaque réouverture et forçait
 * le reseed : c'est exactement le symptôme signalé (« ça recharge et reconstruit
 * au lieu de montrer l'app comme on l'a laissée »).
 *
 * La révision vient désormais de `GET /files-revision`, dérivée des chemins,
 * dates et tailles — donc insensible aux écritures d'interface.
 */

function response(init: { ok?: boolean; body?: unknown }) {
  return {
    ok: init.ok ?? true,
    headers: { get: () => null },
    json: async () => init.body,
  } as unknown as Response;
}

describe('fetchPersistedProjectRevision', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('interroge /files-revision, et non plus l_ide-state', async () => {
    const fetchMock = vi.fn(async () => response({ body: { revision: 'abc123' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPersistedProjectRevision('p1')).resolves.toBe('abc123');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/files-revision');
    expect(url).not.toContain('/ide-state');
  });

  it('ignore désormais `ideState.version` même si la réponse en porte une', async () => {
    /*
     * Garde de non-régression : c'est cette valeur-là qui provoquait les reseeds
     * injustifiés. Elle ne doit plus jamais devenir la révision.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ body: { revision: 'abc123', ideState: { version: 99 } } })),
    );

    await expect(fetchPersistedProjectRevision('p1')).resolves.toBe('abc123');
  });

  it('rend undefined sur une réponse non-ok (repli sur le comportement antérieur)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ ok: false })),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });

  it('rend undefined quand la révision est absente ou vide', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ body: { revision: '' } })),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ body: {} })),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });

  it('rend undefined quand la révision n_est pas une chaîne (réponse malformée)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ body: { revision: 42 } })),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });

  it('rend undefined (ne lève jamais) quand le fetch lui-même échoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    await expect(fetchPersistedProjectRevision('p1')).resolves.toBeUndefined();
  });
});
