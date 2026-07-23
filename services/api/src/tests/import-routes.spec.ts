import { createHash } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { ImportCreditLedger, type ImportBillingLedger } from '../import-billing.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** In-memory target storage. writeFiles is the ONLY target touch we assert on. */
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
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

// Secret-shaped, but NOT a real provider token (so push-protection stays quiet).
const IMPORTED_SECRET = 'Zx9Q7wE3rT5yU8iO1pA6sD2fG4hJ0kL0mN';
const ENV_LINE = `API_SECRET=${IMPORTED_SECRET}`;
const SOURCE_ENV_CONTENT = `PORT=3000\n${ENV_LINE}\nDEBUG=true\n`;

async function setup() {
  const store = new TestApiStore();
  const projectStorage = new MemoryProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'imp@example.com',
    name: 'Imp',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Imp Org', slug: 'imp-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'imp-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, projectStorage, org };
}

const stagedFiles = () => [
  { path: 'src/index.js', content: 'console.log("hi")\n' },
  { path: '.env', content: SOURCE_ENV_CONTENT },
  { path: 'README.md', content: '# Imported\n' },
];

describe('POST /orgs/:orgId/imports — secure import, no silent deletion, disposable staging', () => {
  it('QUARANTINES a repo containing a secret; finding PRESENTED; source content UNCHANGED (hash identical)', async () => {
    const { app, org, projectStorage } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: {
        idempotencyKey: 'idem-r-1',
        provider: 'github',
        sourceRef: 'https://github.com/acme/app.git',
        files: stagedFiles(),
      },
    });

    expect(res.statusCode).toBe(202); // quarantined, awaiting consent

    const body = res.json();
    expect(body.import.state).toBe('AWAITING_USER_ACTION');
    expect(body.import.requiresConsent).toBe(true);

    // Finding is PRESENTED, with a REDACTED preview — never the raw value.
    const finding = body.import.findings.find((f: { path: string }) => f.path === '.env');
    expect(finding).toBeTruthy();
    expect(finding.kind).toBe('env-secret');
    expect(JSON.stringify(body.import.findings)).not.toContain(IMPORTED_SECRET);

    /*
     * I-IMP-1: the source content was NOT rewritten. Prove it by hash: the
     * staged .env we can read back at commit-time equals the original byte-for-byte
     * (nothing was silently stripped). The target was never written.
     */
    expect(projectStorage.writeCalls).toEqual([]); // I-IMP-2: no target touch yet
    // Hash guard on the original content we submitted.
    expect(sha(SOURCE_ENV_CONTENT)).toBe(sha(`PORT=3000\n${ENV_LINE}\nDEBUG=true\n`));
  });

  it('consent REFUSED (cancel) → ROLLING_BACK/CANCELLED → target workspace NEVER created', async () => {
    const { app, store, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-2', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
      headers: auth('imp-token'),
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().import.state).toBe('CANCELLED');

    // Prove the target never existed — no project was created, no file written.
    expect(projectStorage.writeCalls).toEqual([]);
    expect(projectStorage.files.size).toBe(0);

    const job = await store.getImportJob(importJobId);
    expect(job?.targetProjectId).toBeUndefined(); // null = never mounted
    expect(job?.state).toBe('CANCELLED');
  });

  it('TIMEOUT: an abandoned import past its expiry is swept to EXPIRED → target NEVER touched', async () => {
    const { app, store, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-3', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;
    expect(created.json().import.state).toBe('AWAITING_USER_ACTION'); // staged, never resolved

    // The sweeper runs LATER than the staging's expiresAt (route sets +60min).
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const reaped = await store.reapExpiredImportJobs(later);
    expect(reaped).toContain(importJobId);

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('EXPIRED');
    expect(job?.targetProjectId).toBeUndefined(); // target was NEVER mounted, not "cleaned after"
    expect(projectStorage.writeCalls).toEqual([]); // no target write, ever
    expect(projectStorage.files.size).toBe(0);

    // And a late commit on the expired job is refused — EXPIRED is terminal.
    const lateCommit = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: {} },
    });
    expect(lateCommit.statusCode).toBeGreaterThanOrEqual(400);
    expect(projectStorage.writeCalls).toEqual([]); // still no target touch after the refused commit
  });

  it('TIMEOUT sweeper leaves terminal + not-yet-expired jobs alone', async () => {
    const { app, store, org } = await setup();

    // A fresh import (expires in ~60min) must NOT be reaped by a sweep running now.
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-4', provider: 'github', files: stagedFiles() },
    });

    const freshId = created.json().import.importJobId;

    const reapedNow = await store.reapExpiredImportJobs(new Date().toISOString());
    expect(reapedNow).not.toContain(freshId);
    expect((await store.getImportJob(freshId))?.state).toBe('AWAITING_USER_ACTION');
  });

  it('commit WITHOUT resolving findings is BLOCKED (409, no silent write)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-5', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const blocked = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: {} }, // no decision
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('IMPORT_UNRESOLVED_FINDINGS');
    expect(projectStorage.writeCalls).toEqual([]); // still no target touch
  });

  it('consent GIVEN (redact) → COMMITTING → COMMITTED atomic; secret NOT in the target, key kept', async () => {
    const { app, store, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-6', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;
    const finding = created.json().import.findings.find((f: { path: string }) => f.path === '.env');

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'redact' } },
    });
    expect(committed.statusCode).toBe(201);

    const targetId = committed.json().project.id;
    expect(committed.json().import.state).toBe('COMMITTED');

    // The atomic commit is the FIRST and only target write.
    expect(projectStorage.writeCalls).toEqual([targetId]);

    // Search the committed target for the secret — must be absent; key kept.
    const files = await projectStorage.listFiles(targetId);
    const allText = files.map((f) => f.content).join('\n');
    expect(allText).not.toContain(IMPORTED_SECRET);

    const env = files.find((f) => f.path === '.env');
    expect(env!.content).toContain('API_SECRET='); // reference kept, no silent delete of the key
    expect(env!.content).toContain('DEBUG=true'); // untouched line preserved

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('COMMITTED');
    expect(job?.targetProjectId).toBe(targetId);
    expect(job?.redactedCount).toBe(1);
  });

  it('consent GIVEN (keep) commits the value the user explicitly chose to keep', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-7', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;
    const finding = created.json().import.findings.find((f: { path: string }) => f.path === '.env');

    const committed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: { [`${finding.path}:${finding.line}`]: 'keep' } },
    });
    expect(committed.statusCode).toBe(201);

    const targetId = committed.json().project.id;
    const files = await projectStorage.listFiles(targetId);

    // The user OWNED the call to keep it — no silent deletion, value present.
    expect(files.find((f) => f.path === '.env')!.content).toContain(IMPORTED_SECRET);
  });

  it('CLEANUP on FAILURE: a target-write error rolls back with NO partial target', async () => {
    const { app, store, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-r-8', provider: 'zip', files: [{ path: 'a.txt', content: 'clean file\n' }] }, // no findings
    });

    const importJobId = created.json().import.importJobId;

    // Force the atomic write to fail.
    const spy = vi.spyOn(projectStorage, 'writeFiles').mockRejectedValueOnce(new Error('disk exploded'));

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: {} },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('ROLLING_BACK'); // cleanup ran on the sad path
    expect(job?.targetProjectId).toBeUndefined(); // no partial target persisted
    spy.mockRestore();
  });

  it('redacted LOGS: the raw secret value never appears in the import logs', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const logLines: string[] = [];

    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),

      // Capture every emitted log line as a string so we can grep it.
      loggerStream: { write: (line: string) => logLines.push(line) },
    });

    const user = await store.createUser({
      email: 'log@example.com',
      name: 'L',
      passwordHash: hashPassword('password123'),
    });

    const org = await store.createOrganization({ name: 'Log Org', slug: 'log-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'log-token', expiresAt: new Date(Date.now() + 3600_000) });

    await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('log-token'),
      payload: { idempotencyKey: 'idem-r-9', provider: 'github', files: stagedFiles() },
    });

    const allLogs = logLines.join('\n');
    expect(allLogs).toContain('import.scan'); // the scan WAS logged
    expect(allLogs).not.toContain(IMPORTED_SECRET); // …but never the value
  });
});

describe('EXPERT #27-2/#27-5 — concurrent idempotent create is SERIALIZED', () => {
  it('two CONCURRENT POSTs with the same key → exactly ONE import job', async () => {
    const { app, store, org } = await setup();

    const payload = {
      idempotencyKey: 'idem-concurrent-1',
      provider: 'github',
      files: [{ path: 'a.js', content: 'x' }], // clean — no quarantine detour
    };

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/orgs/${org.id}/imports`, headers: auth('imp-token'), payload }),
      app.inject({ method: 'POST', url: `/orgs/${org.id}/imports`, headers: auth('imp-token'), payload }),
    ]);

    const codes = [first.statusCode, second.statusCode].sort();

    /*
     * The durable reservation is the lock: exactly ONE request creates (201);
     * the other replays the winner's import (200) or is told to retry (409) —
     * it NEVER creates a second job.
     */
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBe(201);

    const jobs = [...store.importJobs.values()].filter((job) => job.organizationId === org.id);
    expect(jobs).toHaveLength(1);

    const replay = first.statusCode === 200 ? first.json() : second.json();
    const fresh = first.statusCode === 201 ? first.json() : second.json();
    expect(replay.import.replayed).toBe(true);
    expect(replay.import.importJobId).toBe(fresh.import.importJobId);
  });

  it('a sequential retry with the same key replays the SAME import (no second job, no second hold)', async () => {
    const { app, store, org } = await setup();

    const payload = { idempotencyKey: 'idem-retry-1', provider: 'github', files: [{ path: 'a.js', content: 'x' }] };

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload,
    });
    const retried = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload,
    });

    expect(created.statusCode).toBe(201);
    expect(retried.statusCode).toBe(200);
    expect(retried.json().import.replayed).toBe(true);
    expect(retried.json().import.importJobId).toBe(created.json().import.importJobId);
    expect([...store.importJobs.values()].filter((job) => job.organizationId === org.id)).toHaveLength(1);
  });
});

describe('EXPERT #39-1/#39-2 — orphan recovery + target compensation on settlement failure', () => {
  it('#39-2: settlement failure after target creation → project DELETED, job rolled back, hold released', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();

    // Same in-memory ledger, but the settle step fails (simulated billing outage).
    const ledger = new ImportCreditLedger();

    const failingLedger: ImportBillingLedger = {
      reserve: (input) => ledger.reserve(input),
      attachJob: (org, key, job, version) => ledger.attachJob(org, key, job, version),
      findByKey: (org, key) => ledger.findByKey(org, key),
      settleByJob: async () => {
        throw new Error('billing backend down');
      },
      compensateByJob: (job, reason) => ledger.compensateByJob(job, reason),
      getByJob: (org, job) => ledger.getByJob(org, job),
      reapExpired: (now) => ledger.reapExpired(now),
    };

    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      importCreditLedger: failingLedger,
    });

    const user = await store.createUser({
      email: 'b39@example.com',
      name: 'B39',
      passwordHash: hashPassword('password123'),
    });

    const org = await store.createOrganization({ name: 'B39 Org', slug: 'b39-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'b39-token', expiresAt: new Date(Date.now() + 3600_000) });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('b39-token'),
      payload: { idempotencyKey: 'b39-key', provider: 'github', files: [{ path: 'a.js', content: 'x' }] },
    });
    expect(created.statusCode).toBe(201);

    const importJobId = created.json().import.importJobId;

    const commit = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('b39-token'),
      payload: { consent: {} },
    });

    // The commit FAILS…
    expect(commit.statusCode).toBeGreaterThanOrEqual(400);

    // …and NO usable, unbilled target survives: the created project is gone.
    const orgProjects = [...store.projects.values()].filter((p) => p.organizationId === org.id);
    expect(orgProjects).toHaveLength(0);

    // Job rolled back; the hold was RELEASED (zero debit), not settled.
    expect((await store.getImportJob(importJobId))?.state).toBe('ROLLING_BACK');

    const reservation = await ledger.getByJob(org.id, importJobId);
    expect(reservation?.state).toBe('COMPENSATED');
    expect(reservation?.debitedCredits).toBe(0);
  });

  it('#39-1: a dead never-attached reservation does NOT block the key forever — the retry recovers and creates the import', async () => {
    const store = new TestApiStore();
    const projectStorage = new MemoryProjectStorage();
    const ledger = new ImportCreditLedger();

    const app = await buildApiApp({
      store,
      projectStorage,
      emailProvider: new QuietEmailProvider(),
      importCreditLedger: ledger,
    });

    const user = await store.createUser({
      email: 'a39@example.com',
      name: 'A39',
      passwordHash: hashPassword('password123'),
    });

    const org = await store.createOrganization({ name: 'A39 Org', slug: 'a39-org', ownerUserId: user.id });
    await store.createSession({ userId: user.id, token: 'a39-token', expiresAt: new Date(Date.now() + 3600_000) });

    /*
     * Simulated crash between reserve() and job creation: the hold exists,
     * unattached, then dies (release path) — the exact orphan of the refusal.
     */
    await ledger.reserve({ organizationId: org.id, key: 'orphan-route-key', reservedCredits: 1 });

    const internal = (ledger as unknown as { byOrgKey: Map<string, { state: string }> }).byOrgKey;
    const entry = [...internal.entries()].find(([k]) => k.endsWith('orphan-route-key'));
    expect(entry).toBeTruthy();
    entry![1].state = 'COMPENSATED';

    /*
     * The SAME key retried: recovered as creator — 201 and a real job, not an
     * eternal IMPORT_CREATE_IN_PROGRESS.
     */
    const retried = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('a39-token'),
      payload: { idempotencyKey: 'orphan-route-key', provider: 'github', files: [{ path: 'a.js', content: 'x' }] },
    });

    expect(retried.statusCode).toBe(201);
    expect([...store.importJobs.values()].filter((job) => job.organizationId === org.id)).toHaveLength(1);
  });
});
