import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Décision d'Avi du 2026-10-01 : le forfait Pro a 5 places (il en avait 1, celle
 * du propriétaire : un client qui paie ne pouvait inviter personne). Mesuré de
 * bout en bout : les limites du code sont recopiées dans la table des forfaits au
 * démarrage (`seedBillingPlans`), et c'est elles que l'acceptation consulte.
 */
async function equipePro() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const inscrire = async (email: string, organizationName: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'password123', name: email, organizationName },
    });

    expect(reponse.statusCode, reponse.body).toBe(201);

    return reponse.json() as { token: string; user: { id: string }; organization: { id: string } };
  };

  const proprio = await inscrire(`proprio-${Date.now()}@example.com`, 'Atelier Pro');
  await store.upsertSubscription({ organizationId: proprio.organization.id, planKey: 'pro', status: 'ACTIVE' });

  const rejoindre = async (indice: number) => {
    const email = `collegue-${indice}-${Date.now()}@example.com`;
    const collegue = await inscrire(email, `Perso ${indice}`);
    await store.updateUser({ userId: collegue.user.id, emailVerifiedAt: new Date().toISOString() });

    const invitation = await app.inject({
      method: 'POST',
      url: `/orgs/${proprio.organization.id}/invitations`,
      headers: { authorization: `Bearer ${proprio.token}` },
      payload: { email, roleKey: 'member' },
    });

    if (invitation.statusCode !== 201) {
      return invitation.statusCode;
    }

    const acceptation = await app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${collegue.token}` },
      payload: { token: invitation.json().token },
    });

    return acceptation.statusCode;
  };

  return { app, store, rejoindre, organisation: proprio.organization.id };
}

describe('forfait Pro : 5 places (décision d’Avi du 01/10)', () => {
  it('quatre collègues rejoignent l’équipe du propriétaire ; le cinquième est refusé pour quota', async () => {
    const { app, store, rejoindre, organisation } = await equipePro();

    for (const indice of [1, 2, 3, 4]) {
      // Mesuré AVANT correctif : 429 dès le premier — une seule place, celle du propriétaire.
      expect(await rejoindre(indice), `collègue ${indice}`).toBe(200);
    }

    expect(await rejoindre(5), 'la sixième personne dépasse les 5 places').toBe(429);
    expect(await store.listMembers(organisation)).toHaveLength(5);

    await app.close();
  });
});
