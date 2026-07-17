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
    });

    // ---- Mutate the LIVE source AFTER the snapshot: the pin must ignore this. ----
    await projectStorage.writeFiles(source.id, [
      { path: 'src/app.ts', content: 'console.log("LIVE_EDIT_V2_AFTER_SNAPSHOT");\n', updatedAt: '' },
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
      payload: { organizationId: remixerOrg.id },
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
