import { createHmac } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- API service imports do not use the web alias.
import { buildApiApp } from '../app.js';

import { TestApiStore } from './test-api-store.js';
afterEach(() => vi.unstubAllEnvs());
it('does not duplicate credit after audit failure and webhook retry', async () => {
  const secret = 'isolated-credit-pack-retry-fixture';
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);

  const store = new TestApiStore();

  const app = await buildApiApp({
    store,
    emailProvider: {
      async send() {
        return undefined;
      },
    },
  });

  try {
    const user = await store.createUser({ email: 'isolated-pack-retry@example.invalid', passwordHash: 'unused' });
    const org = await store.createOrganization({ name: 'Isolated', slug: 'isolated-pack-retry', ownerUserId: user.id });
    const recordAudit = store.recordAudit.bind(store);

    let failOnce = true;

    store.recordAudit = async (input) => {
      if (input.action === 'billing.creditpack.granted' && failOnce) {
        failOnce = false;
        throw new Error('synthetic audit failure after credit grant');
      }

      return recordAudit(input);
    };

    const timestamp = Math.floor(Date.now() / 1000);

    const payload = JSON.stringify({
      id: 'evt_isolated_pack_retry',
      created: timestamp,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_isolated_pack',
          mode: 'payment',
          payment_status: 'paid',
          payment_intent: 'pi_isolated_pack',
          metadata: { organizationId: org.id, creditPackSku: 'pack-300' },
        },
      },
    });

    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

    const deliver = () =>
      app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
        payload: Buffer.from(payload),
      });

    // Legacy crash marker: pack routing must resume before generic event deduplication.
    await store.recordStripeEvent({
      id: 'evt_isolated_pack_retry',
      organizationId: org.id,
      type: 'checkout.session.completed',
      payload: JSON.parse(payload),
    });
    expect((await deliver()).statusCode).toBe(500);
    expect(await store.listCreditPacks(org.id)).toHaveLength(1);
    expect((await deliver()).statusCode).toBe(200);
    expect(await store.listCreditPacks(org.id)).toHaveLength(1);

    const event = JSON.parse(payload);
    event.id = 'evt_same_purchase_different_event';
    event.created += 100;

    async function sendChanged(locale = 'en') {
      const body = JSON.stringify(event);
      const hmac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

      return app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': `t=${timestamp},v1=${hmac}`,
          'accept-language': locale,
        },
        payload: Buffer.from(body),
      });
    }
    expect((await sendChanged()).statusCode).toBe(200);
    expect(await store.listCreditPacks(org.id)).toHaveLength(1);

    const persistedPack = (await store.listCreditPacks(org.id))[0];

    const confirmations = (await store.listAuditLogs(org.id)).filter(
      (entry) => entry.action === 'billing.creditpack.confirmed',
    );
    expect(confirmations).toHaveLength(2);

    for (const confirmation of confirmations) {
      expect(confirmation).toMatchObject({
        resourceId: persistedPack.id,
        metadata: { creditCents: 30000, expiresAt: persistedPack.expiresAt, created: false },
      });
    }
    event.data.object.payment_status = 'no_payment_required';
    delete event.data.object.payment_intent;

    const conflict = await sendChanged();
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      code: 'CREDIT_PACK_PURCHASE_CONFLICT',
      error:
        'This payment needs manual verification before credits can be confirmed. Contact support; do not purchase again.',
    });
    expect((await sendChanged('fr')).json().error).toBe(
      'Ce paiement nécessite une vérification manuelle avant confirmation des crédits. Contactez l’assistance ; ne refaites pas l’achat.',
    );
    expect(await store.listCreditPacks(org.id)).toHaveLength(1);
    event.data.object.id = 'cs_new_coupon';
    expect((await sendChanged()).statusCode).toBe(200);
    expect((await sendChanged()).statusCode).toBe(200);
    expect(await store.listCreditPacks(org.id)).toHaveLength(2);
  } finally {
    await app.close();
  }
});
