import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

/*
 * BUG-QA1001-ANNUEL-FACTURE-AU-MOIS — mesuré le 2026-10-01 en lisant la base de
 * production (lecture seule) et le code du paiement :
 *   - le forfait Pro n'a AUCUN prix annuel ; le paiement prenait alors
 *     `stripePriceAnnualId ?? stripePriceMonthlyId ?? …` : le client qui
 *     choisissait « annuel » (et lisait 278,40 €/an) partait sur le prix MENSUEL ;
 *   - le prix annuel du forfait Team contient une ADRESSE E-MAIL : elle partait
 *     telle quelle chez Stripe comme identifiant de prix, et la recopie au
 *     démarrage (`seedBillingPlans`) la conservait pour toujours.
 *
 * Décision d'Avi du 2026-10-01 : annuel = mensuel − 20 %. Un paiement annuel ne
 * peut donc JAMAIS retomber sur un prix mensuel.
 *
 * Vraie API, vrai client Stripe, contre un serveur HTTP local qui joue Stripe et
 * enregistre ce qu'on lui envoie.
 */

let fermetures: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const fermer of fermetures.reverse()) {
    await fermer();
  }

  fermetures = [];
});

async function banc(options: { env?: Record<string, string>; avant?: (store: TestApiStore) => Promise<void> } = {}) {
  const recus: Array<{ url?: string; corps: Record<string, string> }> = [];

  const stripe: Server = createServer((requete, reponse) => {
    let brut = '';
    requete.on('data', (morceau) => (brut += morceau.toString()));
    requete.on('end', () => {
      recus.push({ url: requete.url, corps: Object.fromEntries(new URLSearchParams(brut).entries()) });
      reponse.setHeader('content-type', 'application/json');

      if (requete.url === '/v1/customers') {
        reponse.end(JSON.stringify({ id: 'cus_annuel' }));

        return;
      }

      if (requete.url === '/v1/checkout/sessions') {
        reponse.end(JSON.stringify({ id: 'cs_annuel', url: 'https://checkout.stripe.local/session' }));

        return;
      }

      reponse.statusCode = 404;
      reponse.end(JSON.stringify({ error: { message: 'not found' } }));
    });
  });

  await new Promise<void>((resolve) => stripe.listen(0, '127.0.0.1', () => resolve()));

  const env: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_annuel',
    STRIPE_API_BASE_URL: `http://127.0.0.1:${(stripe.address() as { port: number }).port}`,
    STRIPE_PRO_PRICE_MONTHLY_ID: 'price_pro_mensuel',
    STRIPE_TEAM_PRICE_MONTHLY_ID: 'price_team_mensuel',
    ...options.env,
  };
  const precedent = Object.fromEntries(Object.keys(env).map((cle) => [cle, process.env[cle]]));
  Object.assign(process.env, env);

  const store = new TestApiStore();
  await options.avant?.(store);

  const app = await buildApiApp({ store });

  fermetures.push(async () => {
    await app.close();
    await new Promise<void>((resolve) => stripe.close(() => resolve()));

    for (const [cle, valeur] of Object.entries(precedent)) {
      if (valeur === undefined) {
        delete process.env[cle];
      } else {
        process.env[cle] = valeur;
      }
    }
  });

  const inscription = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `annuel-${Math.random().toString(36).slice(2, 10)}@example.com`,
      password: 'password123',
      name: 'Annuel',
      organizationName: 'Annuel',
    },
  });
  const { token, organization } = inscription.json() as { token: string; organization: { id: string } };

  const payer = (planKey: 'pro' | 'team', interval: 'monthly' | 'annual') =>
    app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/billing/checkout`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        planKey,
        interval,
        successUrl: 'https://app.example.com/ok',
        cancelUrl: 'https://app.example.com/annule',
      },
    });

  const prixEnvoyes = () =>
    recus.filter((r) => r.url === '/v1/checkout/sessions').map((r) => r.corps['line_items[0][price]']);

  return { payer, prixEnvoyes, store };
}

describe('paiement annuel : jamais facturé au prix mensuel, jamais un identifiant qui n’est pas un prix', () => {
  it('annuel demandé, aucun prix annuel configuré : refus clair, et RIEN n’est envoyé à Stripe', async () => {
    const { payer, prixEnvoyes } = await banc();

    const reponse = await payer('pro', 'annual');

    // Mesuré AVANT correctif : 200, session créée sur price_pro_mensuel.
    expect(reponse.statusCode, reponse.body).toBe(503);
    expect(reponse.json().code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
    expect(prixEnvoyes()).toEqual([]);
  });

  it('TÉMOIN — annuel configuré : c’est bien le prix ANNUEL qui part ; le mensuel reste le mensuel', async () => {
    const { payer, prixEnvoyes } = await banc({ env: { STRIPE_PRO_PRICE_ANNUAL_ID: 'price_pro_annuel' } });

    expect((await payer('pro', 'annual')).statusCode).toBe(200);
    expect(prixEnvoyes()).toEqual(['price_pro_annuel']);
  });

  it('une valeur qui n’est pas un identifiant de prix (une adresse e-mail, mesurée en production) n’est jamais envoyée à Stripe', async () => {
    const { payer, prixEnvoyes, store: magasin } = await banc({
      avant: async (store) => {
        await store.upsertBillingPlan({
          key: 'team',
          name: 'Team',
          monthlyCents: 9900,
          limits: {},
          stripePriceId: 'price_team_mensuel',
          stripePriceMonthlyId: 'price_team_mensuel',
          stripePriceAnnualId: 'quelquun@example.com',
        });
      },
    });

    // La recopie au démarrage ne conserve plus l'adresse e-mail comme « édition d'admin ».
    expect(String((await magasin.getBillingPlan('team'))?.stripePriceAnnualId ?? '')).not.toMatch(/@/);

    const annuel = await payer('team', 'annual');

    expect(annuel.statusCode, annuel.body).toBe(503);
    expect(annuel.json().code).toBe('STRIPE_PRICE_NOT_CONFIGURED');
    expect(prixEnvoyes()).toEqual([]);

    // Le mensuel, lui, fonctionne.
    expect((await payer('team', 'monthly')).statusCode).toBe(200);
    expect(prixEnvoyes()).toEqual(['price_team_mensuel']);
  });
});
