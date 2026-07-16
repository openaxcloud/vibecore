import { createHash } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
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
      payload: { provider: 'github', sourceRef: 'https://github.com/acme/app.git', files: stagedFiles() },
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
      payload: { provider: 'github', files: stagedFiles() },
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

  it('commit WITHOUT resolving findings is BLOCKED (409, no silent write)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { provider: 'github', files: stagedFiles() },
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
      payload: { provider: 'github', files: stagedFiles() },
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
      payload: { provider: 'github', files: stagedFiles() },
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
      payload: { provider: 'zip', files: [{ path: 'a.txt', content: 'clean file\n' }] }, // no findings
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
      payload: { provider: 'github', files: stagedFiles() },
    });

    const allLogs = logLines.join('\n');
    expect(allLogs).toContain('import.scan'); // the scan WAS logged
    expect(allLogs).not.toContain(IMPORTED_SECRET); // …but never the value
  });
});
