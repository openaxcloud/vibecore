import { createHmac } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'packs@example.com',
    name: 'Pack User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Pack Org', slug: 'pack-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pack-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, org, token: 'pack-token' };
}

describe('Credit-pack purchase (Replit parity)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'packs-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'packs-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('POST /orgs/:orgId/credits/packs/checkout', () => {
    it('503s while the credit model is dormant (BILLING_CREDITS_ENABLED unset)', async () => {
      delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-300', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().code).toBe('CREDIT_PACKS_DISABLED');
      } finally {
        await app.close();
      }
    });

    it('400s for an unknown pack when enabled', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-999', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('CREDIT_PACK_UNKNOWN');
      } finally {
        await app.close();
      }
    });

    it('503s when the pack Stripe price id is not configured', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      delete (process.env as Record<string, string | undefined>).STRIPE_CREDIT_PACK_300_PRICE_ID;
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-300', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().code).toBe('CREDIT_PACK_PRICE_NOT_CONFIGURED');
      } finally {
        await app.close();
      }
    });
  });

  describe('checkout.session.completed (mode=payment) webhook', () => {
    it('grants the pack credit value with a 6-month expiry and skips the subscription path', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pack_grant';
      const { app, store, org } = await setup();

      const payload = JSON.stringify({
        id: 'evt_pack_grant',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_pack',
            mode: 'payment',
            customer: 'cus_pack',
            payment_status: 'paid',
            payment_intent: 'pi_pack',
            metadata: { organizationId: org.id, creditPackSku: 'pack-300' },
          },
        },
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: {
            'stripe-signature': stripeSignature(payload, 'whsec_pack_grant'),
            'content-type': 'application/json',
          },
          payload: Buffer.from(payload),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().creditPack).toBe(true);

        const packs = await store.listCreditPacks(org.id);
        expect(packs).toHaveLength(1);
        // $290 pack grants $300 of spendable credit (the $10 gap is the discount).
        expect(packs[0].remainingCents).toBe(30_000);
        const days = (new Date(packs[0].expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(days).toBeGreaterThan(170);
        expect(days).toBeLessThan(190);

        // a payment-mode session must NOT have created a subscription row
        expect(await store.getSubscription(org.id)).toBeUndefined();
      } finally {
        await app.close();
      }
    });

    it('does not grant a pack when the session is unpaid', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pack_unpaid';
      const { app, store, org } = await setup();

      const payload = JSON.stringify({
        id: 'evt_pack_unpaid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_pack_unpaid',
            mode: 'payment',
            customer: 'cus_pack_unpaid',
            payment_status: 'unpaid',
            metadata: { organizationId: org.id, creditPackSku: 'pack-300' },
          },
        },
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: {
            'stripe-signature': stripeSignature(payload, 'whsec_pack_unpaid'),
            'content-type': 'application/json',
          },
          payload: Buffer.from(payload),
        });
        expect(res.statusCode).toBe(200);
        expect(await store.listCreditPacks(org.id)).toHaveLength(0);
      } finally {
        await app.close();
      }
    });
  });

  describe('contrat Starter au publish : projets publiés ACTIFS', () => {
    async function publishableProject(store: any, orgId: string, name: string) {
      const project = await store.createProject({ organizationId: orgId, name, slug: name.toLowerCase() });
      const source = await store.createDeployment({
        projectId: project.id,
        expectedOrganizationId: project.organizationId,
        provider: 'static',
        environment: 'preview',
        status: 'READY',
        url: `https://${name.toLowerCase()}-preview.example/`,
      });

      return { project, source };
    }

    const publish = (app: any, token: string, projectId: string, deploymentId: string) =>
      app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${deploymentId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

    it('(a) publier le projet A est AUTORISÉ', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);
      } finally {
        await app.close();
      }
    });

    it('(b) republier A est AUTORISÉ, sans limite artificielle', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);

        // Trois republications successives du MÊME projet : toutes doivent passer.
        for (let i = 0; i < 3; i += 1) {
          const res = await publish(app, token, a.project.id, a.source.id);
          expect(res.statusCode).toBe(201);
        }
      } finally {
        await app.close();
      }
    });

    it('(c) publier un 2e projet DISTINCT est REFUSÉ, avec invitation à monter de plan', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);

        const b = await publishableProject(store, org.id, 'ProjB');
        const res = await publish(app, token, b.project.id, b.source.id);

        expect(res.statusCode).toBe(402);
        expect(res.json()).toMatchObject({
          code: 'PLAN_ACTIVE_PUBLISHED_PROJECT_LIMIT',
          plan: 'starter',
          cap: 1,
          upgradeRequired: true,
        });
      } finally {
        await app.close();
      }
    });

    it('(d) après expiration de A à 30 jours, republier est AUTORISÉ', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);

        // Vieillir toutes les publications de A au-delà du TTL Starter.
        const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        for (const deployment of store.deployments.values()) {
          if (deployment.projectId === a.project.id && deployment.environment === 'production') {
            (deployment as any).createdAt = old;
          }
        }

        // Le MÊME projet se republie...
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);

        // ...et un AUTRE projet redevient publiable une fois A expiré.
        const { app: app2, store: store2, org: org2, token: token2 } = await setup();
        try {
          const a2 = await publishableProject(store2, org2.id, 'ProjA');
          await publish(app2, token2, a2.project.id, a2.source.id);
          for (const deployment of store2.deployments.values()) {
            if (deployment.projectId === a2.project.id && deployment.environment === 'production') {
              (deployment as any).createdAt = old;
            }
          }
          const b2 = await publishableProject(store2, org2.id, 'ProjB');
          expect((await publish(app2, token2, b2.project.id, b2.source.id)).statusCode).toBe(201);
        } finally {
          await app2.close();
        }
      } finally {
        await app.close();
      }
    });

    it('(5) REJEU CONCURRENT : deux publications SIMULTANÉES -> exactement un 201 et un 402', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        const b = await publishableProject(store, org.id, 'ProjB');

        /*
         * Lancées SANS await intermédiaire : les deux requêtes sont en vol en
         * même temps. Sans section critique sérialisée, chacune lit « 0
         * publication active » et les DEUX passent — le plafond ne tient pas.
         */
        const [r1, r2] = await Promise.all([
          publish(app, token, a.project.id, a.source.id),
          publish(app, token, b.project.id, b.source.id),
        ]);

        const codes = [r1.statusCode, r2.statusCode].sort();
        expect(codes).toEqual([201, 402]);

        // …et la DB ne contient qu'UNE publication de production.
        const published = [...store.deployments.values()].filter(
          (d: any) => d.environment === 'production' && d.status === 'READY',
        );
        expect(published).toHaveLength(1);
      } finally {
        await app.close();
      }
    });

    it('(5bis) rejeu concurrent à 5 projets distincts -> un seul 201', async () => {
      const { app, store, org, token } = await setup();
      try {
        const projects = await Promise.all(
          ['P1', 'P2', 'P3', 'P4', 'P5'].map((n) => publishableProject(store, org.id, n)),
        );

        const results = await Promise.all(projects.map((p) => publish(app, token, p.project.id, p.source.id)));

        expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
        expect(results.filter((r) => r.statusCode === 402)).toHaveLength(4);
      } finally {
        await app.close();
      }
    });

    it('(2) FAIL-CLOSED : lecture des publications en erreur -> 503, jamais un quota remis a zero', async () => {
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        expect((await publish(app, token, a.project.id, a.source.id)).statusCode).toBe(201);

        // La lecture du quota tombe en panne au moment de publier un 2e projet.
        const b = await publishableProject(store, org.id, 'ProjB');
        store.listPublishedProjects = async () => {
          throw new Error('panne de lecture du quota');
        };

        const res = await publish(app, token, b.project.id, b.source.id);

        // Surtout PAS 201 : une panne ne doit pas ouvrir le quota.
        expect(res.statusCode).toBe(503);
        expect(res.json()).toMatchObject({ code: 'ENTITLEMENT_CHECK_UNAVAILABLE', retryable: true });

        // Et aucune publication supplémentaire n'a été créée.
        const published = [...store.deployments.values()].filter(
          (d: any) => d.environment === 'production' && d.status === 'READY',
        );
        expect(published).toHaveLength(1);
      } finally {
        await app.close();
      }
    });

    it("le contrat s'applique MÊME quand le modèle de crédits est dormant", async () => {
      delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
      const { app, store, org, token } = await setup();
      try {
        const a = await publishableProject(store, org.id, 'ProjA');
        await publish(app, token, a.project.id, a.source.id);
        const b = await publishableProject(store, org.id, 'ProjB');
        expect((await publish(app, token, b.project.id, b.source.id)).statusCode).toBe(402);
      } finally {
        await app.close();
      }
    });
  });
});
