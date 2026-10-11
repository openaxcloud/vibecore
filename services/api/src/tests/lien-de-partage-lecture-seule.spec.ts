import { hashToken } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * UN LIEN DE PARTAGE NE DOIT PAS OUVRIR UNE SECONDE PORTE VERS L'ÉCRITURE.
 *
 * Mesuré le 2026-10-06 (docs/bugs/qa-2026-10-06/repro-lien-de-partage-places) :
 * sur un forfait gratuit à UNE place, l'invitation était bien refusée
 * (429 QUOTA_EXCEEDED) — et un lien `member` de 30 jours donnait ensuite
 * l'ÉCRITURE à SIX comptes d'affilée, tous à 200, sans consommer une place.
 *
 *   témoin — invitation sur forfait gratuit (1 place) : 429 QUOTA_EXCEEDED
 *   création d'un lien « member » 30 jours : 201
 *   ami 1..6 : rachat 200 | lit le projet 200 | ÉCRIT 200
 *
 * Décision du 2026-10-11 : un lien de partage donne un accès en LECTURE SEULE ;
 * l'écriture exige une invitation, qui consomme une place.
 *
 * CE QUE CE TEST TIENT, et il tient les DEUX moitiés de la garde (règle 6) :
 *   — la création refuse un rôle d'écriture, avec un code nommé ;
 *   — le rachat n'accorde que la lecture, même si le lien stocké dit autre chose.
 * Retirer l'une des deux doit faire rougir ce fichier.
 *
 * ET IL PORTE SON TÉMOIN : le cas « invitation refusée » prouve que le quota est
 * réellement appliqué sur l'autre porte. Sans lui, un test où personne n'écrit
 * passerait au vert sur une plateforme où le quota ne compte rien du tout.
 */
describe('un lien de partage donne la lecture, jamais l’écriture', () => {
  const inscrire = async (app: Awaited<ReturnType<typeof buildApiApp>>, email: string, org: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email, password: 'password123', name: email, organizationName: org },
      })
    ).json();

  it('TÉMOIN — sur un forfait à une place, l’invitation est bien refusée', async () => {
    const app = await buildApiApp({ store: new TestApiStore() });

    try {
      const proprio = await inscrire(app, `proprio-temoin-${Date.now()}@example.com`, 'Atelier gratuit');
      const entetes = { authorization: `Bearer ${proprio.token}` };
      const invitation = await app.inject({
        method: 'POST',
        url: `/orgs/${proprio.organization.id}/invitations`,
        headers: entetes,
        payload: { email: `invite-${Date.now()}@example.com`, roleKey: 'member' },
      });

      expect(
        invitation.statusCode,
        'le quota de places n’est pas appliqué sur l’invitation : tout le reste de ce fichier ' +
          'passerait au vert sans rien prouver',
      ).toBe(429);
      expect(invitation.json().error?.code ?? invitation.json().code).toBe('QUOTA_EXCEEDED');
    } finally {
      await app.close();
    }
  });

  it('REFUSE un lien d’écriture à la création, avec un code nommé', async () => {
    const app = await buildApiApp({ store: new TestApiStore() });

    try {
      const proprio = await inscrire(app, `proprio-creation-${Date.now()}@example.com`, 'Atelier gratuit');
      const entetes = { authorization: `Bearer ${proprio.token}` };
      const projet = (
        await app.inject({
          method: 'POST',
          url: `/orgs/${proprio.organization.id}/projects`,
          headers: entetes,
          payload: { name: 'P' },
        })
      ).json().project;

      const lien = await app.inject({
        method: 'POST',
        url: `/projects/${projet.id}/collaboration/share-links`,
        headers: entetes,
        payload: { roleKey: 'member', expiresInMinutes: 60 * 24 * 30 },
      });

      expect(lien.statusCode, 'un lien « member » est encore créé : la porte d’écriture reste ouverte').toBe(409);
      expect(lien.json().error.code).toBe('SHARE_LINK_WRITE_NOT_ALLOWED');
      // Le message doit ORIENTER, pas seulement refuser.
      expect(lien.json().error.message).toMatch(/invitation/iu);
    } finally {
      await app.close();
    }
  });

  it('un lien de lecture laisse LIRE et refuse d’ÉCRIRE — pour plusieurs comptes', async () => {
    const app = await buildApiApp({ store: new TestApiStore() });

    try {
      const proprio = await inscrire(app, `proprio-lecture-${Date.now()}@example.com`, 'Atelier gratuit');
      const entetes = { authorization: `Bearer ${proprio.token}` };
      const projet = (
        await app.inject({
          method: 'POST',
          url: `/orgs/${proprio.organization.id}/projects`,
          headers: entetes,
          payload: { name: 'P' },
        })
      ).json().project;

      const lien = await app.inject({
        method: 'POST',
        url: `/projects/${projet.id}/collaboration/share-links`,
        headers: entetes,
        payload: { roleKey: 'viewer', expiresInMinutes: 60 * 24 * 30 },
      });

      expect(lien.statusCode, 'même un lien de lecture est refusé : la garde est trop large').toBe(201);

      const jeton = lien.json().token;
      const observe: Array<{ rachat: number; lit: number; ecrit: number }> = [];

      for (let i = 1; i <= 3; i++) {
        const ami = await inscrire(app, `ami-${i}-${Date.now()}@example.com`, `Perso ${i}`);
        const sien = { authorization: `Bearer ${ami.token}` };
        const rachat = await app.inject({
          method: 'GET',
          url: `/collaboration/share-links/${encodeURIComponent(jeton)}`,
          headers: sien,
        });
        const ecrit = await app.inject({
          method: 'PUT',
          url: `/projects/${projet.id}/ide-state`,
          headers: sien,
          payload: { state: { ui: { x: i } } },
        });
        const lit = await app.inject({ method: 'GET', url: `/projects/${projet.id}`, headers: sien });

        observe.push({ rachat: rachat.statusCode, lit: lit.statusCode, ecrit: ecrit.statusCode });
      }

      // Le lien reste utile : chacun rachète et LIT.
      expect(
        observe.map((o) => o.rachat),
        'le rachat d’un lien de lecture a cessé de fonctionner : la garde casse le partage',
      ).toEqual([200, 200, 200]);
      expect(observe.map((o) => o.lit), 'un invité ne peut plus LIRE le projet partagé').toEqual([200, 200, 200]);

      // Et aucun n'écrit. C'est la ligne que la mesure du 06/10 rendait à 200.
      expect(
        observe.map((o) => o.ecrit),
        `au moins un invité a ÉCRIT sans consommer de place — mesuré : ${JSON.stringify(observe)}`,
      ).toEqual([403, 403, 403]);
    } finally {
      await app.close();
    }
  });

  it('un lien qui porte DÉJÀ un rôle d’écriture en base n’accorde que la lecture', async () => {
    /*
     * La seconde moitié de la garde, prise seule : on écrit le lien directement
     * dans le magasin avec `member`, comme un lien émis AVANT la garde de
     * création. Le rachat doit quand même ne donner que la lecture.
     */
    const store = new TestApiStore();
    const app = await buildApiApp({ store });

    try {
      const proprio = await inscrire(app, `proprio-ancien-${Date.now()}@example.com`, 'Atelier gratuit');
      const entetes = { authorization: `Bearer ${proprio.token}` };
      const projet = (
        await app.inject({
          method: 'POST',
          url: `/orgs/${proprio.organization.id}/projects`,
          headers: entetes,
          payload: { name: 'P' },
        })
      ).json().project;

      const jeton = `share_ancien_${Date.now()}`;
      await store.createProjectShareLink({
        projectId: projet.id,
        tokenHash: hashToken(jeton),
        roleKey: 'member',
        expiresAt: new Date(Date.now() + 60 * 60_000),
        createdByUserId: proprio.user.id,
      });

      const ami = await inscrire(app, `ami-ancien-${Date.now()}@example.com`, 'Perso');
      const sien = { authorization: `Bearer ${ami.token}` };
      const rachat = await app.inject({
        method: 'GET',
        url: `/collaboration/share-links/${encodeURIComponent(jeton)}`,
        headers: sien,
      });

      expect(rachat.statusCode, 'un lien préexistant n’est plus rachetable du tout').toBe(200);

      const ecrit = await app.inject({
        method: 'PUT',
        url: `/projects/${projet.id}/ide-state`,
        headers: sien,
        payload: { state: { ui: { ancien: true } } },
      });

      expect(
        ecrit.statusCode,
        'un lien émis AVANT la garde donne encore l’écriture : le bridage au rachat ne tient pas',
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
