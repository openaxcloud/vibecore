import { describe, expect, it } from 'vitest';

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

  return { app, store, inscrire, inviter, accepter, verifie, organisation: proprio.organization.id };
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
    expect(await store.getMembership(collegue.user.id, organisation)).toBeTruthy();
    expect(await verifie(collegue.user.id)).toBe(true);

    await app.close();
  });

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
