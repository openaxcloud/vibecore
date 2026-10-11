import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

/*
 * BUG-QA0928-RUNTIME-ID-PROJET — le runtime était adressé avec l'identifiant du
 * PROJET au lieu de celui du workspace.
 *
 * Mesuré en production le 2026-09-28 (journaux `api`, 12:04–12:07 UTC) : un compte
 * gratuit ouvre un second projet, le démarrage répond `429` (quota
 * `workspaces.active`), et 552 requêtes sur 552 partent vers
 * `/api/runtime/workspaces/<id du projet>/…` — toutes refusées `401` par la garde
 * de périmètre du ticket, dont 78 ÉCRITURES DE FICHIERS. Aucune n'a jamais visé un
 * `ws-…`. Le client, prenant ce `401` pour un ticket expiré, en a frappé 122 en une
 * minute.
 *
 * Trois règles, une par test :
 *   1. l'identifiant du projet n'entre JAMAIS dans un chemin runtime ;
 *   2. une écriture lancée pendant le démarrage l'attend, puis vise le vrai `ws-…` ;
 *   3. un démarrage en échec « transitoire » n'adopte pas l'identifiant du projet :
 *      il redemande le démarrage, qui seul sait résoudre le projet en workspace.
 */

const PROJET = 'cmprojetqa0928000000000000';

type Reponse = { status: number; body?: unknown; delaiMs?: number };

function reseau(routeur: (methode: string, chemin: string, appel: number) => Reponse) {
  const appels: string[] = [];
  const compteurs = new Map<string, number>();

  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const chemin = new URL(String(url)).pathname.replace(/^\/api\/runtime/, '');
    const methode = (init?.method ?? 'GET').toUpperCase();
    const cle = `${methode} ${chemin}`;
    const n = (compteurs.get(cle) ?? 0) + 1;
    compteurs.set(cle, n);
    appels.push(cle);

    const reponse = routeur(methode, chemin, n);

    if (reponse.delaiMs) {
      await new Promise((resolve) => setTimeout(resolve, reponse.delaiMs));
    }

    return new Response(reponse.body === undefined ? null : JSON.stringify(reponse.body), {
      status: reponse.status,
      headers: { 'content-type': 'application/json' },
    });
  });

  return { fetchImpl, appels };
}

function adaptateur(fetchImpl: ReturnType<typeof vi.fn>) {
  return new RemoteKubernetesRuntimeAdapter({
    baseUrl: 'https://api.example.com/api/runtime',
    authToken: 'vcrt_ticket',
    projectId: PROJET,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    WebSocketImpl: class {} as never,
  });
}

const visantLeProjet = (appels: string[]) => appels.filter((appel) => appel.includes(`/workspaces/${PROJET}`));

describe('le runtime n’est jamais adressé avec l’identifiant du projet', () => {
  it('avant tout démarrage, une lecture échoue SANS requête — pas de 401 à rattraper', async () => {
    const { fetchImpl, appels } = reseau(() => ({ status: 401, body: { code: 'UNAUTHORIZED' } }));
    const runtime = adaptateur(fetchImpl);

    await expect(runtime.listFiles('.')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_STARTED' });
    expect(visantLeProjet(appels), 'une requête a visé le projet au lieu du workspace').toEqual([]);
  });

  it('une écriture lancée pendant le démarrage l’attend, puis vise le vrai ws-…', async () => {
    const { fetchImpl, appels } = reseau((methode, chemin) => {
      if (methode === 'POST' && chemin === '/workspaces') {
        return { status: 200, body: { id: 'ws-9', status: 'running' }, delaiMs: 80 };
      }

      if (chemin.startsWith('/workspaces/ws-9/')) {
        return { status: 204 };
      }

      return { status: 401, body: { code: 'UNAUTHORIZED' } };
    });

    const runtime = adaptateur(fetchImpl);

    const demarrage = runtime.startWorkspace({ id: PROJET, metadata: { projectId: PROJET } as never });
    await runtime.writeFile('src/App.tsx', 'export default 1;');
    await demarrage;

    expect(appels).toContain('PUT /workspaces/ws-9/files/write');
    expect(visantLeProjet(appels)).toEqual([]);
  });

  it('un démarrage refusé (quota) laisse l’écriture échouer en WORKSPACE_NOT_STARTED, sans requête', async () => {
    const { fetchImpl, appels } = reseau((methode, chemin) =>
      methode === 'POST' && chemin === '/workspaces'
        ? { status: 429, body: { code: 'QUOTA_EXCEEDED', quotaKey: 'workspaces.active' } }
        : { status: 401, body: { code: 'UNAUTHORIZED' } },
    );

    const runtime = adaptateur(fetchImpl);

    await expect(
      runtime.startWorkspace({ id: PROJET, metadata: { projectId: PROJET } as never }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(runtime.writeFile('src/App.tsx', 'x')).rejects.toMatchObject({ code: 'WORKSPACE_NOT_STARTED' });
    expect(visantLeProjet(appels)).toEqual([]);
  });

  it('un démarrage en échec transitoire redemande le démarrage au lieu d’adopter le projet', async () => {
    const { fetchImpl, appels } = reseau((methode, chemin, n) => {
      if (methode === 'POST' && chemin === '/workspaces') {
        return n === 1 ? { status: 502 } : { status: 200, body: { id: 'ws-5', status: 'running' } };
      }

      return { status: 401, body: { code: 'UNAUTHORIZED' } };
    });

    const runtime = adaptateur(fetchImpl);

    const session = await runtime.startWorkspace({ id: PROJET, metadata: { projectId: PROJET } as never });

    expect(session.id).toBe('ws-5');
    expect(visantLeProjet(appels), 'le statut a été sondé sur l’identifiant du projet').toEqual([]);
  });

  it('un vrai identifiant de workspace transmis au démarrage reste adopté sur échec transitoire', async () => {
    const { fetchImpl, appels } = reseau((methode, chemin) => {
      if (methode === 'POST' && chemin === '/workspaces') {
        return { status: 502 };
      }

      if (chemin === '/workspaces/ws-reel/status') {
        return { status: 200, body: { id: 'ws-reel', status: 'running' } };
      }

      return { status: 404 };
    });

    const runtime = adaptateur(fetchImpl);

    const session = await runtime.startWorkspace({ id: 'ws-reel', metadata: { projectId: PROJET } as never });

    expect(session.id).toBe('ws-reel');
    expect(appels).toContain('GET /workspaces/ws-reel/status');
  });
});
