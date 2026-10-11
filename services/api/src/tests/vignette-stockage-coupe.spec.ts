import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * STOCKAGE COUPÉ : RAFRAÎCHIR LA VIGNETTE N'EST PAS UNE ERREUR.
 *
 * L'IDE appelle `POST /projects/:id/thumbnail/refresh` dès que l'aperçu est prêt,
 * sans geste de l'utilisateur. Stockage de fichiers coupé, l'API répondait 404 :
 * une erreur rouge dans la console du navigateur à chaque ouverture d'aperçu. C'est
 * ce que relevait l'audit des traductions françaises (`i18n-french-live.spec.ts`,
 * « browser console errors »), rouge depuis le 22/09.
 *
 * Le cas voisin — stockage actif, capture d'écran non déployée — répondait déjà
 * `202 { scheduled: false, enabled: false }`. Le stockage coupé est le même cas :
 * la fonction n'est pas là, rien n'a échoué.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const ORIGINAL_ENABLED = process.env.OBJECT_STORAGE_ENABLED;

beforeEach(() => {
  process.env.OBJECT_STORAGE_ENABLED = 'false';
});

afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) {
    delete process.env.OBJECT_STORAGE_ENABLED;
  } else {
    process.env.OBJECT_STORAGE_ENABLED = ORIGINAL_ENABLED;
  }
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'vignette@example.com',
    name: 'Vignette',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Vignette Org', slug: 'vignette-org', ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: 'Vignette', slug: 'vignette' });

  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'vignette@example.com', password: 'password123' },
  });

  const token = login.json().token as string;

  return { app, project, token, store };
}

describe('rafraîchir la vignette, stockage coupé', () => {
  it('répond « désactivé » (202), pas 404', async () => {
    const { app, project, token } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/refresh`,
      headers: { authorization: `Bearer ${token}` },
      payload: { url: 'https://ws-1.preview.e-code.ai/' },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ scheduled: false, enabled: false });
  });

  it('reste fermé à qui n’a pas accès au projet', async () => {
    const { app, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/refresh`,
      payload: { url: 'https://ws-1.preview.e-code.ai/' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('un autre client, connecté mais hors du projet, n’obtient pas la réponse', async () => {
    const { app, project, store } = await setup();
    await store.createUser({
      email: 'intrus@example.com',
      name: 'Intrus',
      passwordHash: hashPassword('password123'),
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'intrus@example.com', password: 'password123' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/thumbnail/refresh`,
      headers: { authorization: `Bearer ${login.json().token}` },
      payload: { url: 'https://ws-1.preview.e-code.ai/' },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(403);
    expect(res.statusCode).not.toBe(202);
  });
});
