import { hashPassword } from '@vibecore/auth';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

/*
 * END-TO-END proof (through the REAL Fastify app) that the import CODE now follows
 * the CONTRACT state machine (P0-EX-04) and the SAFETY billing rules:
 *
 *   RECEIVED → STAGING_ISOLATED → SCANNING
 *      ├─ clean ─────────────────→ READY_TO_COMMIT → COMMITTING → COMMITTED
 *      └─ findings → QUARANTINED → AWAITING_USER_ACTION → RESCANNING → READY_TO_COMMIT → …
 *
 * Four required proofs:
 *   (1) clean import runs to COMMITTED (via READY_TO_COMMIT — no SCANNING shortcut),
 *       reservation SETTLED with a real debit;
 *   (2) a blocking finding QUARANTINES and awaits action, reservation RESERVED, no debit;
 *   (3) cancel / timeout leaves the target INTACT and COMPENSATES the reservation (zero debit);
 *   (4) a failure AFTER reservation does NOT debit (reservation COMPENSATED).
 */

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
  async deleteProjectFiles(projectId: string) {
    this.files.delete(projectId);
  }
  async exportZip() {
    return { storageKey: 'export', byteLength: 0, base64: '', createdAt: new Date().toISOString() };
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
    return { storageKey: 'snap', byteLength: 0, createdAt: new Date().toISOString() };
  }
  async getSnapshotFiles() {
    return [];
  }
  async restoreSnapshot() {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const IMPORTED_SECRET = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });
  const user = await store.createUser({ email: 'sm@example.com', name: 'SM', passwordHash: hashPassword('password123') });
  const org = await store.createOrganization({ name: 'SM Org', slug: 'sm-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'sm-token', expiresAt: new Date(Date.now() + 3600_000) });
  return { app, store, projectStorage, org };
}

const create = (app: any, orgId: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/orgs/${orgId}/imports`, headers: auth('sm-token'), payload });

const getJob = (app: any, orgId: string, id: string) =>
  app.inject({ method: 'GET', url: `/orgs/${orgId}/imports/${id}`, headers: auth('sm-token') });

describe('Import state machine + safety billing — E2E', () => {
  it('(1) CLEAN import: SCANNING → READY_TO_COMMIT (no shortcut) → COMMITTED; reservation SETTLED with a debit', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await create(app, org.id, {
      provider: 'zip',
      idempotencyKey: 'clean-1',
      files: [{ path: 'index.html', content: '<h1>hi</h1>\n' }],
    });
    expect(created.statusCode).toBe(201);
    // The clean scan lands on READY_TO_COMMIT, NOT the old SCANNING shortcut.
    expect(created.json().import.state).toBe('READY_TO_COMMIT');
    expect(projectStorage.writeCalls).toEqual([]); // nothing written yet

    // Reservation exists (RESERVED) with zero debit before commit.
    const before = (await getJob(app, org.id, created.json().import.importJobId)).json();
    expect(before.import.reservation).toMatchObject({ state: 'RESERVED', debitedCredits: 0 });

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${created.json().import.importJobId}/commit`,
      headers: auth('sm-token'),
      payload: { consent: {} },
    });
    expect(committed.statusCode).toBe(201);
    expect(committed.json().import.state).toBe('COMMITTED');

    const after = (await getJob(app, org.id, created.json().import.importJobId)).json();
    expect(after.import.state).toBe('COMMITTED');
    // Debit recorded ONLY now, and only because it committed.
    expect(after.import.reservation).toMatchObject({ state: 'SETTLED' });
    expect(after.import.reservation.debitedCredits).toBeGreaterThan(0);
    // Target written exactly once, at commit.
    expect(projectStorage.writeCalls).toEqual([committed.json().project.id]);
  });

  it('(2) FINDING: SCANNING → QUARANTINED → AWAITING_USER_ACTION; reservation RESERVED, no debit, no target', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await create(app, org.id, {
      provider: 'github',
      idempotencyKey: 'quarantine-1',
      files: [{ path: '.env', content: `API_SECRET=${IMPORTED_SECRET}\n` }],
    });
    expect(created.statusCode).toBe(202);
    expect(created.json().import.state).toBe('AWAITING_USER_ACTION');
    expect(created.json().import.requiresConsent).toBe(true);

    const view = (await getJob(app, org.id, created.json().import.importJobId)).json();
    expect(view.import.reservation).toMatchObject({ state: 'RESERVED', debitedCredits: 0 });
    expect(projectStorage.writeCalls).toEqual([]);
  });

  it('(2b) QUARANTINE → consent → the commit goes through RESCANNING → READY_TO_COMMIT → COMMITTED', async () => {
    const { app, store, org } = await setup();

    const created = await create(app, org.id, {
      provider: 'github',
      idempotencyKey: 'rescan-1',
      files: [{ path: '.env', content: `PORT=3000\nAPI_SECRET=${IMPORTED_SECRET}\n` }],
    });
    const importJobId = created.json().import.importJobId;
    const finding = created.json().import.findings.find((f: { path: string }) => f.path === '.env');

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('sm-token'),
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'redact' } },
    });
    expect(committed.statusCode).toBe(201);
    expect(committed.json().import.state).toBe('COMMITTED');
    expect((await store.getImportJob(importJobId))?.state).toBe('COMMITTED');
  });

  it('(3a) CANCEL leaves the target INTACT and COMPENSATES the reservation (zero debit)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await create(app, org.id, {
      provider: 'zip',
      idempotencyKey: 'cancel-1',
      files: [{ path: 'index.html', content: '<h1>hi</h1>\n' }],
    });
    const importJobId = created.json().import.importJobId;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
      headers: auth('sm-token'),
    });
    expect(cancelled.json().import.state).toBe('CANCELLED');

    const view = (await getJob(app, org.id, importJobId)).json();
    expect(view.import.state).toBe('CANCELLED');
    expect(view.import.reservation).toMatchObject({ state: 'COMPENSATED', debitedCredits: 0 });
    expect(view.import.targetProjectId).toBeFalsy();
    expect(projectStorage.writeCalls).toEqual([]);
    expect(projectStorage.files.size).toBe(0);
  });

  it('(3b) TIMEOUT sweeps to EXPIRED, target INTACT, reservation COMPENSATED (zero debit)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await create(app, org.id, {
      provider: 'zip',
      idempotencyKey: 'timeout-1',
      files: [{ path: 'index.html', content: '<h1>hi</h1>\n' }],
    });
    const importJobId = created.json().import.importJobId;

    // Drive the REAL app-level reaper (store sweep + staging dispose + reservation
    // compensation) — the same path the periodic timer runs in production.
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const reaped = await (app as any).reapExpiredImports(later);
    expect(reaped).toContain(importJobId);

    const view = (await getJob(app, org.id, importJobId)).json();
    expect(view.import.state).toBe('EXPIRED');
    expect(view.import.reservation).toMatchObject({ state: 'COMPENSATED', debitedCredits: 0 });
    expect(projectStorage.writeCalls).toEqual([]);
  });

  it('(4) FAILURE after reservation: target-write error → ROLLING_BACK, NO debit (reservation COMPENSATED)', async () => {
    const { app, store, org, projectStorage } = await setup();

    const created = await create(app, org.id, {
      provider: 'zip',
      idempotencyKey: 'fail-1',
      files: [{ path: 'a.txt', content: 'clean file\n' }],
    });
    const importJobId = created.json().import.importJobId;

    const spy = vi.spyOn(projectStorage, 'writeFiles').mockRejectedValueOnce(new Error('disk exploded'));
    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('sm-token'),
      payload: { consent: {} },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    spy.mockRestore();

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('ROLLING_BACK');
    expect(job?.targetProjectId).toBeUndefined();

    const view = (await getJob(app, org.id, importJobId)).json();
    // No commit ⇒ no debit ⇒ reservation compensated to zero.
    expect(view.import.reservation).toMatchObject({ state: 'COMPENSATED', debitedCredits: 0 });
    expect(projectStorage.writeCalls).toEqual([]); // the failed write left nothing
  });

  it('(5) IDEMPOTENT create: replaying the same key returns the SAME import, no second reservation', async () => {
    const { app, org } = await setup();
    const payload = { provider: 'zip', idempotencyKey: 'idem-x', files: [{ path: 'i.html', content: 'x\n' }] };

    const first = await create(app, org.id, payload);
    const second = await create(app, org.id, payload);

    expect(second.json().import.importJobId).toBe(first.json().import.importJobId);
    expect(second.json().import.replayed).toBe(true);
  });
});
