/**
 * D4 phase 1 — billing minimal de sûreté: the required NEGATIVE proofs.
 * What the system REFUSES matters more than what it accepts:
 *
 *   N1  a billable operation without a reservation → refused;
 *   N2  replaying the same idempotency key → ONE reservation, never two;
 *   N3  cancel / timeout / post-commit failure → compensation, correct balance;
 *   N4  hard limit reached mid-atomic-commit → the commit FINISHES, the cut
 *       happens at the next safe boundary (and the debit is ceiling-clamped);
 *   N5  mutating a UsageEvent → refused (append-only; corrections are
 *       compensating ledger entries).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  UsageReservationError,
  commitReservation,
  compensateReservation,
  evaluateBoundary,
  expireUsageReservations,
  refuseUsageEventMutation,
  releaseReservation,
  requireActiveReservation,
  reserveUsage,
} from '../usage-reservation-service.js';
import { TestApiStore } from './test-api-store.js';

const NOW = 2_000_000_000_000;
const HOUR = 60 * 60 * 1000;
const ORG = 'org_billing';

const originalFlag = process.env.BILLING_CREDITS_ENABLED;

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.BILLING_CREDITS_ENABLED;
  } else {
    process.env.BILLING_CREDITS_ENABLED = originalFlag;
  }
});

function enforced() {
  process.env.BILLING_CREDITS_ENABLED = 'true';
}

async function grant(store: TestApiStore, cents: number) {
  await store.recordCreditEntry({ organizationId: ORG, deltaCents: cents, kind: 'GRANT', reason: 'test grant' });
}

async function balance(store: TestApiStore) {
  return (await store.ensureCreditWallet(ORG)).balanceCents;
}

function baseReservation(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    idempotencyKey: 'import:job_1',
    operation: 'import',
    maxAmountCents: 500,
    ttlMs: HOUR,
    importJobId: 'job_1',
    nowMs: NOW,
    ...overrides,
  };
}

describe('N1 — no reservation, no start (structural, enforced even in SHADOW)', () => {
  it('refuses a billable step with no reservation at all', async () => {
    const store = new TestApiStore();

    await expect(
      requireActiveReservation(store, { organizationId: ORG, importJobId: 'job_none', nowMs: NOW }),
    ).rejects.toMatchObject({ code: 'RESERVATION_REQUIRED', statusCode: 402 });
  });

  it('refuses when the reservation exists but is no longer ACTIVE', async () => {
    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());
    await releaseReservation(store, { reservationId: reservation.id, reason: 'cancel', nowMs: NOW });

    await expect(
      requireActiveReservation(store, { organizationId: ORG, importJobId: 'job_1', nowMs: NOW }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_ACTIVE', statusCode: 409 });
  });

  it("refuses an EXPIRED hold and stamps it (a stale hold isn't a licence)", async () => {
    const store = new TestApiStore();
    const { reservation } = await reserveUsage(store, baseReservation());

    await expect(
      requireActiveReservation(store, { organizationId: ORG, importJobId: 'job_1', nowMs: NOW + 2 * HOUR }),
    ).rejects.toMatchObject({ code: 'RESERVATION_EXPIRED', statusCode: 409 });

    expect((await store.getUsageReservation(reservation.id))?.status).toBe('EXPIRED');
  });

  it('refuses a reservation belonging to another organization', async () => {
    const store = new TestApiStore();
    await reserveUsage(store, baseReservation());

    await expect(
      requireActiveReservation(store, { organizationId: 'org_other', importJobId: 'job_1', nowMs: NOW }),
    ).rejects.toMatchObject({ code: 'RESERVATION_REQUIRED' });
  });
});

describe('N2 — idempotency: one key, one reservation', () => {
  it('replaying the same key returns the SAME hold, never a second one', async () => {
    const store = new TestApiStore();

    const first = await reserveUsage(store, baseReservation());
    const replay = await reserveUsage(store, baseReservation({ maxAmountCents: 9_999 }));

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.reservation.id).toBe(first.reservation.id);

    // The replay did NOT silently raise the authorized ceiling.
    expect(replay.reservation.maxAmountCents).toBe(500);
    expect(await store.listUsageReservations(ORG)).toHaveLength(1);
  });

  it('replaying a commit debits exactly once', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());

    const first = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 300,
      reason: 'import',
      nowMs: NOW,
    });
    const replay = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 300,
      reason: 'import',
      nowMs: NOW,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.committedCents).toBe(300);
    expect(await balance(store)).toBe(700); // debited once, not twice
  });
});

describe('N3 — cancel / timeout / failure: compensation, correct balance', () => {
  it('cancel before commit releases the hold; balance untouched (debit is post-step only)', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());
    expect(await balance(store)).toBe(1_000); // the hold itself never debits

    const released = await releaseReservation(store, { reservationId: reservation.id, reason: 'cancel', nowMs: NOW });

    expect(released.released).toBe(true);
    expect(released.reservation?.status).toBe('RELEASED');
    expect(await balance(store)).toBe(1_000);
    expect(await store.listCreditLedgerByReservation(reservation.id)).toHaveLength(0);
  });

  it('timeout sweep expires abandoned holds; balance untouched', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());
    const reaped = await expireUsageReservations(store, NOW + 2 * HOUR);

    expect(reaped.map((r) => r.id)).toContain(reservation.id);
    expect((await store.getUsageReservation(reservation.id))?.status).toBe('EXPIRED');
    expect((await store.getUsageReservation(reservation.id))?.releaseReason).toBe('timeout');
    expect(await balance(store)).toBe(1_000);
  });

  it('post-commit failure compensates with an OPPOSITE ledger entry — balance restored, history intact', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());
    await commitReservation(store, { reservationId: reservation.id, actualCents: 400, reason: 'import', nowMs: NOW });
    expect(await balance(store)).toBe(600);

    const compensation = await compensateReservation(store, {
      reservationId: reservation.id,
      reason: 'rollback after debit',
      nowMs: NOW + 1,
    });

    expect(compensation.compensated).toBe(true);
    expect(compensation.refundedCents).toBe(400);
    expect(await balance(store)).toBe(1_000); // solde correct

    // The correction APPENDED — the original debit is still there, untouched.
    const entries = await store.listCreditLedgerByReservation(reservation.id);
    expect(entries.map((e) => [e.kind, e.deltaCents])).toEqual([
      ['CONSUMPTION', -400],
      ['REFUND', 400],
    ]);

    // Compensating twice refunds nothing more.
    const again = await compensateReservation(store, {
      reservationId: reservation.id,
      reason: 'double',
      nowMs: NOW + 2,
    });
    expect(again.compensated).toBe(false);
    expect(await balance(store)).toBe(1_000);
  });

  it('refuses to compensate a hold that never committed (release is the right tool)', async () => {
    const store = new TestApiStore();
    const { reservation } = await reserveUsage(store, baseReservation());

    await expect(
      compensateReservation(store, { reservationId: reservation.id, reason: 'wrong tool', nowMs: NOW }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_COMMITTED', statusCode: 409 });
  });

  it('refuses to open a hold the org cannot cover (enforced mode)', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 100);

    await expect(reserveUsage(store, baseReservation({ maxAmountCents: 500 }))).rejects.toMatchObject({
      code: 'RESERVATION_INSUFFICIENT_CREDITS',
      statusCode: 402,
    });
    expect(await store.listUsageReservations(ORG)).toHaveLength(0);
  });
});

describe('N4 — hard limit cuts at a SAFE BOUNDARY, never inside an atomic commit', () => {
  it('the ceiling refusal happens BEFORE the atomic step; a started step always finishes', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation({ maxAmountCents: 100 }));

    /*
     * Simulated two-step operation. Step 1 is an ATOMIC commit: once entered,
     * it runs to the end even though the ceiling is crossed halfway through —
     * the limit check lives at the boundaries, not inside.
     */
    const journal: string[] = [];

    let spentSoFar = 0;

    const boundary1 = evaluateBoundary({ reservation, spentSoFarCents: spentSoFar, nextStepMaxCents: 80 });
    expect(boundary1.proceed).toBe(true);

    // --- atomic step: NO boundary evaluation inside ---
    journal.push('step1:start');
    spentSoFar += 80; // cost accrues...
    spentSoFar += 60; // ...and crosses the 100c ceiling MID-step (total 140)
    journal.push('step1:done'); // the step still completes — never cut here
    // --- end atomic step ---

    expect(journal).toEqual(['step1:start', 'step1:done']);

    // The NEXT boundary is where the limit cuts.
    const boundary2 = evaluateBoundary({ reservation, spentSoFarCents: spentSoFar, nextStepMaxCents: 1 });
    expect(boundary2.wouldBlock).toBe(true);
    expect(boundary2.proceed).toBe(false);
    expect(boundary2.remainingCents).toBe(0);
  });

  it('the committed debit is CLAMPED to the ceiling — overflow is recorded, never charged', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation({ maxAmountCents: 100 }));

    const result = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 140, // what the mid-step overrun actually cost
      reason: 'import',
      nowMs: NOW,
    });

    expect(result.committedCents).toBe(100); // never above what was authorized
    expect(result.overflowCents).toBe(40); // visible, not silently lost
    expect(await balance(store)).toBe(900);

    const event = [...store.usageEvents.values()].find((e) => e.id === result.usageEventId);
    expect((event?.metadata as { overflowCents: number }).overflowCents).toBe(40);
  });

  it('in SHADOW the boundary reports wouldBlock without blocking (advisory)', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;

    const store = new TestApiStore();
    const { reservation } = await reserveUsage(store, baseReservation({ maxAmountCents: 10 }));
    const boundary = evaluateBoundary({ reservation, spentSoFarCents: 0, nextStepMaxCents: 50 });

    expect(boundary.wouldBlock).toBe(true);
    expect(boundary.proceed).toBe(true);
  });
});

describe('N5 — UsageEvent is append-only', () => {
  it('the mutation API refuses and redirects to compensation', () => {
    expect(() => refuseUsageEventMutation()).toThrowError(UsageReservationError);

    try {
      refuseUsageEventMutation();
    } catch (error) {
      expect((error as UsageReservationError).code).toBe('USAGE_EVENT_IMMUTABLE');
      expect((error as UsageReservationError).statusCode).toBe(409);
    }
  });

  it('the store surface exposes NO UsageEvent mutation (and the DB trigger backs it)', () => {
    const store = new TestApiStore();

    /*
     * ApiStore deliberately has no update/delete for usage events — asserted
     * here so adding one becomes a failing test and a conscious decision. At
     * the database level migration 0076 installs the `usage_event_immutable`
     * trigger, which raises on UPDATE and DELETE.
     */
    expect((store as Record<string, unknown>).updateUsageEvent).toBeUndefined();
    expect((store as Record<string, unknown>).deleteUsageEvent).toBeUndefined();
  });

  it('a correction after commit leaves the original event and appends ledger entries', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());

    const commit = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 200,
      reason: 'import',
      nowMs: NOW,
    });

    const before = [...store.usageEvents.values()].find((e) => e.id === commit.usageEventId);
    await compensateReservation(store, { reservationId: reservation.id, reason: 'correction', nowMs: NOW + 1 });

    const after = [...store.usageEvents.values()].find((e) => e.id === commit.usageEventId);

    expect(after).toEqual(before); // the event did not move by one byte
    expect((await store.listCreditLedgerByReservation(reservation.id)).length).toBe(2);
  });
});

describe('correlation and the money-vs-credits fault line', () => {
  it('correlates importJobId ↔ reservationId ↔ ledgerEntryId end to end', async () => {
    enforced();

    const store = new TestApiStore();
    await grant(store, 1_000);

    const { reservation } = await reserveUsage(store, baseReservation());

    const commit = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 250,
      reason: 'import',
      nowMs: NOW,
    });

    expect(reservation.importJobId).toBe('job_1');

    const entries = await store.listCreditLedgerByReservation(reservation.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].reservationId).toBe(reservation.id);
    expect(commit.ledgerEntryIds).toEqual([entries[0].id]);

    const event = [...store.usageEvents.values()].find((e) => e.id === commit.usageEventId);
    const metadata = event?.metadata as { reservationId: string; importJobId: string; ledgerEntryIds: string[] };
    expect(metadata.reservationId).toBe(reservation.id);
    expect(metadata.importJobId).toBe('job_1');
    expect(metadata.ledgerEntryIds).toEqual(commit.ledgerEntryIds);
  });

  it('refuses to reserve credits for a purchase — that is a PaymentAuthorization', async () => {
    const store = new TestApiStore();

    await expect(reserveUsage(store, baseReservation({ operation: 'domain' }))).rejects.toMatchObject({
      code: 'PURCHASE_REQUIRES_PAYMENT_AUTHORIZATION',
      statusCode: 400,
    });
  });

  it('rejects invalid amounts and TTLs', async () => {
    const store = new TestApiStore();

    await expect(reserveUsage(store, baseReservation({ maxAmountCents: -1 }))).rejects.toMatchObject({
      code: 'RESERVATION_INVALID_AMOUNT',
    });
    await expect(reserveUsage(store, baseReservation({ maxAmountCents: 1.5 }))).rejects.toMatchObject({
      code: 'RESERVATION_INVALID_AMOUNT',
    });
    await expect(reserveUsage(store, baseReservation({ ttlMs: 0 }))).rejects.toMatchObject({
      code: 'RESERVATION_INVALID_TTL',
    });
  });

  it('SHADOW mode: state machine + events run, wallet never moves', async () => {
    delete process.env.BILLING_CREDITS_ENABLED;

    const store = new TestApiStore();
    await grant(store, 50); // less than the hold — shadow still lets it through

    const { reservation, gate } = await reserveUsage(store, baseReservation({ maxAmountCents: 500 }));
    expect(gate.ok).toBe(false); // advisory: WOULD have blocked

    const commit = await commitReservation(store, {
      reservationId: reservation.id,
      actualCents: 300,
      reason: 'import',
      nowMs: NOW,
    });

    expect(commit.shadow).toBe(true);
    expect(commit.committedCents).toBe(300); // recorded…
    expect(await balance(store)).toBe(50); // …but nothing debited
    expect(await store.listCreditLedgerByReservation(reservation.id)).toHaveLength(0);
    expect(commit.usageEventId).toBeTruthy(); // audit trail still written
  });
});
