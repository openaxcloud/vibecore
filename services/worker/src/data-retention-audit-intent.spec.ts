import { describe, expect, it } from 'vitest';

import { enforceDataRetention } from './index.js';

/*
 * AUDX-011 — call-site guard.
 *
 * Migration 0084 refuses a DELETE on AuditLog unless the caller declares itself
 * the retention purge with `SET LOCAL vibecore.audit_retention = 'on'`. The
 * retention sweep is the ONLY sanctioned deleter, so the declaration has to
 * happen here, inside the same transaction as the delete — a `SET LOCAL` in a
 * different transaction grants nothing.
 *
 * This fails on the pre-fix worker, which called `prisma.auditLog.deleteMany`
 * directly: no transaction, no declaration, and — once the migration is applied
 * — a retention sweep that throws on every organization.
 */
type Call = { kind: string; detail?: unknown };

function fakePrisma(calls: Call[]) {
  const auditDelete = {
    async deleteMany(args: unknown) {
      calls.push({ kind: 'auditLog.deleteMany', detail: args });

      return { count: 1 };
    },
  };

  return {
    enterpriseOrganizationSettings: {
      async findMany() {
        return [{ organizationId: 'org1', dataRetentionDays: 30, legalHoldEnabled: false }];
      },
    },
    siemWebhook: {
      async findMany() {
        return [];
      },
    },
    auditLog: {
      async deleteMany() {
        // Outside a transaction: the pre-fix path. Recorded so the test can tell
        // the two apart instead of just counting deletes.
        calls.push({ kind: 'auditLog.deleteMany:NO-TRANSACTION' });

        return { count: 1 };
      },
    },
    projectActivity: {
      async deleteMany() {
        calls.push({ kind: 'projectActivity.deleteMany' });

        return { count: 1 };
      },
    },
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      calls.push({ kind: '$transaction:begin' });

      const tx = {
        async $executeRawUnsafe(sql: string) {
          calls.push({ kind: '$executeRawUnsafe', detail: sql });

          return 0;
        },
        auditLog: auditDelete,
      };

      const result = await fn(tx);
      calls.push({ kind: '$transaction:commit' });

      return result;
    },
  } as never;
}

describe('AUDX-011 retention sweep declares its audit-delete intent', () => {
  it('deletes audit rows inside a transaction that first declares the retention intent', async () => {
    const calls: Call[] = [];
    await enforceDataRetention(fakePrisma(calls));

    const kinds = calls.map((call) => call.kind);

    // The delete must be the transactional one, never the bare delegate.
    expect(kinds).toContain('auditLog.deleteMany');
    expect(kinds).not.toContain('auditLog.deleteMany:NO-TRANSACTION');

    const declaredAt = kinds.indexOf('$executeRawUnsafe');
    const deletedAt = kinds.indexOf('auditLog.deleteMany');
    const beganAt = kinds.indexOf('$transaction:begin');
    const committedAt = kinds.indexOf('$transaction:commit');

    // Ordering is the whole mechanism: declare, then delete, both inside the tx.
    expect(beganAt).toBeGreaterThanOrEqual(0);
    expect(declaredAt).toBeGreaterThan(beganAt);
    expect(deletedAt).toBeGreaterThan(declaredAt);
    expect(committedAt).toBeGreaterThan(deletedAt);

    const declaration = calls[declaredAt].detail as string;
    expect(declaration).toMatch(/SET LOCAL vibecore\.audit_retention\s*=\s*'on'/);
  });

  it('still scopes the delete to the organization being swept', async () => {
    const calls: Call[] = [];
    await enforceDataRetention(fakePrisma(calls));

    const del = calls.find((call) => call.kind === 'auditLog.deleteMany')!.detail as {
      where: { organizationId: string; createdAt: { lt: Date } };
    };

    // An unscoped delete would wipe every tenant's trail under one intent.
    expect(del.where.organizationId).toBe('org1');
    expect(del.where.createdAt.lt).toBeInstanceOf(Date);
  });
});
