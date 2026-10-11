import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

/*
 * Décision d'Avi du 2026-10-11 : ouvrir un second projet met l'autre espace d'un
 * client gratuit en veille, avec AU PLUS une mention discrète. L'API la porte dans
 * `metadata.misEnVeille` de la réponse au démarrage.
 *
 * À froid (le cas courant : un projet qu'on n'a pas ouvert depuis un moment), cette
 * réponse dit « starting » et l'adaptateur attend la disponibilité en sondant
 * `/status` — qui, lui, ne sait rien de la mise en veille. Sans report, la mention
 * disparaissait précisément dans le cas où elle sert.
 */

function adaptateur(routeur: (methode: string, chemin: string) => { status: number; body: unknown }) {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const chemin = new URL(String(url)).pathname.replace(/^\/api\/runtime/, '');
    const reponse = routeur((init?.method ?? 'GET').toUpperCase(), chemin);

    return new Response(JSON.stringify(reponse.body), {
      status: reponse.status,
      headers: { 'content-type': 'application/json' },
    });
  });

  return new RemoteKubernetesRuntimeAdapter({
    baseUrl: 'https://api.example.com/api/runtime',
    authToken: 'vcrt_ticket',
    projectId: 'projet-b',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    WebSocketImpl: class {} as never,
  });
}

const session = (status: string, metadata: Record<string, unknown> = {}) => ({
  id: 'ws-b',
  runtimeMode: 'remote-kubernetes',
  status,
  workdir: '/workspace',
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  metadata,
});

describe('la mention « projet mis en veille » survit à l’ouverture', () => {
  it('à FROID : la réponse dit « starting », la sonde de statut ne sait rien — la mention arrive quand même', async () => {
    const runtime = adaptateur((methode, chemin) =>
      methode === 'POST' && chemin === '/workspaces'
        ? { status: 200, body: session('starting', { provisioning: true, misEnVeille: ['Projet A'] }) }
        : { status: 200, body: session('running') },
    );

    const ouverte = await runtime.startWorkspace({
      id: 'projet-b',
      metadata: { projectId: 'projet-b', ouverture: true },
    });

    // Mesuré AVANT correctif : `undefined` — la mention perdue dans l'attente de disponibilité.
    expect(ouverte.metadata?.misEnVeille).toEqual(['Projet A']);
    expect(ouverte.status).toBe('running');
  });

  it('à CHAUD : la réponse est déjà « running » — la mention est là', async () => {
    const runtime = adaptateur(() => ({ status: 200, body: session('running', { misEnVeille: ['Projet A'] }) }));

    const ouverte = await runtime.startWorkspace({
      id: 'projet-b',
      metadata: { projectId: 'projet-b', ouverture: true },
    });

    expect(ouverte.metadata?.misEnVeille).toEqual(['Projet A']);
  });

  it('TÉMOIN : sans mise en veille, aucune mention n’est inventée', async () => {
    const runtime = adaptateur((methode) =>
      methode === 'POST'
        ? { status: 200, body: session('starting', { provisioning: true }) }
        : { status: 200, body: session('running') },
    );

    const ouverte = await runtime.startWorkspace({ id: 'projet-b' });

    expect(ouverte.metadata?.misEnVeille).toBeUndefined();
  });
});
