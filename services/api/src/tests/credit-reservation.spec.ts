import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-018 — reserve credits BEFORE the provider call.
 *
 * The metering path debits only when usage is REPORTED, i.e. after the call has
 * already cost money. Two consequences, both of which are money:
 *
 *  1. A report that never arrives — crash, closed tab, or a caller that simply
 *     omits it — is free AI.
 *  2. N concurrent calls each clear the same pre-check and collectively spend
 *     past the balance.
 *
 * A hold moves the decision before the spend. The decisive property is that the
 * check and the hold are ONE atomic step; everything else here protects the
 * ordinary path from the hold itself (rule 19).
 */
const ORG = 'org_credit';

let store: TestApiStore;

beforeEach(async () => {
  store = new TestApiStore();
  await store.ensureCreditWallet(ORG);
});

afterEach(() => {
  // no global state
});

async function fund(cents: number) {
  const wallet = await store.ensureCreditWallet(ORG);
  wallet.balanceCents = cents;
}

describe('AUDX-018 atomic credit reservation', () => {
  it('holds credits and reduces what remains available', async () => {
    await fund(1000);

    const held = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 400,
      expiresAtMs: Date.now() + 60_000,
    });

    expect(held?.amountCents).toBe(400);

    // A second hold may only take what is left after the first.
    const second = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 700,
      expiresAtMs: Date.now() + 60_000,
    });

    expect(second).toBeUndefined();
  });

  it('refuses a hold larger than the balance', async () => {
    await fund(100);

    await expect(
      store.reserveCredits({ organizationId: ORG, amountCents: 101, expiresAtMs: Date.now() + 60_000 }),
    ).resolves.toBeUndefined();
  });

  /*
   * THE test. Ten callers race for a balance that covers only five. Under the
   * old read-then-decide shape they would all observe the same balance and all
   * proceed. Exactly five must win.
   */
  it('never over-commits under concurrency', async () => {
    await fund(500);

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.reserveCredits({ organizationId: ORG, amountCents: 100, expiresAtMs: Date.now() + 60_000 }),
      ),
    );

    expect(attempts.filter(Boolean)).toHaveLength(5);
    expect(store.heldCents.get(ORG)).toBe(500);
  });

  it('frees the hold when a reservation is released', async () => {
    await fund(500);

    const held = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 500,
      expiresAtMs: Date.now() + 60_000,
    });

    await store.releaseCreditReservation({ id: held!.id });

    expect(store.heldCents.get(ORG)).toBe(0);

    // The freed amount is reservable again.
    await expect(
      store.reserveCredits({ organizationId: ORG, amountCents: 500, expiresAtMs: Date.now() + 60_000 }),
    ).resolves.toBeTruthy();
  });

  /*
   * Double-release is the money bug of this design: settle racing the expiry
   * sweep would otherwise give the credits back twice and inflate the balance.
   */
  it('cannot release the same hold twice', async () => {
    await fund(500);

    const held = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 300,
      expiresAtMs: Date.now() + 60_000,
    });

    await expect(store.releaseCreditReservation({ id: held!.id })).resolves.toBe(true);
    await expect(store.releaseCreditReservation({ id: held!.id })).resolves.toBe(false);
    expect(store.heldCents.get(ORG)).toBe(0);
  });

  it('cannot settle a hold twice', async () => {
    await fund(500);

    const held = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 300,
      expiresAtMs: Date.now() + 60_000,
    });

    await expect(store.settleCreditReservation({ id: held!.id, actualCents: 120 })).resolves.toBe(true);
    await expect(store.settleCreditReservation({ id: held!.id, actualCents: 120 })).resolves.toBe(false);
    expect(store.heldCents.get(ORG)).toBe(0);
  });

  it('cannot settle a hold that was already released', async () => {
    await fund(500);

    const held = await store.reserveCredits({
      organizationId: ORG,
      amountCents: 300,
      expiresAtMs: Date.now() + 60_000,
    });

    await store.releaseCreditReservation({ id: held!.id });

    await expect(store.settleCreditReservation({ id: held!.id, actualCents: 300 })).resolves.toBe(false);
    expect(store.heldCents.get(ORG)).toBe(0);
  });

  /*
   * Rule 19, and the reason the sweep exists at all: a crashed request must not
   * strand a user's credits. Without reclamation the wallet slowly stops being
   * able to reserve anything — an outage caused by the guard.
   */
  it('reclaims abandoned holds so a crashed request cannot strand credits', async () => {
    await fund(500);
    await store.reserveCredits({ organizationId: ORG, amountCents: 500, expiresAtMs: Date.now() - 1 });

    expect(store.heldCents.get(ORG)).toBe(500);

    const released = await store.releaseExpiredCreditReservations(Date.now());

    expect(released).toBe(1);
    expect(store.heldCents.get(ORG)).toBe(0);
  });

  it('does not reclaim a hold that has not expired', async () => {
    await fund(500);
    await store.reserveCredits({ organizationId: ORG, amountCents: 500, expiresAtMs: Date.now() + 60_000 });

    await expect(store.releaseExpiredCreditReservations(Date.now())).resolves.toBe(0);
    expect(store.heldCents.get(ORG)).toBe(500);
  });

  it('treats a zero or negative amount as nothing to hold', async () => {
    await fund(500);

    await expect(
      store.reserveCredits({ organizationId: ORG, amountCents: 0, expiresAtMs: Date.now() + 60_000 }),
    ).resolves.toBeUndefined();
    expect(store.heldCents.get(ORG) ?? 0).toBe(0);
  });
});

/*
 * Route-level behaviour: the hold has to be taken on the real preflight path,
 * settled on the real reporting path, and — most importantly — be completely
 * invisible while credits are dormant.
 */
describe('AUDX-018 reservation wiring on the AI routes', () => {
  const previousEnabled = process.env.BILLING_CREDITS_ENABLED;

  afterEach(() => {
    if (previousEnabled === undefined) {
      delete process.env.BILLING_CREDITS_ENABLED;
    } else {
      process.env.BILLING_CREDITS_ENABLED = previousEnabled;
    }
  });

  async function setup(balanceCents: number) {
    const { hashPassword } = await import('@vibecore/auth');
    const { buildApiApp } = await import('../app.js');

    const apiStore = new TestApiStore();

    const app = await buildApiApp({
      store: apiStore,
      emailProvider: { async send() {} },
    });
    const user = await apiStore.createUser({
      email: 'res@example.com',
      name: 'Res',
      passwordHash: hashPassword('password123'),
    });

    const org = await apiStore.createOrganization({ name: 'Res Org', slug: 'res-org', ownerUserId: user.id });
    await apiStore.createSession({ userId: user.id, token: 'tok', expiresAt: new Date(Date.now() + 3600_000) });

    const project = await apiStore.createProject({ organizationId: org.id, name: 'P', slug: 'p' });
    const wallet = await apiStore.ensureCreditWallet(org.id);
    wallet.balanceCents = balanceCents;

    return { app, apiStore, org, project };
  }

  function checkQuota(app: any, projectId: string) {
    return app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/check-quota`,
      headers: { authorization: 'Bearer tok' },
      payload: { estimatedInputTokens: 1000, model: 'claude-sonnet-5', provider: 'anthropic' },
    });
  }

  /*
   * The rule-19 test, and the one that decides whether this can ship at all.
   * Credits are ~90% SHADOW today: if the hold were enforced while the wallet is
   * dormant, every chat on the platform would be refused.
   */
  it('is completely inert while credits are dormant', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;

    const { app, apiStore, org, project } = await setup(0);

    const response = await checkQuota(app, project.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().reservationId).toBeUndefined();
    expect(apiStore.heldCents.get(org.id) ?? 0).toBe(0);
  });

  it('takes a hold and returns its id when credits are enabled', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const { app, apiStore, org, project } = await setup(100_000);

    const response = await checkQuota(app, project.id);

    expect(response.statusCode).toBe(200);
    expect(response.json().reservationId).toBeTruthy();
    expect(apiStore.heldCents.get(org.id) ?? 0).toBeGreaterThan(0);
  });

  /* Refusing BEFORE the provider call is the entire point. */
  it('refuses the request when no credits can be held', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const { app, project } = await setup(0);

    const response = await checkQuota(app, project.id);

    expect(response.statusCode).toBe(402);
    expect(response.json().code).toBe('CREDITS_RESERVATION_REFUSED');
  });

  /*
   * Settling releases the hold. Without it a busy project's available credits
   * shrink with every message until it can start nothing — the guard becoming
   * the outage.
   */
  it('releases the hold when usage is reported', async () => {
    process.env.BILLING_CREDITS_ENABLED = 'true';

    const { app, apiStore, org, project } = await setup(100_000);

    const reservationId = checkQuotaId(await checkQuota(app, project.id));
    expect(apiStore.heldCents.get(org.id) ?? 0).toBeGreaterThan(0);

    const report = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/ai/record-usage`,
      headers: { authorization: 'Bearer tok' },
      payload: {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        inputTokens: 1000,
        outputTokens: 200,
        reservationId,
      },
    });

    expect(report.statusCode).toBe(200);
    expect(apiStore.heldCents.get(org.id) ?? 0).toBe(0);
  });

  function checkQuotaId(response: { json: () => { reservationId?: string } }) {
    return response.json().reservationId;
  }
});
