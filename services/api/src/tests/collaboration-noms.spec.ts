import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/**
 * UIB-16 — le panneau Collaborateurs nomme les personnes.
 *
 * Mesuré le 2026-10-01 sur la copie locale (vrai Postgres), IDE à 1440 : la
 * présence affichait « Participant 1 » pour l'utilisateur connecté. Les lignes
 * de présence, de collaborateurs et de commentaires ne portaient que `userId`.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

describe('panneau Collaborateurs : noms des personnes (UIB-16)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'uib16-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'uib16-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('la présence porte le nom, jamais l’adresse', async () => {
    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    const inscription = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ada@noms.test', password: 'password123', name: 'Ada Lovelace', organizationName: 'Noms' },
    });
    expect(inscription.statusCode).toBe(201);

    const { token, organization } = inscription.json() as { token: string; organization: { id: string } };
    const auth = { authorization: `Bearer ${token}` };

    const creation = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/projects`,
      headers: auth,
      payload: { name: 'Projet noms' },
    });
    expect(creation.statusCode).toBe(201);

    const projectId = (creation.json() as { project: { id: string } }).project.id;

    const presence = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/collaboration/presence`,
      headers: auth,
      payload: { sessionId: 'session-ada', filePath: 'README.md' },
    });
    expect(presence.statusCode).toBe(200);
    expect((presence.json() as { presence: { name?: string } }).presence.name).toBe('Ada Lovelace');

    const panneau = await app.inject({ method: 'GET', url: `/projects/${projectId}/collaboration`, headers: auth });
    expect(panneau.statusCode).toBe(200);

    const corps = panneau.json() as { presence: Array<{ name?: string }> };
    expect(corps.presence.map((p) => p.name)).toEqual(['Ada Lovelace']);
    expect(panneau.body).not.toContain('ada@noms.test');

    await app.close();
  });
});
