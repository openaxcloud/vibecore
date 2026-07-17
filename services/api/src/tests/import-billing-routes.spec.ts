/**
 * D4 phase 1 — the reservation pipeline wired into the REAL import routes:
 * reserve at POST /imports, structural gate + safe boundary before the atomic
 * commit, debit after COMMITTED, release on cancel, expiry on timeout. The
 * built-in import price is 0 (no measured price yet) — the STATE MACHINE and
 * its refusals are what these tests prove end-to-end over HTTP.
 */
import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

class MemoryProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  writeCalls: string[] = [];

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    this.writeCalls.push(projectId);

    const bucket = this.files.get(projectId) ?? new Map<string, string>();

    for (const file of files) {
      bucket.set(file.path, file.content);
    }
    this.files.set(projectId, bucket);

    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();

    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async readFile() {
    return undefined;
  }
  async deleteFiles() {}
  async exportZip() {
    return Buffer.from('');
  }
  async importZip() {
    return [];
  }
  async writeObject() {}
  async readObject() {
    return undefined;
  }
  async deleteObject() {}
  async createSnapshot() {
    return { id: 'snap', createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'bill@example.com',
    name: 'Bill',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Bill Org', slug: 'bill-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'bill-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, org };
}

const cleanFiles = () => [
  { path: 'src/index.js', content: 'console.log("hi")\n' },
  { path: 'README.md', content: '# Imported\n' },
];

describe('import routes carry the reservation pipeline', () => {
  it('POST /imports opens an idempotent hold and surfaces estimation + ceiling', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });

    expect(created.statusCode).toBe(201);

    const body = created.json();
    expect(body.billing.reservationId).toBeTruthy();
    expect(body.billing.estimatedCents).toBe(0); // built-in price: imports free today
    expect(body.billing.maxAmountCents).toBe(0);
    expect(body.billing.status).toBe('ACTIVE');

    const reservation = await store.findUsageReservationByImportJob(body.import.importJobId);
    expect(reservation?.id).toBe(body.billing.reservationId);
    expect(reservation?.idempotencyKey).toBe(`import:${body.import.importJobId}`);
    expect(reservation?.operation).toBe('import');
  });

  it('commit debits AFTER the billable step and surfaces the billed result; UsageEvent correlated', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('bill-token'),
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBe(201);

    const body = committed.json();
    expect(body.billing.committedCents).toBe(0);
    expect(body.billing.maxAmountCents).toBe(0);
    expect(body.billing.usageEventId).toBeTruthy();

    const reservation = await store.findUsageReservationByImportJob(importJobId);
    expect(reservation?.status).toBe('COMMITTED');
    expect(reservation?.committedCents).toBe(0);

    // The immutable usage record correlates job ↔ reservation.
    const event = [...store.usageEvents.values()].find((e) => e.id === body.billing.usageEventId);
    expect(event?.type).toBe('import.credits');
    expect((event?.metadata as { importJobId: string }).importJobId).toBe(importJobId);
    expect((event?.metadata as { reservationId: string }).reservationId).toBe(reservation?.id);

    // GET now shows the billed result (UI: résultat facturé).
    const fetched = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('bill-token'),
    });
    expect(fetched.json().billing.status).toBe('COMMITTED');
    expect(fetched.json().billing.committedCents).toBe(0);
  });

  it('NEGATIVE (live): commit with the reservation gone is refused — the billable step never starts', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });

    const importJobId = created.json().import.importJobId;

    // Simulate a pre-reservation-era job / a lost row: remove the hold.
    const reservation = await store.findUsageReservationByImportJob(importJobId);
    store.usageReservations.delete(reservation!.id);

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('bill-token'),
      payload: { consent: {} },
    });

    expect(committed.statusCode).toBe(402);

    // Refused BEFORE the atomic step: job untouched, no project mounted.
    const job = await store.getImportJob(importJobId);
    expect(job?.targetProjectId).toBeUndefined();
  });

  it('cancel releases the hold (reason cancel); commit afterwards is refused', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
      headers: auth('bill-token'),
    });
    expect(cancelled.statusCode).toBe(200);

    const reservation = await store.findUsageReservationByImportJob(importJobId);
    expect(reservation?.status).toBe('RELEASED');
    expect(reservation?.releaseReason).toBe('cancel');

    const late = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('bill-token'),
      payload: { consent: {} },
    });
    expect(late.statusCode).toBe(409); // RESERVATION_NOT_ACTIVE — staging gone too
  });

  it('timeout sweep expires the hold with the job', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await store.reapExpiredImportJobs(later);

    const reaped = await store.reapExpiredUsageReservations(later);

    expect(reaped.map((r) => r.importJobId)).toContain(importJobId);

    const reservation = await store.findUsageReservationByImportJob(importJobId);
    expect(reservation?.status).toBe('EXPIRED');
    expect(reservation?.releaseReason).toBe('timeout');
  });

  it('GET /orgs/:orgId/usage/reservations lists holds for the UI', async () => {
    const { app, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('bill-token'),
      payload: { provider: 'github', files: cleanFiles() },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/usage/reservations`,
      headers: auth('bill-token'),
    });

    expect(listed.statusCode).toBe(200);

    const { reservations } = listed.json();
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      operation: 'import',
      status: 'ACTIVE',
      estimatedCents: 0,
      maxAmountCents: 0,
      importJobId: created.json().import.importJobId,
    });
  });
});
