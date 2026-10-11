import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * LA SECONDE MOITIÉ : ce que `/ready` FAIT du verdict.
 *
 * `sonde-stockage-readiness.spec.ts` prouve que la sonde écrit vraiment et que
 * `ESTALE` est classé « montage mort ». Il ne prouve pas que la réplique sort de
 * la rotation — et c'est précisément ce qui manquait le 2026-09-07 : la sonde
 * n'existait pas, donc la réplique morte est restée dans la rotation avec une
 * requête sur deux en 500.
 *
 * On ne peut pas fabriquer un `ESTALE` sans un vrai montage NFS. On simule donc
 * le module de stockage — pas le comportement de `/ready`, qui reste celui du
 * code livré. Fichier séparé parce que la simulation vaut pour tout le fichier.
 */
vi.mock('../project-storage.js', async () => {
  const reel = await vi.importActual<typeof import('../project-storage.js')>('../project-storage.js');

  return {
    ...reel,
    sonderEcritureStockage: vi.fn(),
  };
});

const { buildApiApp } = await import('../app.js');
const magasinDeTest = await import('./test-api-store.js');
const stockage = await import('../project-storage.js');

class TestGitProvider {
  importRepository = async () => ({ defaultBranch: 'main' });
  cloneRepository = async () => ({ defaultBranch: 'main' });
  commit = async () => ({ sha: 'sha' });
  push = async () => ({});
  pull = async () => ({});
  branches = async () => [];
  checkout = async () => ({});
  diff = async () => '';
  createPullRequest = async () => ({ number: 1, url: 'https://example.com/pr/1' });
}

class TestEmailProvider {
  send = async () => ({ messageId: 'test' });
}

const construire = () =>
  buildApiApp({
    store: new magasinDeTest.TestApiStore() as never,
    gitProvider: new TestGitProvider() as never,
    emailProvider: new TestEmailProvider() as never,
  });

const sonde = stockage.sonderEcritureStockage as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => sonde.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('une poignée NFS périmée sort la réplique de la rotation', () => {
  it('ESTALE → 503, le motif nommé « mount-dead »', async () => {
    sonde.mockResolvedValue({ ok: false, code: 'ESTALE', fatal: true, latencyMs: 3 });

    const app = await construire();

    try {
      const r = await app.inject({ method: 'GET', url: '/ready' });
      const corps = r.json() as { status: string; checks: Record<string, { status: string; detail?: string }> };

      expect(r.statusCode).toBe(503);
      expect(corps.status).toBe('degraded');
      expect(corps.checks.storage.status).toBe('down');
      expect(corps.checks.storage.detail).toBe('mount-dead:ESTALE');
    } finally {
      await app.close();
    }
  });

  it('une panne TRANSITOIRE est signalée mais la réplique RESTE en rotation', async () => {
    /*
     * La contre-épreuve dans l'autre sens, et elle vaut autant que la première :
     * sortir toutes les répliques sur une cause globale — Filestore lent, disque
     * plein — transformerait une dégradation en panne totale, y compris pour les
     * routes qui n'écrivent jamais.
     */
    sonde.mockResolvedValue({ ok: false, code: 'ETIMEDOUT', fatal: false, latencyMs: 1500 });

    const app = await construire();

    try {
      const r = await app.inject({ method: 'GET', url: '/ready' });
      const corps = r.json() as { checks: Record<string, { status: string; detail?: string }> };

      expect(r.statusCode).toBe(200);
      expect(corps.checks.storage.status).toBe('down');
      expect(corps.checks.storage.detail).toBe('transient:ETIMEDOUT');
    } finally {
      await app.close();
    }
  });

  it('la sonde est bien APPELÉE à chaque /ready — sinon tout le reste est décoratif', async () => {
    sonde.mockResolvedValue({ ok: true, latencyMs: 2 });

    const app = await construire();

    try {
      await app.inject({ method: 'GET', url: '/ready' });
      await app.inject({ method: 'GET', url: '/ready' });

      expect(sonde).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });
});
