/**
 * DURABLE import credit ledger — the fix-forward for the expert's refusal of
 * PR #27: the in-process `ImportCreditLedger` map lost every reservation on a
 * process restart, indexed by RAW key (no organization namespace), and its
 * check-then-create was not serialized.
 *
 * This implementation stores every import reservation in the canonical
 * double-entry ledger of PR #28 (`LedgerReservation` + balanced transactions):
 *
 *  - DURABLE: rows live in Postgres; a reservation written by one process is
 *    visible to the next (survives restart — proven in import-billing-db.spec).
 *  - ORG-SCOPED IDEMPOTENCY: the DB unique constraint
 *    (organizationId, idempotencyKey) — two organizations using the same key
 *    get two independent reservations; the same org replaying a key gets ONE.
 *  - SERIALIZED CREATION: create + catch-P2002 inside `LedgerStore.reserveUsage`
 *    — of two concurrent requests exactly one observes `created: true`; the
 *    route lets ONLY that winner create the import job (no duplicate jobs).
 *  - OWNERSHIP: every by-job lookup that serves a request verifies the
 *    reservation belongs to the calling organization.
 *
 * Error codes mirror `import-billing.ts` so route behavior and specs stay
 * uniform across the durable and in-memory backends.
 */

import type { DatabaseClient } from '@vibecore/database';

import { ImportBillingError, type ImportReservation, type ReservationState } from './import-billing.js';
import { LedgerError } from './ledger-core.js';
import { LedgerStore } from './ledger-store.js';

/** Reservation TTL — matches the import staging expiry (1 h idle). */
const IMPORT_RESERVATION_TTL_MS = 60 * 60 * 1000;

/**
 * The async surface both backends (durable Postgres / in-memory test) expose.
 * `reserve` is the atomic idempotency point: exactly ONE concurrent caller per
 * (organizationId, key) sees `created: true` and may create the import job.
 */
export interface ImportBillingLedger {
  reserve(input: {
    organizationId: string;
    key: string;
    reservedCredits: number;
  }): Promise<{ reservation: ImportReservation; created: boolean }>;

  /** Bind the winner's import job to its reservation (once; conflicts reported). */
  attachJob(organizationId: string, key: string, importJobId: string): Promise<'attached' | 'conflict'>;
  findByKey(organizationId: string, key: string): Promise<ImportReservation | undefined>;

  /** Ownership-checked: refuses a reservation belonging to another org. */
  settleByJob(
    organizationId: string,
    importJobId: string,
    committed: boolean,
    actualCredits: number,
  ): Promise<ImportReservation>;

  /**
   * Release on a NON-committed exit (cancel / timeout / rollback / failure) —
   * zero debit. No-op (undefined) when nothing was reserved. Server-side only:
   * callers pass job ids they already authorized.
   */
  compensateByJob(
    importJobId: string,
    reason: 'cancel' | 'failure' | 'timeout',
  ): Promise<ImportReservation | undefined>;
  getByJob(organizationId: string, importJobId: string): Promise<ImportReservation | undefined>;

  /** Timeout sweep for reservations never attached to a job / never settled. */
  reapExpired(nowIso: string): Promise<string[]>;
}

type LedgerReservationRow = {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  importJobId: string | null;
  maxAmountMinor: bigint;
  committedMinor: bigint | null;
  status: string;
};

function mapState(status: string): ReservationState {
  if (status === 'ACTIVE') {
    return 'RESERVED';
  }

  if (status === 'COMMITTED') {
    return 'SETTLED';
  }

  // RELEASED / EXPIRED / COMPENSATED all mean: hold gone, zero debit.
  return 'COMPENSATED';
}

function mapRow(row: LedgerReservationRow): ImportReservation {
  const state = mapState(row.status);

  return {
    key: row.idempotencyKey,
    organizationId: row.organizationId,
    importJobId: row.importJobId ?? '',
    reservedCredits: Number(row.maxAmountMinor),
    debitedCredits: state === 'SETTLED' ? Number(row.committedMinor ?? 0n) : 0,
    state,
  };
}

export class DurableImportCreditLedger implements ImportBillingLedger {
  private readonly ledger: LedgerStore;

  constructor(private readonly db: DatabaseClient) {
    this.ledger = new LedgerStore(db);
  }

  async reserve(input: { organizationId: string; key: string; reservedCredits: number }) {
    if (!input.key || input.key.trim().length === 0) {
      throw new ImportBillingError('An idempotency key is mandatory to reserve import credits', 'BILLING_KEY_REQUIRED');
    }

    if (!Number.isInteger(input.reservedCredits) || input.reservedCredits < 0) {
      throw new ImportBillingError(
        `reservedCredits must be a non-negative integer (was ${input.reservedCredits})`,
        'BILLING_BAD_AMOUNT',
      );
    }

    const result = await this.ledger.reserveUsage({
      organizationId: input.organizationId,
      idempotencyKey: input.key,
      operation: 'import',
      maxAmountMinor: BigInt(input.reservedCredits),
      currency: 'usd',
      expiresAt: new Date(Date.now() + IMPORT_RESERVATION_TTL_MS).toISOString(),
    });

    let row = await this.requireByKey(input.organizationId, input.key);
    let created = result.created;

    /*
     * ORPHAN RECOVERY (expert #39-1): a crash between reserve() and the job
     * creation/attach leaves a reservation with no importJobId. Once that hold
     * is DEAD (expired or released), a retry of the SAME key revives it
     * atomically and proceeds as the creator — the key no longer answers
     * IMPORT_CREATE_IN_PROGRESS forever. A LIVE unattached hold (a concurrent
     * creator mid-flight, attach happening within milliseconds) is NOT
     * revivable and stays a normal replay.
     */
    if (!created && row.importJobId === null && row.status !== 'COMMITTED') {
      const nowIso = new Date().toISOString();

      const revived = await this.ledger.reviveReservation({
        reservationId: row.id,
        expiresAt: new Date(Date.now() + IMPORT_RESERVATION_TTL_MS).toISOString(),
        nowIso,
      });

      if (revived) {
        row = await this.requireByKey(input.organizationId, input.key);
        created = true;
      }
    }

    return { reservation: mapRow(row), created };
  }

  async attachJob(organizationId: string, key: string, importJobId: string): Promise<'attached' | 'conflict'> {
    // Conditional write: only the first attach (importJobId still NULL) wins.
    const attached = await this.db.ledgerReservation.updateMany({
      where: { organizationId, idempotencyKey: key, importJobId: null },
      data: { importJobId },
    });

    if (attached.count === 1) {
      return 'attached';
    }

    const row = await this.requireByKey(organizationId, key);

    return row.importJobId === importJobId ? 'attached' : 'conflict';
  }

  async findByKey(organizationId: string, key: string): Promise<ImportReservation | undefined> {
    const row = await this.db.ledgerReservation.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
    });

    return row ? mapRow(row) : undefined;
  }

  async settleByJob(
    organizationId: string,
    importJobId: string,
    committed: boolean,
    actualCredits: number,
  ): Promise<ImportReservation> {
    if (!committed) {
      throw new ImportBillingError(
        'Refusing to settle/debit an import that did not COMMIT — no commit, no debit.',
        'BILLING_SETTLE_WITHOUT_COMMIT',
      );
    }

    if (!Number.isInteger(actualCredits) || actualCredits < 0) {
      throw new ImportBillingError(
        `actualCredits must be a non-negative integer (was ${actualCredits})`,
        'BILLING_BAD_AMOUNT',
      );
    }

    const row = await this.requireByJob(importJobId);

    // OWNERSHIP (expert #27-4): a reservation of another org is untouchable.
    if (row.organizationId !== organizationId) {
      throw new ImportBillingError(
        `Reservation for import ${importJobId} belongs to another organization`,
        'BILLING_RESERVATION_FOREIGN',
      );
    }

    if (mapState(row.status) === 'COMPENSATED') {
      throw new ImportBillingError(
        'Cannot settle a compensated (released) reservation',
        'BILLING_SETTLE_AFTER_COMPENSATE',
      );
    }

    const expected = actualCredits > Number(row.maxAmountMinor) ? Number(row.maxAmountMinor) : actualCredits;

    try {
      const settled = await this.ledger.commitReservation({
        reservationId: row.id,
        actualAmountMinor: BigInt(actualCredits),
      });

      if (settled.replayed && Number(settled.committedMinor) !== expected) {
        throw new ImportBillingError(
          `Reservation already settled at ${settled.committedMinor}, cannot re-settle at ${actualCredits}`,
          'BILLING_RESETTLE_MISMATCH',
        );
      }
    } catch (error) {
      if (error instanceof LedgerError && error.code === 'LEDGER_RESERVATION_NOT_ACTIVE') {
        throw new ImportBillingError(
          'Cannot settle a compensated (released) reservation',
          'BILLING_SETTLE_AFTER_COMPENSATE',
        );
      }

      throw error;
    }

    return mapRow(await this.requireByJob(importJobId));
  }

  async compensateByJob(
    importJobId: string,
    reason: 'cancel' | 'failure' | 'timeout',
  ): Promise<ImportReservation | undefined> {
    const row = await this.db.ledgerReservation.findFirst({
      where: { importJobId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      return undefined; // failure before reserve — nothing to release
    }

    if (row.status === 'COMMITTED') {
      throw new ImportBillingError(
        'Cannot compensate a settled reservation (the import committed and was debited)',
        'BILLING_COMPENSATE_AFTER_SETTLE',
      );
    }

    if (row.status === 'ACTIVE') {
      await this.ledger.releaseReservation(row.id, reason);
    }

    return mapRow(await this.requireByJob(importJobId));
  }

  async getByJob(organizationId: string, importJobId: string): Promise<ImportReservation | undefined> {
    const row = await this.db.ledgerReservation.findFirst({
      where: { importJobId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row || row.organizationId !== organizationId) {
      return undefined;
    }

    return mapRow(row);
  }

  async reapExpired(nowIso: string): Promise<string[]> {
    return this.ledger.reapExpiredReservations(nowIso);
  }

  private async requireByKey(organizationId: string, key: string): Promise<LedgerReservationRow> {
    const row = await this.db.ledgerReservation.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: key } },
    });

    if (!row) {
      throw new ImportBillingError(`No reservation found for key ${key}`, 'BILLING_RESERVATION_MISSING');
    }

    return row;
  }

  private async requireByJob(importJobId: string): Promise<LedgerReservationRow> {
    const row = await this.db.ledgerReservation.findFirst({
      where: { importJobId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      throw new ImportBillingError(`No reservation found for import ${importJobId}`, 'BILLING_RESERVATION_MISSING');
    }

    return row;
  }
}
