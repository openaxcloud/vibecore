import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

/*
 * BUG-GIT-002 — la route `/git` lançait à CHAQUE chargement deux requêtes
 * vouées à échouer, puis annonçait « l'espace de travail est indisponible ».
 *
 * Mesuré le 17/08 sur les trois formats (1440 / 768 / 390) : `useGit()`
 * appelait `startWorkspace()` au montage sans identifiant, `JSON.stringify`
 * effaçait les `undefined`, et le corps partait à `{}`. L'API répond alors
 * `400 RUNTIME_WORKSPACE_ID_REQUIRED` — TOUJOURS : elle exige `projectId`,
 * `metadata.projectId` ou `workspaceId`, et aucun des trois n'était là.
 *
 * Une requête dont on peut démontrer qu'elle échouera ne se lance pas. Et le
 * message doit nommer ce qui manque — un projet — plutôt qu'une panne.
 */
function adaptateur(reseau: ReturnType<typeof vi.fn>, workspaceId?: string) {
  return new RemoteKubernetesRuntimeAdapter({
    baseUrl: 'https://runtime.example.com',
    authToken: 'token',
    workspaceId,
    fetchImpl: reseau as unknown as typeof fetch,
    WebSocketImpl: class {} as never,
  });
}

describe('startWorkspace sans identifiant', () => {
  it('ne touche PAS au réseau, et nomme ce qui manque', async () => {
    const reseau = vi.fn();
    const adapter = adaptateur(reseau);

    await expect(adapter.startWorkspace()).rejects.toMatchObject({ code: 'RUNTIME_WORKSPACE_ID_REQUIRED' });

    // Le cœur du point : zéro requête, pas « une requête qui échoue proprement ».
    expect(reseau, 'une requête a été émise alors qu’elle ne pouvait pas aboutir').not.toHaveBeenCalled();
  });

  it('laisse passer dès qu’un identifiant existe — sur le porteur…', async () => {
    const reseau = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'ws-42', status: 'running' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await adaptateur(reseau, 'ws-42').startWorkspace();
    expect(reseau).toHaveBeenCalled();
  });

  it('… sur l’appel…', async () => {
    const reseau = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'ws-7', status: 'running' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await adaptateur(reseau).startWorkspace({ id: 'ws-7' });
    expect(reseau).toHaveBeenCalled();
  });

  it('… ou dans les métadonnées, que le serveur accepte aussi', async () => {
    const reseau = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'ws-8', status: 'running' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await adaptateur(reseau).startWorkspace({ metadata: { projectId: 'proj-8' } as never });
    expect(reseau, 'le serveur accepte metadata.projectId : ne pas refuser ce cas').toHaveBeenCalled();
  });
});
