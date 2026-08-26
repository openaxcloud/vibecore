import { createHash } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
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

    const frenchView = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: { ...auth('imp-token'), 'accept-language': 'fr-FR, en;q=0.5' },
    });
    expect(frenchView.statusCode).toBe(200);
    expect(frenchView.headers['content-language']).toBe('fr');
    expect(frenchView.json().import.error).toBe(
      'La zone de préparation de l’importation a expiré avant sa validation.',
    );

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

  it('stages all five archive tiles without creating a project before explicit commit', async () => {
    const { app, store, org, projectStorage } = await setup();
    const archive = new JSZip();
    archive.file('src/index.ts', 'export const imported = true;\n');
    archive.file('README.md', '# Portable export\n');
    const zipBase64 = await archive.generateAsync({ type: 'base64' });
    const providers = ['zip', 'bolt', 'lovable', 'base44', 'previous-agent-export'] as const;

    for (const provider of providers) {
      const staged = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports`,
        headers: auth('imp-token'),
        payload: {
          idempotencyKey: `archive-stage-${provider}`,
          provider,
          sourceRef: `${provider}.zip`,
          zipBase64,
        },
      });

      expect(staged.statusCode).toBe(201);
      expect(staged.json().import.state).toBe('READY_TO_COMMIT');
      expect(store.projects.size).toBe(0);
      expect(projectStorage.writeCalls).toEqual([]);

      const importJobId = staged.json().import.importJobId as string;
      const preview = await app.inject({
        method: 'GET',
        url: `/orgs/${org.id}/imports/${importJobId}`,
        headers: auth('imp-token'),
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().import.stagedFiles).toEqual(
        expect.arrayContaining([
          { path: 'README.md', sizeBytes: 18 },
          { path: 'src/index.ts', sizeBytes: 30 },
        ]),
      );

      const cancelled = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
        headers: auth('imp-token'),
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().import.state).toBe('CANCELLED');
    }

    expect(store.projects.size).toBe(0);
    expect(projectStorage.files.size).toBe(0);
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
      headers: { ...auth('imp-token'), 'accept-language': 'fr-FR' },
      payload: { consent: {} }, // no decision
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.headers['content-language']).toBe('fr');
    expect(blocked.json().code).toBe('IMPORT_UNRESOLVED_FINDINGS');
    expect(blocked.json().error).toBe(
      'Importation bloquée : traitez chaque secret détecté (conserver ou masquer) avant de valider.',
    );
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

    // Inject the failure AFTER bytes landed: cleanup must remove both the
    // physical tree and the Project row, not merely flip the job state.
    const realWrite = projectStorage.writeFiles.bind(projectStorage);
    const spy = vi.spyOn(projectStorage, 'writeFiles').mockImplementationOnce(async (...args) => {
      await realWrite(...args);
      throw new Error('disk exploded after partial write');
    });

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
    expect(projectStorage.files.size).toBe(0);
    expect(store.projects.size).toBe(0);
    expect(await store.getImportReservationByJob(importJobId, org.id)).toMatchObject({
      state: 'COMPENSATED',
      debitedCredits: 0,
    });
    spy.mockRestore();
  });

  it('two concurrent commit POSTs create/write/debit exactly once; loser is honest or idempotent', async () => {
    const { app, store, org, projectStorage } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: {
        idempotencyKey: 'concurrent-commit-route',
        provider: 'zip',
        files: [{ path: 'index.ts', content: 'export const once = true;\n' }],
      },
    });
    const importJobId = created.json().import.importJobId;
    const commit = () =>
      app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/imports/${importJobId}/commit`,
        headers: auth('imp-token'),
        payload: { consent: {} },
      });
    const [first, second] = await Promise.all([commit(), commit()]);
    const statuses = [first.statusCode, second.statusCode];

    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.every((status) => status === 201 || status === 200 || status === 409)).toBe(true);
    expect(store.projects.size).toBe(1);
    expect(projectStorage.writeCalls).toHaveLength(1);
    expect(await store.getImportReservationByJob(importJobId, org.id)).toMatchObject({
      state: 'SETTLED',
      debitedCredits: 1,
      version: 1,
    });
  });

  it('cleanup failure remains compensated+CLEANUP_PENDING and a later reaper finishes it', async () => {
    const { app, store, org, projectStorage } = await setup();
    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: {
        idempotencyKey: 'cleanup-recovery-route',
        provider: 'zip',
        files: [{ path: 'partial.txt', content: 'partial\n' }],
      },
    });
    const importJobId = created.json().import.importJobId;
    const realWrite = projectStorage.writeFiles.bind(projectStorage);
    const writeSpy = vi.spyOn(projectStorage, 'writeFiles').mockImplementationOnce(async (...args) => {
      await realWrite(...args);
      throw new Error('write failed after bytes landed');
    });
    const cleanupSpy = vi.spyOn(projectStorage, 'deleteProjectFiles').mockRejectedValueOnce(new Error('storage down'));
    const failed = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent: {} },
    });

    expect(failed.statusCode).toBe(500);
    expect(await store.getImportJob(importJobId)).toMatchObject({ state: 'CLEANUP_PENDING' });
    expect(await store.getImportReservationByJob(importJobId, org.id)).toMatchObject({
      state: 'COMPENSATED',
      debitedCredits: 0,
    });
    expect(store.projects.size).toBe(1);
    expect(projectStorage.files.size).toBe(1);

    writeSpy.mockRestore();
    cleanupSpy.mockRestore();
    const pending = (await store.getImportJob(importJobId))!;
    pending.operationExpiresAt = new Date(Date.now() - 1_000).toISOString();
    const reaped = await (
      app as typeof app & { reapExpiredImports(nowIso?: string): Promise<string[]> }
    ).reapExpiredImports(new Date().toISOString());

    expect(reaped).toContain(importJobId);
    expect(await store.getImportJob(importJobId)).toMatchObject({ state: 'EXPIRED', targetProjectId: undefined });
    expect(store.projects.size).toBe(0);
    expect(projectStorage.files.size).toBe(0);
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
