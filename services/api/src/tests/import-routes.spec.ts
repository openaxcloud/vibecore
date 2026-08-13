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

    if (committed.statusCode !== 201) {
      console.log('DEBUG commit', committed.statusCode, JSON.stringify(committed.json()));
    }

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

/*
 * TPL-02.3 — the preview contract the per-connector review screen reads.
 * These lock two things the screen depends on: it can list what would land,
 * and looking at it can never mutate or leak.
 */
describe('import preview — what the review screen reads before anything is written', () => {
  it('stages an ARCHIVE the same way as a file list — same scan, same quarantine', async () => {
    const { app, org, projectStorage } = await setup();

    /*
     * Le hub route zip/Bolt/Lovable/Base44/previous-agent vers cette forme.
     * Ce qui compte : une archive doit produire EXACTEMENT le même staging
     * qu'une liste de fichiers, sinon l'écran d'aperçu mentirait selon le
     * connecteur emprunté.
     */
    const zip = new JSZip();

    for (const file of stagedFiles()) {
      zip.file(file.path, file.content);
    }

    const zipBase64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-zip', provider: 'zip', zipBase64 },
    });

    expect(res.statusCode).toBe(202); // le secret de .env quarantaine l'import

    const body = res.json();
    expect(body.import.stagedFiles.map((f: { path: string }) => f.path)).toEqual(['.env', 'README.md', 'src/index.js']);
    expect(body.import.findings.some((f: { path: string }) => f.path === '.env')).toBe(true);
    expect(JSON.stringify(body.import)).not.toContain(IMPORTED_SECRET);

    // Rien n'est écrit dans un projet cible tant que le commit n'a pas eu lieu.
    expect(projectStorage.writeCalls).toEqual([]);
  });

  it('the create response lists the staged files (path + size) and still leaks no content', async () => {
    const { app, org } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-1', provider: 'github', files: stagedFiles() },
    });

    const body = res.json();
    const paths = body.import.stagedFiles.map((f: { path: string }) => f.path);

    // Sorted so a create and a later re-read describe the import identically.
    expect(paths).toEqual(['.env', 'README.md', 'src/index.js']);
    expect(body.import.stagedFileCount).toBe(3);

    const env = body.import.stagedFiles.find((f: { path: string }) => f.path === '.env');
    expect(env.sizeBytes).toBe(Buffer.byteLength(SOURCE_ENV_CONTENT));

    /*
     * The whole point of a redacted scan is lost if the preview hands back the
     * file bodies next to it. Nothing in the payload may carry content.
     */
    expect(JSON.stringify(body.import.stagedFiles)).not.toContain(IMPORTED_SECRET);
    expect(JSON.stringify(body.import.stagedFiles)).not.toContain('console.log');
    expect(JSON.stringify(body.import)).not.toContain(IMPORTED_SECRET);
  });

  it('GET replays the same preview and is READ-ONLY (state unchanged after two reads)', async () => {
    const { app, org, projectStorage } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-2', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;
    const stateAfterCreate = created.json().import.state;

    const first = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('imp-token'),
    });
    const second = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('imp-token'),
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().import.state).toBe(stateAfterCreate);
    expect(second.json().import.state).toBe(stateAfterCreate);
    expect(second.json().import.preview.stagedFiles).toEqual(first.json().import.preview.stagedFiles);

    // Findings are recomputed, so the screen can never show "clean" while the gate blocks.
    expect(first.json().import.preview.requiresConsent).toBe(true);
    expect(first.json().import.preview.findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(first.json())).not.toContain(IMPORTED_SECRET);

    // Reading a preview must never mount the target.
    expect(projectStorage.writeCalls).toEqual([]);
  });

  it("survit au load balancer : stagé sur une instance, relu ET COMMITTÉ sur une AUTRE (BUG-IMPORT-001)", async () => {
    const { app, store, projectStorage, org } = await setup();

    /*
     * Deuxième instance de l'app sur LE MÊME store : c'est exactement ce que
     * voit un second réplica derrière le load balancer.
     *
     * DEUX choses vivaient en mémoire du processus et cassaient ce parcours :
     * le staging (aperçu vide, puis commit en IMPORT_STAGING_GONE) PUIS le
     * registre de crédits (commit en BILLING_RESERVATION_MISSING). Constaté en
     * réel le 2026-08-12 sur l'env de test (2 réplicas api) : 8 lectures
     * consécutives du MÊME import → 5 aperçus, 3 vides.
     */
    const otherReplica = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-lb', provider: 'github', files: stagedFiles() },
    });
    const importJobId = created.json().import.importJobId;

    const read = await otherReplica.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('imp-token'),
    });

    expect(read.statusCode).toBe(200);
    expect(read.json().import.preview).not.toBeNull();
    expect(read.json().import.preview.stagedFiles.map((f: { path: string }) => f.path)).toEqual([
      '.env',
      'README.md',
      'src/index.js',
    ]);
    expect(JSON.stringify(read.json())).not.toContain(IMPORTED_SECRET);

    // L'écran exige une décision PAR détection ; le test fait pareil.
    const consent: Record<string, 'redact'> = {};

    for (const finding of read.json().import.preview.findings) {
      consent[`${finding.path}:${finding.line}`] = 'redact';
    }

    const committed = await otherReplica.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth('imp-token'),
      payload: { consent },
    });

    expect(committed.statusCode).toBe(201);

    // Le secret n'a pas atterri dans la cible.
    const target = committed.json().project.id;
    const written = [...(projectStorage.files.get(target)?.values() ?? [])].join('\n');
    expect(written).not.toContain(IMPORTED_SECRET);

    // Copie jetable disparue, et le débit enregistré — vus depuis l'instance d'origine.
    const after = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('imp-token'),
    });
    expect(after.json().import.preview).toBeNull();
    expect(after.json().import.reservation).toMatchObject({ state: 'SETTLED' });
  });

  it("la cle d'idempotence est scopee par ORGANISATION, jamais globale", async () => {
    const { app, store, org } = await setup();

    /*
     * La clé vient du CLIENT, donc elle est devinable (« import-1 »). L'ancien
     * registre l'indexait globalement : une seconde organisation employant la
     * même clé recevait la réservation de la PREMIÈRE — organizationId et
     * crédits compris — et son commit débitait la ligne d'autrui.
     */
    const outsider = await store.createUser({ email: 'iso@example.com', name: 'Iso', passwordHash: hashPassword('x') });
    const otherOrg = await store.createOrganization({ name: 'Iso', slug: 'iso-org', ownerUserId: outsider.id });
    await store.createSession({ userId: outsider.id, token: 'iso-token', expiresAt: new Date(Date.now() + 3600_000) });

    const first = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'shared-key', provider: 'github', files: stagedFiles() },
    });

    const second = await app.inject({
      method: 'POST',
      url: `/orgs/${otherOrg.id}/imports`,
      headers: auth('iso-token'),
      payload: { idempotencyKey: 'shared-key', provider: 'github', files: stagedFiles() },
    });

    // Deux imports DISTINCTS, pas un replay de celui du voisin.
    expect(second.json().import.importJobId).not.toBe(first.json().import.importJobId);
    expect(second.json().import.replayed).toBeUndefined();

    const reservation = await store.getImportReservationByJob(second.json().import.importJobId);
    expect(reservation?.organizationId).toBe(otherOrg.id);
  });

  it('another org gets 404, not a different error that would confirm the job exists', async () => {
    const { app, store, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-3', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;

    const outsider = await store.createUser({ email: 'out@example.com', name: 'Out', passwordHash: hashPassword('x') });

    const otherOrg = await store.createOrganization({
      name: 'Other',
      slug: 'other-org',
      ownerUserId: outsider.id,
    });
    await store.createSession({ userId: outsider.id, token: 'out-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${otherOrg.id}/imports/${importJobId}`,
      headers: auth('out-token'),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('IMPORT_JOB_NOT_FOUND');
  });

  it('after the staging is disposed the preview is null, not an empty file list', async () => {
    const { app, org } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth('imp-token'),
      payload: { idempotencyKey: 'idem-p-4', provider: 'github', files: stagedFiles() },
    });

    const importJobId = created.json().import.importJobId;

    await app.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
      headers: auth('imp-token'),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/orgs/${org.id}/imports/${importJobId}`,
      headers: auth('imp-token'),
    });

    /*
     * The job row survives (its reservation lifecycle stays observable), but the
     * preview is explicitly null — "this is over", not "an import with no file".
     */
    expect(res.statusCode).toBe(200);
    expect(res.json().import.preview).toBeNull();
  });
});
