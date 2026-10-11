import { describe, expect, it, vi } from 'vitest';
import { RemoteKubernetesRuntimeAdapter } from './index.js';

describe('demande de réparation transmise au serveur', () => {
  it('répare uniquement sur demande explicite et conserve le chemin encodé', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => Response.json([]));

    const runtime = new RemoteKubernetesRuntimeAdapter({
      baseUrl: 'https://runtime.example.com',
      authToken: 'test-token',
      workspaceId: 'ws-1',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await runtime.listFiles('src/a & b', { reparer: true });
    await runtime.listFiles('src/a & b');
    await runtime.listFiles('src/a & b', { reparer: false });

    const demandes = fetchImpl.mock.calls.map((appel) => new URL(String(appel[0])));
    expect(demandes).toHaveLength(3);
    expect(demandes.map((url) => url.searchParams.get('path'))).toEqual(Array(3).fill('src/a & b'));
    expect(demandes.map((url) => url.searchParams.get('reparer'))).toEqual(['1', null, null]);
  });
});
