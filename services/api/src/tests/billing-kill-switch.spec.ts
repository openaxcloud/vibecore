import { hashPassword } from '@vibecore/auth';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * KILL-SWITCH FACTURATION — preuve de bout en bout sur une VRAIE app Fastify.
 *
 * Le reste de la suite tourne drapeau ARMÉ (voir `billing-flag-setup.ts`), pour
 * continuer à prouver que l'encaissement fonctionne — c'est la garantie de
 * réversibilité. Ce fichier fait l'inverse : il monte l'app avec la facturation
 * ÉTEINTE et vérifie qu'aucun chemin de paiement n'est atteignable.
 *
 * Chaque test construit son app APRÈS avoir posé la variable : le drapeau est
 * résolu au montage, délibérément, pour qu'une bascule de configuration ne
 * puisse pas ouvrir la caisse à chaud au milieu d'un flux.
 */

class TestEmailProvider implements EmailProvider {
  async send() {}
}

const previous = process.env.BILLING_ENABLED;

/** Monte une app avec la facturation dans l'état demandé. */
async function setup(billing: 'on' | 'off' | 'absent') {
  if (billing === 'absent') {
    delete process.env.BILLING_ENABLED;
  } else {
    process.env.BILLING_ENABLED = billing === 'on' ? 'true' : 'false';
  }

  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'free@example.com',
    name: 'Free User',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Free Org', slug: 'free-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'free-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, org, auth: { authorization: 'Bearer free-token' } };
}

afterEach(() => {
  if (previous === undefined) {
    delete process.env.BILLING_ENABLED;
  } else {
    process.env.BILLING_ENABLED = previous;
  }
});

describe('à OFF, aucun endpoint de paiement n_est atteignable', () => {
  /** [méthode, chemin] — les surfaces qui encaissent ou administrent la caisse. */
  const PAYMENT_ENDPOINTS: Array<[string, (orgId: string) => string]> = [
    ['POST', (o) => `/orgs/${o}/billing/checkout`],
    ['POST', (o) => `/orgs/${o}/billing/portal`],
    ['GET', (o) => `/orgs/${o}/billing/invoices`],
    ['GET', (o) => `/orgs/${o}/billing`],
    ['POST', (o) => `/orgs/${o}/credits/packs/checkout`],
    ['GET', (o) => `/orgs/${o}/credits`],
    ['POST', () => '/billing/stripe/webhook'],
    ['GET', () => '/admin/billing'],
    ['GET', () => '/admin/stripe-config'],
    ['GET', () => '/admin/wallets'],
  ];

  for (const [method, path] of PAYMENT_ENDPOINTS) {
    it(`${method} ${path('ORG')} → 404`, async () => {
      const { app, org, auth } = await setup('off');

      const response = await app.inject({
        method: method as never,
        url: path(org.id),
        headers: auth,
        ...(method === 'POST' ? { payload: {} } : {}),
      });

      expect(response.statusCode, response.body.slice(0, 200)).toBe(404);
      await app.close();
    });
  }

  it('le webhook Stripe est refusé AVANT toute vérification de signature', async () => {
    /*
     * La garde est posée en `onRequest` : ni corps parsé, ni signature vérifiée,
     * ni handler exécuté. Un webhook non signé obtient donc le même 404 qu'un
     * webhook signé — la route n'existe pas, elle ne « refuse » pas.
     */
    const { app } = await setup('off');

    const response = await app.inject({
      method: 'POST',
      url: '/billing/stripe/webhook',
      headers: { 'stripe-signature': 'signature-bidon' },
      payload: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('signature');
    await app.close();
  });

  it('le refus est un 404, jamais un 403 : la route ne doit pas se trahir', async () => {
    const { app, org, auth } = await setup('off');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/billing/checkout`,
      headers: auth,
      payload: { plan: 'pro' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.statusCode).not.toBe(403);
    await app.close();
  });
});

describe('FAIL-CLOSED — variable absente vaut OFF', () => {
  it('sans BILLING_ENABLED du tout, le checkout est injoignable', async () => {
    /*
     * Le cas qui compte le jour d'un déploiement où la variable a été oubliée :
     * l'absence ne doit pas ouvrir la caisse.
     */
    const { app, org, auth } = await setup('absent');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/billing/checkout`,
      headers: auth,
      payload: { plan: 'pro' },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('une valeur inattendue vaut OFF (faute de frappe dans la configuration)', async () => {
    process.env.BILLING_ENABLED = 'ture';

    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

    const user = await store.createUser({
      email: 'typo@example.com',
      name: 'Typo',
      passwordHash: hashPassword('password123'),
    });

    const org = await store.createOrganization({ name: 'Typo Org', slug: 'typo-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'typo-token', expiresAt: new Date(Date.now() + 3600_000) });

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/billing/checkout`,
      headers: { authorization: 'Bearer typo-token' },
      payload: { plan: 'pro' },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('RÉVERSIBILITÉ — à ON, les surfaces réapparaissent', () => {
  it('le checkout n_est plus un 404 quand la facturation est activée', async () => {
    /*
     * On ne teste pas ici que l'encaissement aboutit — le reste de la suite s'en
     * charge, drapeau armé. On teste que la GARDE s'efface : sans cela, le
     * kill-switch serait un aller sans retour.
     */
    const { app, org, auth } = await setup('on');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/billing/checkout`,
      headers: auth,
      payload: { plan: 'pro' },
    });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });

  it('les surfaces admin de facturation réapparaissent aussi', async () => {
    const { app, auth } = await setup('on');

    const response = await app.inject({ method: 'GET', url: '/admin/billing', headers: auth });

    expect(response.statusCode).not.toBe(404);
    await app.close();
  });
});

describe('le parcours GRATUIT n_est bloqué par aucun compteur', () => {
  it('les routes de produit restent accessibles à OFF', async () => {
    /*
     * La contrepartie du kill-switch : couper la caisse ne doit pas couper la
     * plateforme. Ces routes ne doivent jamais répondre 402/403 pour cause de
     * quota, ni disparaître avec les surfaces de paiement.
     */
    const { app, org, auth } = await setup('off');

    for (const url of ['/orgs', `/orgs/${org.id}/projects`]) {
      const response = await app.inject({ method: 'GET', url, headers: auth });

      expect([200, 204], `${url} → ${response.statusCode}`).toContain(response.statusCode);
    }

    await app.close();
  });

  it('la télémétrie d_usage reste vivante — on mesure sans barrer', async () => {
    const { app, org, auth } = await setup('off');

    const response = await app.inject({ method: 'GET', url: `/orgs/${org.id}/usage`, headers: auth });

    // `usage` n'encaisse rien : la route survit au kill-switch.
    expect(response.statusCode).not.toBe(404);
    await app.close();
  });
});
