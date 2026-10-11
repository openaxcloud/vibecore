import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/**
 * BUG-QA0930-INVITATION-SANS-PLACE — mesuré le 2026-10-01 en local, vraie API :
 * le propriétaire d'une équipe au forfait gratuit invite un collègue → 201
 * « Invitation créée », l'e-mail part. Le collègue crée son compte, vérifie son
 * adresse, accepte… et reçoit 429 QUOTA_EXCEEDED (team.members : 1 place, déjà
 * prise par le propriétaire). Il lit « Trop de tentatives, réessayez » et ne
 * rejoindra jamais l'équipe : l'invitation était impossible à honorer dès sa
 * création.
 *
 * La limite elle-même n'est pas en cause (elle vient du forfait) : c'est la
 * création qui ne la consultait pas.
 */

async function equipe(planKey?: 'team') {
  const store = new TestApiStore();
  const app = await buildApiApp({ store });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `proprio-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Proprio',
      organizationName: 'Atelier',
    },
  });

  expect(inscription.statusCode).toBe(201);

  const { token, organization } = inscription.json() as { token: string; organization: { id: string } };

  if (planKey) {
    await store.upsertSubscription({ organizationId: organization.id, planKey, status: 'ACTIVE' });
  }

  const inviter = (email: string) =>
    app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/invitations`,
      headers: { authorization: `Bearer ${token}` },
      payload: { email, roleKey: 'member' },
    });

  return { app, store, organization, inviter };
}

describe('une invitation que le forfait ne pourra pas honorer est refusée à la création', () => {
  it('forfait gratuit (1 place, prise par le propriétaire) : refus clair, aucune invitation, aucun e-mail', async () => {
    const { app, store, organization, inviter } = await equipe();

    const reponse = await inviter('collegue@example.com');

    /*
     * Mesuré AVANT correctif : 201, invitation créée et e-mail envoyé — le
     * refus n'arrivait qu'au collègue, après inscription et vérification.
     */
    expect(reponse.statusCode, reponse.body).toBe(429);
    expect(reponse.json()).toMatchObject({ code: 'QUOTA_EXCEEDED', quotaKey: 'team.members' });
    expect(await store.listOrganizationInvites(organization.id)).toHaveLength(0);

    await app.close();
  });

  it('les places promises aux invitations EN ATTENTE comptent : on ne promet pas plus de places qu’il n’en reste', async () => {
    const { app, store, organization, inviter } = await equipe('team');

    await store.createQuotaOverride({
      organizationId: organization.id,
      key: 'team.members',
      limit: 2,
      reason: 'test : propriétaire + une place',
    });

    expect((await inviter('premier@example.com')).statusCode).toBe(201);

    const second = await inviter('second@example.com');

    expect(second.statusCode, second.body).toBe(429);
    expect(second.json()).toMatchObject({ code: 'QUOTA_EXCEEDED', quotaKey: 'team.members' });
    expect(await store.listOrganizationInvites(organization.id)).toHaveLength(1);

    await app.close();
  });

  it('TÉMOIN — forfait Team avec des places libres : l’invitation part', async () => {
    const { app, inviter } = await equipe('team');

    const reponse = await inviter('collegue@example.com');

    expect(reponse.statusCode, reponse.body).toBe(201);

    await app.close();
  });
});
