import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailMessage, EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Constat du 2026-10-11 (BUG-QA1006-SUPPRESSION-DE-COMPTE-JAMAIS-EXECUTEE) : la
 * tâche d'inactivité tourne À BLANC en production (`INACTIVITY_GC_ENABLED`
 * absent : rien n'est supprimé), mais son étape « avertissement » envoyait quand
 * même l'e-mail « votre compte sera supprimé ». Une alarme mensongère.
 * Mesuré en production : 0 envoi à ce jour (le plus ancien compte date du
 * 2026-05-20 ; premier avertissement possible le 2027-04-25).
 *
 * Règle : l'avertissement de suppression ne part QUE si la suppression est
 * active. Le jour où elle sera branchée, il reviendra avec elle — pas avant.
 */

class EmailsEnregistres implements EmailProvider {
  envoyes: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.envoyes.push(message);
  }
}

const JOUR = 24 * 60 * 60 * 1000;
const SECRET = 'secret-interne';
const precedent = { secret: process.env.INTERNAL_API_SHARED_SECRET, active: process.env.INACTIVITY_GC_ENABLED };

afterEach(() => {
  for (const [cle, valeur] of [
    ['INTERNAL_API_SHARED_SECRET', precedent.secret],
    ['INACTIVITY_GC_ENABLED', precedent.active],
  ] as const) {
    if (valeur === undefined) {
      delete process.env[cle];
    } else {
      process.env[cle] = valeur;
    }
  }
});

async function banc() {
  process.env.INTERNAL_API_SHARED_SECRET = SECRET;
  delete process.env.INACTIVITY_GC_ENABLED;

  const store = new TestApiStore();
  const emails = new EmailsEnregistres();
  const app = await buildApiApp({ store, emailProvider: emails });

  const inactif = await store.createUser({
    email: 'inactif-340j@example.com',
    name: 'Inactif',
    passwordHash: hashPassword('password123'),
  });

  // 340 jours sans activité : au-delà du premier seuil d'avertissement (335 j), avant la suppression (365 j).
  await store.touchUserActivity(inactif.id, Date.now() - 340 * JOUR);

  const passer = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/internal/inactivity-gc',
      headers: { authorization: `Bearer ${SECRET}` },
      payload,
    });

  return { app, emails, passer };
}

describe('tâche d’inactivité — pas d’avertissement de suppression quand la suppression est coupée', () => {
  it('suppression COUPÉE (cas de la production) : aucun e-mail « votre compte sera supprimé »', async () => {
    const { app, emails, passer } = await banc();

    const reponse = await passer({});

    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(reponse.json().enabled).toBe(false);

    // Témoin : le compte est bien vu au stade de l'avertissement (sinon le test ne mesurerait rien).
    expect(reponse.json().warned).toBeGreaterThanOrEqual(1);

    // Mesuré AVANT correctif : 1 e-mail envoyé.
    expect(emails.envoyes).toEqual([]);

    await app.close();
  });

  it('contre-épreuve — suppression ACTIVE : l’avertissement part bien', async () => {
    const { app, emails, passer } = await banc();

    const reponse = await passer({ enabled: true });

    expect(reponse.statusCode, reponse.body).toBe(200);
    expect(emails.envoyes.map((message) => message.to)).toEqual(['inactif-340j@example.com']);

    await app.close();
  });
});
