import { hashPassword } from '@vibecore/auth';
import { encryptJson } from '@vibecore/security';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import type { ProjectFile, ProjectStorage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/**
 * In-memory ProjectStorage that ALSO supports snapshot archives, so the gallery
 * remix can be pinned to an immutable release and we can prove the clone
 * reproduces the pinned snapshot rather than the live source.
 */
class SnapshotProjectStorage implements ProjectStorage {
  readonly files = new Map<string, Map<string, string>>();
  readonly snapshots = new Map<string, ProjectFile[]>();
  private seq = 0;

  async writeFiles(projectId: string, files: Array<{ path: string; content: string }>) {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    for (const file of files) bucket.set(file.path, file.content);
    this.files.set(projectId, bucket);
    return this.listFiles(projectId);
  }

  async listFiles(projectId: string): Promise<ProjectFile[]> {
    const bucket = this.files.get(projectId) ?? new Map<string, string>();
    const updatedAt = new Date().toISOString();
    return [...bucket.entries()].map(([path, content]) => ({ path, content, updatedAt }));
  }

  async createSnapshot(input: { projectId: string; label?: string; files: ProjectFile[] }) {
    const storageKey = `snap-${(this.seq += 1)}`;
    // Deep-copy so a later live edit cannot mutate the pinned archive.
    this.snapshots.set(
      storageKey,
      input.files.map((f) => ({ ...f })),
    );
    return { id: storageKey, storageKey, byteLength: 1, createdAt: new Date().toISOString() };
  }

  async getSnapshotFiles(storageKey: string): Promise<ProjectFile[]> {
    return (this.snapshots.get(storageKey) ?? []).map((f) => ({ ...f }));
  }

  // Interface no-ops not exercised here.
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
  async restoreSnapshot() {
    return [];
  }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function seedGallery() {
  const store = new TestApiStore();
  const projectStorage = new SnapshotProjectStorage();
  const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

  const author = await store.createUser({
    email: 'author@example.com',
    name: 'Ada Lovelace',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Author Org', slug: 'author-org', ownerUserId: author.id });

  // A curated source project + an immutable snapshot to pin listings to.
  const mkListing = async (opts: {
    slug: string;
    title: string;
    category: string;
    tags?: string[];
    status?: string;
    featured?: boolean;
    files: ProjectFile[];
  }) => {
    const project = await store.createProject({ organizationId: org.id, name: opts.title, slug: opts.slug });
    await projectStorage.writeFiles(project.id, opts.files);
    const archive = await projectStorage.createSnapshot({ projectId: project.id, files: opts.files });
    const snapshot = await store.createSnapshot({
      projectId: project.id,
      kind: 'manual',
      manifest: { files: opts.files.map((f) => f.path) },
      storageKey: archive.storageKey,
    });
    const listing = await store.createGalleryListing({
      slug: opts.slug,
      title: opts.title,
      description: `${opts.title} — a curated sample app`,
      category: opts.category,
      tags: opts.tags,
      status: opts.status,
      featured: opts.featured,
      sourceProjectId: project.id,
      sourceSnapshotId: snapshot.id,
      authorName: 'Ada Lovelace',
      authorUserId: author.id,
      appUrl: `https://${opts.slug}.example.com`,
    });
    return { project, snapshot, listing };
  };

  return { app, store, projectStorage, org, author, mkListing };
}

describe('GET /gallery — public browse / search / categories / detail', () => {
  it('lists PUBLISHED listings with author + public stats and category facets', async () => {
    const { app, mkListing } = await seedGallery();
    await mkListing({ slug: 'todo-app', title: 'Todo App', category: 'web', tags: ['react'], files: [{ path: 'a.ts', content: '1', updatedAt: '' }] });
    await mkListing({ slug: 'chat-bot', title: 'Chat Bot', category: 'ml-ai', tags: ['python'], featured: true, files: [{ path: 'b.py', content: '1', updatedAt: '' }] });
    // A non-published (curated, pending) listing must NEVER show up publicly.
    await mkListing({ slug: 'draft-app', title: 'Draft', category: 'web', status: 'PENDING_REVIEW', files: [{ path: 'c.ts', content: '1', updatedAt: '' }] });

    const res = await app.inject({ method: 'GET', url: '/gallery' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const slugs = body.results.map((r: { slug: string }) => r.slug);
    expect(slugs).toContain('todo-app');
    expect(slugs).toContain('chat-bot');
    expect(slugs).not.toContain('draft-app'); // PENDING_REVIEW is hidden
    // Featured leads the grid.
    expect(body.results[0].slug).toBe('chat-bot');
    // Author + public stats surfaced.
    expect(body.results[0].author).toBe('Ada Lovelace');
    expect(body.results[0]).toHaveProperty('views');
    expect(body.results[0]).toHaveProperty('uses');
    // Category facets computed over published rows only (draft excluded).
    const catIds = body.categories.map((c: { id: string }) => c.id);
    expect(catIds).toContain('web');
    expect(catIds).toContain('ml-ai');
    const web = body.categories.find((c: { id: string }) => c.id === 'web');
    expect(web.count).toBe(1); // only todo-app; draft excluded
  });

  it('filters by category and by free-text search', async () => {
    const { app, mkListing } = await seedGallery();
    await mkListing({ slug: 'todo-app', title: 'Todo App', category: 'web', tags: ['react'], files: [{ path: 'a', content: '1', updatedAt: '' }] });
    await mkListing({ slug: 'chat-bot', title: 'Chat Bot', category: 'ml-ai', tags: ['python'], files: [{ path: 'b', content: '1', updatedAt: '' }] });

    const byCat = await app.inject({ method: 'GET', url: '/gallery?category=ml-ai' });
    expect(byCat.json().results.map((r: { slug: string }) => r.slug)).toEqual(['chat-bot']);

    const bySearch = await app.inject({ method: 'GET', url: '/gallery?q=todo' });
    expect(bySearch.json().results.map((r: { slug: string }) => r.slug)).toEqual(['todo-app']);
  });

  it('serves a detail page and counts a view; hides unpublished / unknown slugs', async () => {
    const { app, mkListing } = await seedGallery();
    await mkListing({ slug: 'todo-app', title: 'Todo App', category: 'web', files: [{ path: 'a', content: '1', updatedAt: '' }] });

    const detail = await app.inject({ method: 'GET', url: '/gallery/todo-app' });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().listing.slug).toBe('todo-app');
    expect(detail.json().listing.views).toBe(1); // this view counted

    // A second view increments again.
    const detail2 = await app.inject({ method: 'GET', url: '/gallery/todo-app' });
    expect(detail2.json().listing.views).toBe(2);

    const missing = await app.inject({ method: 'GET', url: '/gallery/does-not-exist' });
    expect(missing.statusCode).toBe(404);
  });
});

describe('POST /gallery/:slug/remix — pinned, secure fork into the remixer org', () => {
  const SECRET_VALUE = 'FIXTURE-not-a-real-secret-a1b2c3d4e5f6-DO-NOT-LEAK';
  const ENV_VALUE = 'postgres://user:SuperSecretDbPassword@db.internal:5432/app';

  async function setupRemix() {
    const ctx = await seedGallery();
    const { store, projectStorage } = ctx;

    // Source project with a real secret + a .env materializing it, snapshotted.
    const source = await store.createProject({ organizationId: ctx.org.id, name: 'Paid App', slug: 'paid-app' });
    await store.upsertProjectSecret({
      projectId: source.id,
      key: 'STRIPE_KEY',
      valueEncrypted: encryptJson({ value: SECRET_VALUE }),
    });
    await store.upsertProjectEnvVar({ projectId: source.id, key: 'DATABASE_URL', value: ENV_VALUE });

    const snapshotFiles: ProjectFile[] = [
      { path: 'src/app.ts', content: 'console.log("SNAPSHOT_V1");\n', updatedAt: '' },
      { path: '.env', content: `PORT=3000\nSTRIPE_KEY=${SECRET_VALUE}\nDATABASE_URL=${ENV_VALUE}\n`, updatedAt: '' },
      { path: 'README.md', content: '# Paid App\n', updatedAt: '' },
    ];
    await projectStorage.writeFiles(source.id, snapshotFiles);
    const archive = await projectStorage.createSnapshot({ projectId: source.id, files: snapshotFiles });
    const snapshot = await store.createSnapshot({
      projectId: source.id,
      kind: 'manual',
      manifest: { files: snapshotFiles.map((f) => f.path) },
      storageKey: archive.storageKey,
    });
    const listing = await store.createGalleryListing({
      slug: 'paid-app',
      title: 'Paid App',
      description: 'A paid app with a secret',
      category: 'web',
      sourceProjectId: source.id,
      sourceSnapshotId: snapshot.id,
      authorName: 'Ada Lovelace',
      authorUserId: ctx.author.id,
      // FAIL-CLOSED : un fixture remixable déclare sa licence explicitement.
      remixAllowed: true,
      licenseId: 'MIT',
      licenseText: 'MIT License — fixture',
      licenseTextSha256: 'f'.repeat(64),
    });

    // ---- Mutate the LIVE source AFTER the snapshot: the pin must ignore this. ----
    await projectStorage.writeFiles(source.id, [
      { path: 'src/app.ts', content: 'console.log("LIVE_EDIT_V2_AFTER_SNAPSHOT");\n' },
    ]);

    // The remixer: a DIFFERENT user + org.
    const remixer = await store.createUser({
      email: 'remixer@example.com',
      name: 'Remixer',
      passwordHash: hashPassword('password123'),
    });
    const remixerOrg = await store.createOrganization({ name: 'Remixer Org', slug: 'remixer-org', ownerUserId: remixer.id });
    await store.createSession({ userId: remixer.id, token: 'remixer-token', expiresAt: new Date(Date.now() + 3600_000) });

    return { ...ctx, source, snapshot, listing, remixer, remixerOrg };
  }

  it('clones the PINNED snapshot into the remixer org; secret is nowhere in the clone', async () => {
    const { app, store, projectStorage, snapshot, listing, remixerOrg } = await setupRemix();

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/paid-app/remix',
      headers: auth('remixer-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    const cloneId = body.project.id;

    // (1) The clone lands in the REMIXER's org, not the author's.
    expect(body.project.organizationId).toBe(remixerOrg.id);

    // (2) The remix is pinned to the listing's immutable snapshot (provenance).
    expect(body.remix.sourceSnapshotId).toBe(snapshot.id);
    expect(body.remix.sourceListingId).toBe(listing.id);
    const job = await store.getRemixJob(body.remix.remixJobId);
    expect(job?.sourceSnapshotId).toBe(snapshot.id);
    expect(job?.sourceListingId).toBe(listing.id);
    expect(job?.state).toBe('COMPLETED');

    // (3) IMMUTABLE PIN: the clone reflects the SNAPSHOT (V1), NOT the later live edit (V2).
    const cloneFiles = await projectStorage.listFiles(cloneId);
    const appFile = cloneFiles.find((f) => f.path === 'src/app.ts');
    expect(appFile?.content).toContain('SNAPSHOT_V1');
    expect(appFile?.content).not.toContain('LIVE_EDIT_V2_AFTER_SNAPSHOT');

    // (4) THE PROOF: secret value is NOWHERE in the clone (files, DB, job).
    const allFileText = cloneFiles.map((f) => f.content).join('\n');
    expect(allFileText).not.toContain(SECRET_VALUE);
    expect(allFileText).not.toContain(ENV_VALUE);
    const envFile = cloneFiles.find((f) => f.path === '.env');
    expect(envFile?.content).toContain('STRIPE_KEY='); // key kept as a reference
    expect(await store.listProjectSecrets(cloneId)).toEqual([]);
    expect(await store.listProjectEnvVars(cloneId)).toEqual([]);
    expect(JSON.stringify(job)).not.toContain(SECRET_VALUE);
    expect(JSON.stringify(job)).not.toContain(ENV_VALUE);

    // (5) The successful fork counted as a "use".
    const detail = await app.inject({ method: 'GET', url: '/gallery/paid-app' });
    expect(detail.json().listing.uses).toBe(1);
  });

  it('EXHAUSTIVE secret hunt: the value is actively searched across files + DB + env + logs + job and found NOWHERE the remix could leak it — only in the source it came from', async () => {
    const { app, store, projectStorage, source, remixer, remixerOrg } = await setupRemix();

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/paid-app/remix',
      headers: auth('remixer-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    const cloneId: string = body.project.id;
    const job = await store.getRemixJob(body.remix.remixJobId);

    /*
     * The hunt: given any haystack (a string or an object we serialize), return
     * which of the secrets it contains. A leak-proof surface returns [] for BOTH.
     * We hunt for the STRIPE key value AND the DATABASE_URL value (a distinct env
     * secret) so a partial scrub cannot pass.
     */
    const SECRETS = [SECRET_VALUE, ENV_VALUE];
    const hunt = (haystack: unknown): string[] => {
      const text = typeof haystack === 'string' ? haystack : JSON.stringify(haystack ?? null);
      return SECRETS.filter((secret) => text.includes(secret));
    };
    const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

    // ───────── SURFACE 1 · FILES (the clone's files, every one of them) ─────────
    const cloneFiles = await projectStorage.listFiles(cloneId);
    for (const file of cloneFiles) {
      expect(hunt(file.content), `secret leaked into clone file ${file.path}`).toEqual([]);
    }
    // The .env is preserved as a REFERENCE: the keys stay, the values are gone.
    const cloneEnv = cloneFiles.find((f) => f.path === '.env');
    expect(cloneEnv?.content).toMatch(/STRIPE_KEY=/);
    expect(cloneEnv?.content).toMatch(/DATABASE_URL=/);
    expect(cloneEnv?.content).toContain('# detached on remix');
    expect(hunt(cloneEnv?.content)).toEqual([]);

    // ───────── SURFACE 2 · DB (the encrypted secret store) ─────────
    expect(await store.listProjectSecrets(cloneId)).toEqual([]);
    for (const [, rec] of store.projectSecrets) {
      if (asRecord(rec).projectId === cloneId) expect(hunt(rec), 'secret leaked into clone projectSecrets').toEqual([]);
    }

    // ───────── SURFACE 3 · ENV (the plaintext env-var store) ─────────
    expect(await store.listProjectEnvVars(cloneId)).toEqual([]);
    for (const [, rec] of store.projectEnvVars) {
      if (asRecord(rec).projectId === cloneId) expect(hunt(rec), 'secret leaked into clone projectEnvVars').toEqual([]);
    }

    // ───────── SURFACE 4 · LOGS (audit, admin audit, security, activity, notifications) ─────────
    const logSurfaces: Array<readonly [string, unknown]> = [
      ['auditLogs', await store.listAuditLogs()],
      ['securityAuditEvents', await store.listSecurityAuditEvents()],
      ['adminAuditLogs', await store.listAdminAuditLogs()],
      ['cloneProjectActivity', await store.listProjectActivity(cloneId)],
      ['remixerNotifications', await store.listNotificationsByUser({ userId: remixer.id })],
    ];
    for (const [name, rows] of logSurfaces) {
      expect(hunt(rows), `secret leaked into ${name}`).toEqual([]);
    }
    // Non-vacuous: the remix WAS audited, so this surface is genuinely populated (not empty-by-accident).
    expect((await store.listAuditLogs()).length).toBeGreaterThan(0);

    // ───────── SURFACE 5 · JOB (the remix job record) ─────────
    expect(hunt(job), 'secret leaked into the remix job').toEqual([]);
    // The KEYS are kept on the job as a reference ({ secretKeys, envVarKeys }); the VALUES never are.
    const detached = asRecord(job?.detachedKeys);
    expect(detached.secretKeys).toEqual(expect.arrayContaining(['STRIPE_KEY']));
    expect(detached.envVarKeys).toEqual(expect.arrayContaining(['DATABASE_URL']));

    /*
     * ───────── WHOLE-STORE SWEEP ─────────
     * Walk EVERY in-memory collection on the store plus the file store, and hunt
     * for the secret in each entry. The search is only meaningful if it can
     * actually find the value — so it MUST locate it in the source (where it
     * legitimately lives) and MUST NOT find it anywhere else (any clone-scoped
     * row, any log, the job, a notification…). The only sanctioned hiding places
     * are the source project's own secret/env rows and the source's file bucket +
     * immutable snapshot the listing was pinned to.
     */
    const leaks: string[] = [];
    let foundInSource = false;
    const isSourceSecretRow = (field: string, v: unknown) =>
      (field === 'projectSecrets' || field === 'projectEnvVars') && asRecord(v).projectId === source.id;

    for (const [field, value] of Object.entries(store as unknown as Record<string, unknown>)) {
      const entries: Array<[unknown, unknown]> | null =
        value instanceof Map ? [...value.entries()] : Array.isArray(value) ? value.map((v, i) => [i, v]) : null;
      if (!entries) continue;
      for (const [key, entry] of entries) {
        if (hunt(entry).length === 0) continue;
        if (isSourceSecretRow(field, entry)) {
          foundInSource = true;
          continue;
        }
        leaks.push(`${field}[${String(key)}]`);
      }
    }
    // The raw file store: the SOURCE bucket + the immutable snapshots may hold the
    // value; the CLONE bucket (and any other project's bucket) must not.
    for (const [projectId, bucket] of projectStorage.files) {
      for (const [path, content] of bucket) {
        if (hunt(content).length === 0) continue;
        if (projectId === source.id) foundInSource = true;
        else leaks.push(`files:${projectId}/${path}`);
      }
    }
    for (const [, files] of projectStorage.snapshots) {
      // snapshots are the immutable SOURCE archive — a legit hiding place.
      if (files.some((f) => hunt(f.content).length > 0)) foundInSource = true;
    }

    expect(leaks, `secret leaked outside the source into: ${leaks.join(', ') || '(none)'}`).toEqual([]);
    // Proof the hunt is NOT vacuous: it positively located the secret where it belongs.
    expect(foundInSource, 'the hunt never found the secret even in the source — the search itself is broken').toBe(true);
  });

  it('requires authentication (anonymous remix is rejected)', async () => {
    const { app, remixerOrg } = await setupRemix();
    const res = await app.inject({
      method: 'POST',
      url: '/gallery/paid-app/remix',
      payload: { organizationId: remixerOrg.id },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404s a remix of an unknown / unpublished listing', async () => {
    const { app, remixerOrg } = await setupRemix();
    const res = await app.inject({
      method: 'POST',
      url: '/gallery/nope/remix',
      headers: auth('remixer-token'),
      payload: { organizationId: remixerOrg.id },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Gallery remix — versioned license + consent + PII masking (P0-V3-05 / I-RMX-3)', () => {
  const LICENSE_TEXT = 'MIT License\n\nPermission is hereby granted, free of charge…';
  const PII_EMAIL = 'jane.doe@realmail.example-corp.fr';
  const PII_PHONE = '+33 6 12 34 56 78';
  const PII_CARD = '4242 4242 4242 4242'; // Luhn-valid test number
  const PII_IBAN = 'FR76 3000 6000 0112 3456 7890 189';
  const PII_NAME = 'Jane Doe'; // réserve #2 : un NOM est une donnée personnelle

  async function setupLicensed(listingOverrides: Record<string, unknown> = {}) {
    const ctx = await seedGallery();
    const { store, projectStorage } = ctx;

    const source = await store.createProject({ organizationId: ctx.org.id, name: 'CRM App', slug: 'crm-app' });
    const snapshotFiles: ProjectFile[] = [
      {
        path: 'seed/customers.csv',
        content: `name,email,phone,card,iban\n${PII_NAME},${PII_EMAIL},${PII_PHONE},${PII_CARD},${PII_IBAN}\n`,
        updatedAt: '',
      },
      { path: 'src/app.ts', content: 'export const CONTACT = "support@example.com";\n', updatedAt: '' },
    ];
    await projectStorage.writeFiles(source.id, snapshotFiles);
    const archive = await projectStorage.createSnapshot({ projectId: source.id, files: snapshotFiles });
    const snapshot = await store.createSnapshot({
      projectId: source.id,
      kind: 'manual',
      manifest: { files: snapshotFiles.map((f) => f.path) },
      storageKey: archive.storageKey,
    });
    const { createHash } = await import('node:crypto');
    const listing = await store.createGalleryListing({
      slug: 'crm-app',
      title: 'CRM App',
      description: 'A CRM sample with seeded customer data',
      category: 'web',
      sourceProjectId: source.id,
      sourceSnapshotId: snapshot.id,
      authorName: 'Ada Lovelace',
      authorUserId: ctx.author.id,
      licenseId: 'MIT',
      licenseText: LICENSE_TEXT,
      licenseTextSha256: createHash('sha256').update(LICENSE_TEXT, 'utf8').digest('hex'),
      remixAllowed: true,
      ...listingOverrides,
    });

    const remixer = await store.createUser({
      email: 'remixer2@example.com',
      name: 'Remixer Two',
      passwordHash: hashPassword('password123'),
    });
    const remixerOrg = await store.createOrganization({
      name: 'Remixer Two Org',
      slug: 'remixer-two-org',
      ownerUserId: remixer.id,
    });
    await store.createSession({
      userId: remixer.id,
      token: 'remixer2-token',
      expiresAt: new Date(Date.now() + 3600_000),
    });

    return { ...ctx, source, snapshot, listing, remixerOrg };
  }

  it('REFUSES the remix without explicit license acceptance (400 REMIX_CONSENT_REQUIRED)', async () => {
    const { app, store, remixerOrg } = await setupLicensed();

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/crm-app/remix',
      headers: auth('remixer2-token'),
      payload: { organizationId: remixerOrg.id }, // no acceptLicense
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('REMIX_CONSENT_REQUIRED');
    // The refusal carries what there IS to accept (so a client can render it).
    expect(body.license.id).toBe('MIT');
    expect(body.remixConsentVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);
    // Negative proof: nothing was cloned.
    expect([...store.remixJobs.values()]).toHaveLength(0);
  });

  it('REFUSES the remix when the author disallowed forking (403 REMIX_NOT_ALLOWED)', async () => {
    const { app, store, remixerOrg } = await setupLicensed({ remixAllowed: false });

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/crm-app/remix',
      headers: auth('remixer2-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REMIX_NOT_ALLOWED');
    expect([...store.remixJobs.values()]).toHaveLength(0);
  });

  it('records the VERSIONED license + consent on the job, immune to later listing edits', async () => {
    const { app, store, listing, remixerOrg } = await setupLicensed();

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/crm-app/remix',
      headers: auth('remixer2-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();

    const job = await store.getRemixJob(body.remix.remixJobId);
    const snapshotOnJob = job?.licenseSnapshot as {
      licenseId: string;
      licenseTextSha256: string;
      sourceListingId: string;
    };
    expect(snapshotOnJob.licenseId).toBe('MIT');
    expect(snapshotOnJob.licenseTextSha256).toBe(listing.licenseTextSha256);
    expect(snapshotOnJob.sourceListingId).toBe(listing.id);
    expect(job?.consentVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);

    // IMMUTABILITY: rewriting the listing's license later must not touch the job.
    listing.licenseId = 'Apache-2.0';
    listing.licenseTextSha256 = 'rewritten';
    const jobAfter = await store.getRemixJob(body.remix.remixJobId);
    expect((jobAfter?.licenseSnapshot as { licenseId: string }).licenseId).toBe('MIT');
  });

  it('MASKS PII in the clone (no author consent): name, email, phone, card, iban gone; fixtures kept', async () => {
    const { app, store, projectStorage, remixerOrg } = await setupLicensed();

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/crm-app/remix',
      headers: auth('remixer2-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();

    const cloneFiles = await projectStorage.listFiles(body.project.id);
    const allText = cloneFiles.map((f) => f.content).join('\n');

    // NON-VACUITÉ : sans ça, un clone vide ferait passer toutes les négations.
    expect(allText.length).toBeGreaterThan(0);

    // THE PROOF: the person's data is nowhere in the clone — LES 5 CATÉGORIES.
    // Le NOM (réserve #2) est inclus : avant ce lot, « Jane Doe » survivait.
    for (const secret of [PII_NAME, PII_EMAIL, PII_PHONE, PII_CARD, PII_IBAN]) {
      expect(allText, secret).not.toContain(secret);
    }

    for (const marker of ['name', 'email', 'phone', 'card', 'iban']) {
      expect(allText, marker).toContain(`[PII:${marker} masked on remix]`);
    }

    // Aucun FRAGMENT résiduel : le dernier groupe de l'IBAN ne doit pas
    // survivre au masquage (défaut vu en preuve live le 2026-08-04).
    expect(allText).not.toContain('189');

    // RFC 2606 fixture addresses are NOT someone's data — kept.
    expect(allText).toContain('support@example.com');

    // The job records WHAT was masked (kind + location), never the value.
    expect(body.remix.piiMaskedCount).toBeGreaterThanOrEqual(5);
    const job = await store.getRemixJob(body.remix.remixJobId);
    expect(job?.piiMaskedCount).toBe(body.remix.piiMaskedCount);
    expect(JSON.stringify(job)).not.toContain(PII_EMAIL);
    expect(JSON.stringify(job)).not.toContain('4242');
  });

  it('SKIPS masking when the author gave explicit versioned consent — recorded, not silent', async () => {
    const { app, store, projectStorage, remixerOrg } = await setupLicensed({ piiConsentVersion: '2026-07-20.1' });

    const res = await app.inject({
      method: 'POST',
      url: '/gallery/crm-app/remix',
      headers: auth('remixer2-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();

    const cloneFiles = await projectStorage.listFiles(body.project.id);
    const allText = cloneFiles.map((f) => f.content).join('\n');
    expect(allText).toContain(PII_EMAIL); // shipped as-is — author consented
    expect(body.remix.piiMaskedCount).toBe(0);

    const job = await store.getRemixJob(body.remix.remixJobId);
    expect(job?.piiMaskedCount).toBe(0);
    expect(job?.state).toBe('COMPLETED');
  });

  it('exposes license + remixAllowed + PII handling on the public listing and detail', async () => {
    const { app } = await setupLicensed();

    const list = await app.inject({ method: 'GET', url: '/gallery' });
    const row = list.json().results.find((r: { slug: string }) => r.slug === 'crm-app');
    expect(row.license.id).toBe('MIT');
    expect(row.remixAllowed).toBe(true);
    expect(row.piiHandling.mode).toBe('MASKED');

    const detail = await app.inject({ method: 'GET', url: '/gallery/crm-app' });
    const shown = detail.json().listing;
    expect(shown.licenseText).toBe(LICENSE_TEXT);
    expect(shown.remixConsentVersion).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });
});

describe('POST /admin/gallery-listings — curator publish (no self-service)', () => {
  async function setupCurator() {
    const store = new TestApiStore();
    const projectStorage = new SnapshotProjectStorage();
    const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });

    const admin = await store.createUser({
      email: 'curator@example.com',
      name: 'Curator',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true });
    await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });
    await app.inject({ method: 'POST', url: '/auth/reauth', headers: auth('admin-token'), payload: { password: 'password123' } });

    const org = await store.createOrganization({ name: 'Curator Org', slug: 'curator-org', ownerUserId: admin.id });
    const source = await store.createProject({ organizationId: org.id, name: 'Sample', slug: 'sample' });
    const files: ProjectFile[] = [{ path: 'index.js', content: 'console.log(1);\n', updatedAt: '' }];
    await projectStorage.writeFiles(source.id, files);
    const archive = await projectStorage.createSnapshot({ projectId: source.id, files });
    const snapshot = await store.createSnapshot({ projectId: source.id, kind: 'manual', manifest: {}, storageKey: archive.storageKey });

    return { app, store, source, snapshot, admin };
  }

  const listingBody = (source: string, snapshot: string) => ({
    slug: 'sample-app',
    title: 'Sample App',
    description: 'A curated sample',
    category: 'web',
    tags: ['demo'],
    sourceProjectId: source,
    sourceSnapshotId: snapshot,
    authorName: 'Curator',
  });

  it('a platform admin curates a listing; it then shows up in the public gallery', async () => {
    const { app, source, snapshot } = await setupCurator();

    const created = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('admin-token'),
      payload: listingBody(source.id, snapshot.id),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().listing.slug).toBe('sample-app');

    // It is now publicly browsable.
    const list = await app.inject({ method: 'GET', url: '/gallery' });
    expect(list.json().results.map((r: { slug: string }) => r.slug)).toContain('sample-app');
  });

  it('rejects a snapshot that does not belong to the source project (400)', async () => {
    const { app, store, source } = await setupCurator();
    const otherProject = await store.createProject({ organizationId: source.organizationId, name: 'Other', slug: 'other' });
    const otherSnap = await store.createSnapshot({ projectId: otherProject.id, kind: 'manual', manifest: {}, storageKey: 'x' });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('admin-token'),
      payload: listingBody(source.id, otherSnap.id),
    });
    expect(res.statusCode).toBe(400);
  });

  it('is NOT self-service — a non-admin user cannot create a listing', async () => {
    const { app, store, source, snapshot } = await setupCurator();
    const user = await store.createUser({ email: 'joe@example.com', name: 'Joe', passwordHash: hashPassword('password123') });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('user-token'),
      payload: listingBody(source.id, snapshot.id),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Politique licence FAIL-CLOSED (directive 20/07)', () => {
  // Curateur local (setupCurator est scoped dans le describe admin).
  async function mkCurator() {
    const store = new TestApiStore();
    const projectStorage = new SnapshotProjectStorage();
    const app = await buildApiApp({ store, projectStorage, emailProvider: new QuietEmailProvider() });
    const admin = await store.createUser({
      email: 'curator2@example.com',
      name: 'Curator2',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true });
    await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });
    await app.inject({ method: 'POST', url: '/auth/reauth', headers: auth('admin-token'), payload: { password: 'password123' } });
    const org = await store.createOrganization({ name: 'C2 Org', slug: 'c2-org', ownerUserId: admin.id });
    const source = await store.createProject({ organizationId: org.id, name: 'Sample2', slug: 'sample2' });
    const files: ProjectFile[] = [{ path: 'index.js', content: '1\n', updatedAt: '' }];
    await projectStorage.writeFiles(source.id, files);
    const archive = await projectStorage.createSnapshot({ projectId: source.id, files });
    const snapshot = await store.createSnapshot({ projectId: source.id, kind: 'manual', manifest: {}, storageKey: archive.storageKey });
    return { app, store, source, snapshot, admin };
  }

  it('un listing créé SANS choix explicite est NON-remixable par défaut', async () => {
    const { app, mkListing } = await seedGallery();
    await mkListing({ slug: 'plain-app', title: 'Plain App', category: 'web', files: [{ path: 'a', content: '1', updatedAt: '' }] });

    const detail = await app.inject({ method: 'GET', url: '/gallery/plain-app' });
    expect(detail.json().listing.remixAllowed).toBe(false); // ALL_RIGHTS_RESERVED par défaut
  });

  it('curation : remixAllowed=true SANS licence → 400 REMIX_LICENSE_REQUIRED', async () => {
    const { app, source, snapshot } = await mkCurator();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('admin-token'),
      payload: {
        slug: 'no-license', title: 'No License', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('REMIX_LICENSE_REQUIRED');
  });

  it('curation : licence fournie mais SANS confirmations droits/PII → 400 REMIX_RIGHTS_CONFIRMATION_REQUIRED', async () => {
    const { app, source, snapshot } = await mkCurator();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('admin-token'),
      payload: {
        slug: 'no-rights', title: 'No Rights', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true, licenseId: 'MIT', licenseText: 'MIT…',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('REMIX_RIGHTS_CONFIRMATION_REQUIRED');
  });

  it('défense en profondeur : listing marqué remixable mais SANS licence en base → remix 403 REMIX_LICENSE_REQUIRED', async () => {
    const ctx = await seedGallery();
    const { store, projectStorage, app } = ctx;
    const project = await store.createProject({ organizationId: ctx.org.id, name: 'Forced', slug: 'forced' });
    const files: ProjectFile[] = [{ path: 'a', content: '1', updatedAt: '' }];
    await projectStorage.writeFiles(project.id, files);
    const archive = await projectStorage.createSnapshot({ projectId: project.id, files });
    const snapshot = await store.createSnapshot({ projectId: project.id, kind: 'manual', manifest: {}, storageKey: archive.storageKey });
    // Contourne la route (écriture store directe) : remixable SANS licence.
    await store.createGalleryListing({
      slug: 'forced-app', title: 'Forced', description: 'x', category: 'web',
      sourceProjectId: project.id, sourceSnapshotId: snapshot.id, authorName: 'A',
      remixAllowed: true,
    });
    const remixer = await store.createUser({ email: 'rx@example.com', name: 'Rx', passwordHash: hashPassword('password123') });
    const remixerOrg = await store.createOrganization({ name: 'RxO', slug: 'rxo', ownerUserId: remixer.id });
    await store.createSession({ userId: remixer.id, token: 'rx-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'POST', url: '/gallery/forced-app/remix', headers: auth('rx-token'),
      payload: { organizationId: remixerOrg.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REMIX_LICENSE_REQUIRED'); // aucun fallback, jamais
  });

  /* ── réserve #7 : la licence doit AUTORISER la dérivation ─────────────── */

  it('curation : licence NON dérivable → 400 REMIX_LICENSE_NOT_DERIVATIVE', async () => {
    const { app, source, snapshot } = await mkCurator();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/gallery-listings',
      headers: auth('admin-token'),
      payload: {
        slug: 'nd-app', title: 'ND App', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true,
        // Le contre-exemple de l'audit : chaîne libre qui passait tous les gates.
        licenseId: 'PROPRIETARY — NO DERIVATIVES', licenseText: 'All rights reserved…',
        rightsConfirmed: true, piiPolicyAccepted: true,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('REMIX_LICENSE_NOT_DERIVATIVE');
  });

  it('curation : CC-BY-ND (no-derivatives) refusée avec la raison typée', async () => {
    const { app, source, snapshot } = await mkCurator();
    const res = await app.inject({
      method: 'POST', url: '/admin/gallery-listings', headers: auth('admin-token'),
      payload: {
        slug: 'ccnd-app', title: 'CC ND', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true, licenseId: 'CC-BY-ND-4.0', licenseText: 'CC BY-ND…',
        rightsConfirmed: true, piiPolicyAccepted: true,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toBe('NOT_DERIVATIVE');
  });

  it('curation : licence dérivable acceptée ET normalisée en SPDX canonique', async () => {
    const { app, source, snapshot } = await mkCurator();
    const res = await app.inject({
      method: 'POST', url: '/admin/gallery-listings', headers: auth('admin-token'),
      payload: {
        slug: 'ok-app', title: 'OK App', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true, licenseId: 'apache 2.0', licenseText: 'Apache License…',
        rightsConfirmed: true, piiPolicyAccepted: true,
      },
    });
    expect(res.statusCode).toBe(201);
    // La saisie brute « apache 2.0 » n'est JAMAIS persistée telle quelle.
    expect(res.json().listing.licenseId).toBe('Apache-2.0');
  });

  it('défense en profondeur : listing hérité à licence non dérivable → remix 403', async () => {
    const ctx = await seedGallery();
    const { store, projectStorage, app } = ctx;
    const project = await store.createProject({ organizationId: ctx.org.id, name: 'Legacy', slug: 'legacy' });
    const files: ProjectFile[] = [{ path: 'a', content: '1', updatedAt: '' }];
    await projectStorage.writeFiles(project.id, files);
    const archive = await projectStorage.createSnapshot({ projectId: project.id, files });
    const snapshot = await store.createSnapshot({ projectId: project.id, kind: 'manual', manifest: {}, storageKey: archive.storageKey });
    // Écriture store directe : simule une ligne créée AVANT l'allowlist SPDX.
    await store.createGalleryListing({
      slug: 'legacy-nd', title: 'Legacy ND', description: 'x', category: 'web',
      sourceProjectId: project.id, sourceSnapshotId: snapshot.id, authorName: 'A',
      remixAllowed: true, licenseId: 'CC-BY-NC-ND-4.0', licenseText: 'x',
      licenseTextSha256: 'a'.repeat(64),
    });
    const u = await store.createUser({ email: 'nd@example.com', name: 'Nd', passwordHash: hashPassword('password123') });
    const o = await store.createOrganization({ name: 'NdO', slug: 'ndo', ownerUserId: u.id });
    await store.createSession({ userId: u.id, token: 'nd-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({
      method: 'POST', url: '/gallery/legacy-nd/remix', headers: auth('nd-token'),
      payload: { organizationId: o.id, acceptLicense: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('REMIX_LICENSE_NOT_DERIVATIVE');
  });

  /* ── réserve #8 : trace auditable des confirmations ───────────────────── */

  it('curation : rightsConfirmed / piiPolicyAccepted sont PERSISTÉS (horodatage + acteur)', async () => {
    const { app, source, snapshot, store, admin } = await mkCurator();
    const before = Date.now();
    const res = await app.inject({
      method: 'POST', url: '/admin/gallery-listings', headers: auth('admin-token'),
      payload: {
        slug: 'traced-app', title: 'Traced', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
        remixAllowed: true, licenseId: 'MIT', licenseText: 'MIT…',
        rightsConfirmed: true, piiPolicyAccepted: true,
      },
    });
    expect(res.statusCode).toBe(201);

    // LA PREUVE : la confirmation est retrouvable en base, pas seulement validée.
    const listing = await store.getGalleryListingBySlug('traced-app');
    expect(listing?.rightsConfirmedAt).toBeInstanceOf(Date);
    expect(listing?.piiPolicyAcceptedAt).toBeInstanceOf(Date);
    expect(listing!.rightsConfirmedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // …et on sait QUI a confirmé.
    expect(listing?.rightsConfirmedBy).toBe(admin.id);
    expect(listing?.piiPolicyAcceptedBy).toBe(admin.id);
  });

  it('un listing non-remixable ne porte AUCUNE trace de confirmation', async () => {
    const { app, source, snapshot, store } = await mkCurator();
    await app.inject({
      method: 'POST', url: '/admin/gallery-listings', headers: auth('admin-token'),
      payload: {
        slug: 'viewonly-app', title: 'View Only', description: 'x', category: 'web',
        sourceProjectId: source.id, sourceSnapshotId: snapshot.id, authorName: 'A',
      },
    });

    const listing = await store.getGalleryListingBySlug('viewonly-app');
    expect(listing?.remixAllowed).toBe(false);
    expect(listing?.rightsConfirmedAt).toBeUndefined();
    expect(listing?.rightsConfirmedBy).toBeUndefined();
  });
});
