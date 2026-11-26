import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Décision d'Avi du 2026-10-01 : accepter une invitation VAUT vérification de
 * l'adresse — le jeton n'a été envoyé qu'à cette boîte, l'utiliser prouve qu'on
 * la lit. Mesuré le 2026-10-01 : sans cette règle, le collègue tout juste inscrit
 * butait sur « vérifiez d'abord votre adresse », devait retrouver un second
 * e-mail, puis revenir à l'invitation — beaucoup décrochent.
 *
 * Règle de sécurité posée par Avi, sinon on ouvre un trou (quelqu'un se ferait
 * vérifier une adresse qui n'est pas la sienne) : ça ne vaut vérification que si
 *   1. l'invitation a été envoyée à CETTE adresse exacte,
 *   2. le lien est à USAGE UNIQUE,
 *   3. le lien est LIMITÉ DANS LE TEMPS.
 * Chaque condition a son cas qui doit REFUSER la vérification.
 */

async function banc() {
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

  const proprio = await inscrire(`proprio-${Date.now()}@example.com`, 'Atelier');
  await store.upsertSubscription({ organizationId: proprio.organization.id, planKey: 'team', status: 'ACTIVE' });

  const inviter = async (email: string) => {
    const reponse = await app.inject({
      method: 'POST',
      url: `/orgs/${proprio.organization.id}/invitations`,
      headers: { authorization: `Bearer ${proprio.token}` },
      payload: { email, roleKey: 'member' },
    });

    expect(reponse.statusCode, reponse.body).toBe(201);

    return reponse.json() as { token: string; invitation: { id: string } };
  };

  const accepter = (jetonSession: string, jetonInvitation: string) =>
    app.inject({
      method: 'POST',
      url: '/invitations/accept',
      headers: { authorization: `Bearer ${jetonSession}` },
      payload: { token: jetonInvitation },
    });

  const verifie = async (userId: string) => Boolean((await store.findUserById(userId))?.emailVerifiedAt);

  return {
    app,
    store,
    inscrire,
    inviter,
    accepter,
    verifie,
    organisation: proprio.organization.id,
    ownerToken: proprio.token,
  };
}

describe('accepter une invitation vaut vérification de l’adresse — à trois conditions', () => {
  it('invitation envoyée à CETTE adresse, lien neuf et valide : le collègue rejoint l’équipe ET son adresse est vérifiée', async () => {
    const { app, store, inscrire, inviter, accepter, verifie, organisation } = await banc();
    const email = `collegue-${Date.now()}@example.com`;
    const { token: jetonInvitation } = await inviter(email);
    const collegue = await inscrire(email, 'Perso');

    expect(await verifie(collegue.user.id), 'témoin : pas encore vérifiée').toBe(false);

    const reponse = await accepter(collegue.token, jetonInvitation);

    // Mesuré AVANT correctif : 403 EMAIL_NOT_VERIFIED.
    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(reponse.json().roleKey).toBe('member');
    expect(await store.getMembership(collegue.user.id, organisation)).toBeTruthy();
    expect(await verifie(collegue.user.id)).toBe(true);

    await app.close();
  });

  it('confirme le rôle effectif si le collègue est déjà membre', async () => {
    const { app, store, inscrire, inviter, accepter, organisation } = await banc();
    const email = 'existing-member@local.test';
    const invite = await inviter(email);
    const collegue = await inscrire(email, 'Perso');
    await store.addMember({ organizationId: organisation, userId: collegue.user.id, roleKey: 'viewer' });

    const reponse = await accepter(collegue.token, invite.token);
    expect(reponse.statusCode).toBe(200);
    expect(reponse.json()).toMatchObject({ roleKey: 'viewer', invitation: { roleKey: 'member' } });
    expect((await store.getMembership(collegue.user.id, organisation))?.roleKey).toBe('viewer');

    await app.close();
  });

  it.each(['member', 'viewer'] as const)(
    'confirme le rôle %s malgré une panne de relecture après acceptation',
    async (role) => {
      const { app, store, inscrire, inviter, accepter, organisation } = await banc();
      const email = 'accepted-invitation@local.test';
      const invite = await inviter(email);
      const collegue = await inscrire(email, 'Perso');

      if (role === 'viewer') {
        await store.addMember({ organizationId: organisation, userId: collegue.user.id, roleKey: role });
      }

      const consume = store.consumeOrganizationInvite.bind(store);

      vi.spyOn(store, 'consumeOrganizationInvite').mockImplementationOnce(async (token, userId) => {
        const result = await consume(token, userId);
        vi.spyOn(store, 'getMembership').mockRejectedValue(new Error('Membership read unavailable'));

        return result;
      });

      try {
        const reponse = await accepter(collegue.token, invite.token);
        expect(reponse.statusCode).toBe(200);
        expect(reponse.json().roleKey).toBe(role);

        vi.mocked(store.getMembership).mockRestore();
        expect((await store.getMembership(collegue.user.id, organisation))?.roleKey).toBe(role);
        expect((await accepter(collegue.token, invite.token)).statusCode).toBe(400);
      } finally {
        await app.close();
      }
    },
  );

  it('condition 1 — invitation envoyée à une AUTRE adresse : refus, et l’adresse du compte reste non vérifiée', async () => {
    const { app, inscrire, inviter, accepter, verifie } = await banc();
    const { token: jetonInvitation } = await inviter(`invitee-${Date.now()}@example.com`);
    const intrus = await inscrire(`intrus-${Date.now()}@example.com`, 'Intrus');

    const reponse = await accepter(intrus.token, jetonInvitation);

    expect(reponse.statusCode).toBe(403);
    expect(reponse.json().code).toBe('INVITE_EMAIL_MISMATCH');
    expect(await verifie(intrus.user.id)).toBe(false);

    await app.close();
  });

  it('condition 2 — lien DÉJÀ UTILISÉ : refus, rien n’est vérifié par un second passage', async () => {
    const { app, store, inscrire, inviter, accepter, verifie } = await banc();
    const email = `collegue-${Date.now()}@example.com`;
    const { token: jetonInvitation } = await inviter(email);
    const collegue = await inscrire(email, 'Perso');

    expect((await accepter(collegue.token, jetonInvitation)).statusCode).toBe(200);

    // On remet l'adresse à « non vérifiée » : le même lien ne doit PAS la revérifier.
    delete store.users.get(collegue.user.id)!.emailVerifiedAt;
    expect(await verifie(collegue.user.id), 'témoin : remise à non vérifiée').toBe(false);

    const rejeu = await accepter(collegue.token, jetonInvitation);

    expect(rejeu.statusCode).toBe(400);
    expect(await verifie(collegue.user.id)).toBe(false);

    await app.close();
  });

  it('condition 3 — lien EXPIRÉ : refus, l’adresse reste non vérifiée', async () => {
    const { app, store, inscrire, inviter, accepter, verifie } = await banc();
    const email = `collegue-${Date.now()}@example.com`;
    const { token: jetonInvitation, invitation } = await inviter(email);
    const collegue = await inscrire(email, 'Perso');

    store.organizationInvites.get(invitation.id)!.expiresAt = new Date(Date.now() - 60_000).toISOString();

    const reponse = await accepter(collegue.token, jetonInvitation);

    expect(reponse.statusCode).toBe(400);
    expect(await verifie(collegue.user.id)).toBe(false);

    await app.close();
  });
});

it('isolates concurrent project reservations across organizations after an existing viewer accepts an invitation', async () => {
  const { app, store, inscrire, inviter, accepter, organisation, ownerToken } = await banc();
  try {
    const email = 'viewer-with-personal-project@example.test';
    const invite = await inviter(email);
    const colleague = await inscrire(email, 'Personal');
    await store.addMember({ organizationId: organisation, userId: colleague.user.id, roleKey: 'viewer' });
    await store.upsertSubscription({ organizationId: colleague.organization.id, planKey: 'free', status: 'ACTIVE' });
    await store.upsertProviderConfig({ provider: 'OpenAI', displayName: 'Synthetic', enabled: true });
    const makeProject = (organizationId: string) =>
      store.createProject({ organizationId, name: 'Fixture', slug: 'fixture' });
    const [personal, team] = await Promise.all([makeProject(colleague.organization.id), makeProject(organisation)]);
    const reserve = (projectId: string, token: string, runId: string) =>
      app.inject({
        method: 'POST',
        url: `/projects/${projectId}/agent/explicit-run`,
        headers: { authorization: `Bearer ${token}` },
        payload: { runId, choice: { modele: 'gpt-5.6-luna' }, mode: 'lite', highEffort: false, turbo: false },
      });
    expect((await accepter(colleague.token, invite.token)).json()).toMatchObject({ roleKey: 'viewer' });
    // Different subscriptions make an accidental fallback to the caller's other organization observable.
    await store.upsertSubscription({ organizationId: organisation, planKey: 'team', status: 'UNPAID' });
    const [personalFirst, teamUnpaid, viewer] = await Promise.all([
      reserve(personal.id, colleague.token, 'personal-first'),
      reserve(team.id, ownerToken, 'team-unpaid'),
      reserve(team.id, colleague.token, 'viewer-attempt'),
    ]);
    expect(personalFirst.statusCode).toBe(200);
    expect(personalFirst.json()).toMatchObject({ projectId: personal.id, runId: 'personal-first' });
    expect(teamUnpaid.statusCode).toBe(403);
    expect(teamUnpaid.json().code).toBe('EXPLICIT_RUN_UNAVAILABLE');
    expect(viewer.statusCode).toBe(403);
    await store.upsertSubscription({ organizationId: organisation, planKey: 'team', status: 'ACTIVE' });
    const [personalFull, teamA, teamB] = await Promise.all([
      reserve(personal.id, colleague.token, 'personal-next'),
      reserve(team.id, ownerToken, 'team-a'),
      reserve(team.id, ownerToken, 'team-b'),
    ]);
    expect(personalFull.statusCode).toBe(409);
    expect(personalFull.json().code).toBe('EXPLICIT_RUN_BUDGET_EXCEEDED');
    expect([teamA.statusCode, teamB.statusCode].sort()).toEqual([200, 409]);
    for (const result of [teamA, teamB]) {
      if (result.statusCode === 200) expect(result.json()).toMatchObject({ projectId: team.id });
      else expect(result.json().code).toBe('EXPLICIT_RUN_BUDGET_EXCEEDED');
    }
    expect((await store.getMembership(colleague.user.id, organisation))?.roleKey).toBe('viewer');
  } finally {
    await app.close();
  }
});
