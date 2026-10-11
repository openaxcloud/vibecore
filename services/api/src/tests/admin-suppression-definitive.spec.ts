import { hashPassword } from '@vibecore/auth';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * SUPPRESSION DÉFINITIVE PAR UN ADMINISTRATEUR DE PLATEFORME.
 *
 * POURQUOI CETTE ROUTE. `DELETE /projects/:projectId/permanent` exige une
 * appartenance réelle à l'organisation du projet. Au 2026-09-07 la production
 * porte 399 projets sur 277 organisations, dont 347 hors de celle du
 * propriétaire : sans cette route, la seule façon d'y arriver serait de FORGER
 * une session par organisation — fabriquer des identifiants d'autrui pour une
 * opération irréversible, et signer l'audit du nom d'utilisateurs qui n'ont rien
 * fait.
 *
 * CE QUE CES TESTS TIENNENT. Pas seulement « ça supprime » : l'ORDRE (démonter
 * avant de perdre la ligne, car le nom du volume vit sur la ligne), le fait que
 * l'échec partiel remonte au lieu d'être avalé, et la barrière d'accès.
 */

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function monter(options: Record<string, unknown> = {}) {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, ...options } as never);

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'jeton-admin', expiresAt: new Date(Date.now() + 3600_000) });
  await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: auth('jeton-admin'),
    payload: { password: 'password123' },
  });

  const quidam = await store.createUser({
    email: 'quidam@example.com',
    name: 'Quidam',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: quidam.id, token: 'jeton-quidam', expiresAt: new Date(Date.now() + 3600_000) });

  const org = await store.createOrganization({ name: 'Org', slug: 'org', ownerUserId: quidam.id });

  const projet = await store.createProject({
    organizationId: org.id,
    name: 'Projet',
    slug: 'projet',
  });

  return { app, store, projet, org };
}

describe('DELETE /admin/projects/:projectId', () => {
  it('un utilisateur ordinaire ne peut pas — 403', async () => {
    const { app, projet, store } = await monter();

    try {
      const r = await app.inject({
        method: 'DELETE',
        url: `/admin/projects/${projet.id}`,
        headers: auth('jeton-quidam'),
      });

      expect(r.statusCode).toBe(403);
      expect(await store.getProject(projet.id)).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('sans jeton du tout — 401', async () => {
    const { app, projet } = await monter();

    try {
      expect((await app.inject({ method: 'DELETE', url: `/admin/projects/${projet.id}` })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('l’administrateur supprime, et le démontage est APPELÉ', async () => {
    const teardown = vi.fn(async () => undefined);
    const { app, projet, store } = await monter({ databaseProvisioner: { teardown } });

    try {
      const r = await app.inject({
        method: 'DELETE',
        url: `/admin/projects/${projet.id}`,
        headers: auth('jeton-admin'),
      });

      expect(r.statusCode).toBe(200);
      expect(teardown).toHaveBeenCalledWith({ projectId: projet.id });
      expect(await store.getProject(projet.id)).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('le démontage se fait AVANT la perte de la ligne — l’ordre est le correctif', async () => {
    /*
     * AUDX-171 : le nom du volume vit sur la ligne du projet. Démonter après
     * l'avoir supprimée, c'est démonter sans la poignée. Le test fixe l'ordre,
     * pas seulement la présence des deux appels.
     */
    const ordre: string[] = [];

    const teardown = vi.fn(async () => {
      ordre.push('demontage');
    });

    const { app, projet, store } = await monter({ databaseProvisioner: { teardown } });
    const reel = store.hardDeleteProject.bind(store);
    vi.spyOn(store, 'hardDeleteProject').mockImplementation(async (id: string) => {
      ordre.push('suppression');
      return reel(id);
    });

    try {
      await app.inject({ method: 'DELETE', url: `/admin/projects/${projet.id}`, headers: auth('jeton-admin') });

      expect(ordre).toEqual(['demontage', 'suppression']);
    } finally {
      vi.restoreAllMocks();
      await app.close();
    }
  });

  it('un démontage EN ÉCHEC est rapporté, pas avalé', async () => {
    /*
     * Une ressource restée en place doit être NOMMÉE dans la réponse. C'est la
     * différence entre une orpheline réconciliable et une orpheline découverte
     * des mois plus tard sur une facture.
     */
    const teardown = vi.fn(async () => {
      throw new Error('CNPG injoignable');
    });

    const { app, projet } = await monter({ databaseProvisioner: { teardown } });

    try {
      const r = await app.inject({
        method: 'DELETE',
        url: `/admin/projects/${projet.id}`,
        headers: auth('jeton-admin'),
      });

      const corps = r.json() as { teardown: { complete: boolean; failed: string[] } };

      expect(corps.teardown.complete).toBe(false);
      expect(corps.teardown.failed).toContain('database');
    } finally {
      await app.close();
    }
  });

  it('une confirmation de nom qui ne correspond pas bloque — 400', async () => {
    const { app, projet, store } = await monter();

    try {
      const r = await app.inject({
        method: 'DELETE',
        url: `/admin/projects/${projet.id}`,
        headers: auth('jeton-admin'),
        payload: { confirmName: 'pas-le-bon-nom' },
      });

      expect(r.statusCode).toBe(400);
      expect(await store.getProject(projet.id)).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('un projet inconnu rend 404 et ne casse rien', async () => {
    const { app } = await monter();

    try {
      const r = await app.inject({
        method: 'DELETE',
        url: '/admin/projects/cmtinexistant000000000000',
        headers: auth('jeton-admin'),
      });

      expect(r.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
