import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/**
 * UIB-10 — deux clients peuvent s'inscrire avec le même nom d'organisation.
 *
 * Mesuré le 2026-10-01 sur la copie locale (vrai Postgres) : la seconde
 * inscription au même nom rendait 500 (contrainte @unique sur
 * Organization.slug) APRÈS avoir créé le compte, resté sans organisation ; en
 * réessayant avec un autre nom, « Email already registered » (409).
 *
 * Le magasin de test refuse désormais un slug déjà pris, comme Postgres :
 * sans cela, ce test ne pouvait pas rougir.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe("inscription avec un nom d'organisation déjà pris (UIB-10)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'uib10-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'uib10-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('les deux inscriptions réussissent, chacune avec son organisation au nom choisi', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const inscrire = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: 'Client', organizationName: 'Acme' },
      });

    const premier = await inscrire('premier@acme.test');
    const second = await inscrire('second@acme.test');

    expect(premier.statusCode).toBe(201);
    expect(second.statusCode, second.body).toBe(201);

    const orgA = (premier.json() as { organization: { slug: string; name: string } }).organization;
    const orgB = (second.json() as { organization: { slug: string; name: string } }).organization;

    expect(orgB.name).toBe('Acme');
    expect(orgB.slug).not.toBe(orgA.slug);
    expect(orgB.slug.startsWith('acme')).toBe(true);

    await app.close();
  });

  it('le magasin de test refuse un slug déjà pris, comme Postgres (garde de la garde)', async () => {
    const store = new TestApiStore();
    const owner = await store.createUser({ email: 'o@acme.test', name: 'O', passwordHash: 'x', language: 'fr' });

    await store.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: owner.id });
    await expect(store.createOrganization({ name: 'Acme', slug: 'acme', ownerUserId: owner.id })).rejects.toMatchObject(
      {
        code: 'P2002',
      },
    );
  });
});
