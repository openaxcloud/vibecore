import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

const timingSchema = z.object({
  event: z.literal('project.export_zip.timing'),
  reqId: z.string(),
  outcome: z.enum(['success', 'failed']),
  stage: z.string(),
  timingsMs: z.record(z.number().nonnegative()),
  totalMs: z.number().nonnegative(),
  fileCount: z.number().optional(),
  archiveBytes: z.number().optional(),
});
const archiveSchema = z.object({
  archive: z.object({ storageKey: z.string(), base64: z.string(), byteLength: z.number() }),
});

describe.skipIf(process.env.EXPORT_POSTGRES_PROOF !== '1')('real HTTP archive stage measurements', () => {
  let store: PrismaApiStore;
  let app: Awaited<ReturnType<typeof buildApiApp>>;
  let origin: string;
  let directory: string;
  let projectId: string;

  const users: string[] = [];
  const organizations: string[] = [];
  const tokens: string[] = [];
  const timings: z.infer<typeof timingSchema>[] = [];
  const originals = { storage: process.env.PROJECT_STORAGE_DIR, log: process.env.LOG_LEVEL };

  let files = [
    { path: 'README.md', content: '# Synthetic archive\n' },
    { path: 'audit.txt', content: 'persisted\n' },
  ];

  let saved: z.infer<typeof archiveSchema>['archive'];

  async function start() {
    store = new PrismaApiStore();
    app = await buildApiApp({
      store,
      loggerStream: {
        write(line) {
          const parsed: unknown = JSON.parse(line);
          const timing = timingSchema.safeParse(parsed);

          if (timing.success) {
            timings.push(timing.data);
          }
        },
      },
    });
    origin = await app.listen({ host: '127.0.0.1', port: 0 });
  }

  async function exportArchive(actor = 0) {
    const requestId = randomUUID();

    const response = await fetch(`${origin}/projects/${projectId}/export/zip`, {
      headers: { authorization: `Bearer ${tokens[actor]}`, 'x-request-id': requestId },
    });

    const body: unknown = await response.json();
    const timing = timings.find((entry) => entry.reqId === requestId);
    expect(timing).toBeDefined();

    return { status: response.status, body, timing: timing! };
  }

  async function verifyArchive() {
    const result = await exportArchive();
    expect(result.status).toBe(200);
    saved = archiveSchema.parse(result.body).archive;

    const bytes = Buffer.from(saved.base64, 'base64');
    expect(bytes.length).toBe(saved.byteLength);

    const zip = await JSZip.loadAsync(bytes);
    expect(Object.values(zip.files).filter((entry) => !entry.dir)).toHaveLength(files.length);

    for (const file of files) {
      expect(await zip.file(file.path)!.async('string')).toBe(file.content);
    }
    expect(result.timing.outcome).toBe('success');
    expect(result.timing.fileCount).toBe(files.length);
    expect(result.timing.archiveBytes).toBe(bytes.length);
    expect(Object.keys(result.timing.timingsMs)).toEqual([
      'authorize',
      'listFiles',
      'ideState',
      'materialize',
      'zip',
      'persist',
      'activity',
      'audit',
    ]);
    expect(Object.values(result.timing.timingsMs).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      result.timing.totalMs,
    );

    return result.timing;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);

    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/panel_proof') {
      throw new Error('Use an isolated localhost database named panel_proof');
    }

    expect(process.env.NODE_ENV).toBe('test');
    directory = await mkdtemp(join(tmpdir(), 'archive-proof-'));
    process.env.PROJECT_STORAGE_DIR = directory;
    process.env.LOG_LEVEL = 'info';
    await start();

    for (let i = 0; i < 2; i++) {
      const suffix = randomUUID();

      const user = await store.createUser({
        email: `${suffix}@example.test`,
        name: 'Archive proof',
        passwordHash: 'synthetic-login-disabled',
      });
      users.push(user.id);

      const org = await store.createOrganization({ name: 'Archive proof', slug: suffix, ownerUserId: user.id });
      organizations.push(org.id);
      tokens.push(randomUUID());
      await store.createSession({ userId: user.id, token: tokens[i], expiresAt: new Date(Date.now() + 3600000) });
    }

    const project = await store.createProject({
      organizationId: organizations[0],
      name: 'Archive proof',
      slug: randomUUID(),
    });
    projectId = project.id;
    await store.upsertProjectIdeState({ projectId, state: { files: { entries: files } } });
  });

  afterAll(async () => {
    await app?.close();

    if (store) {
      await store.prisma.projectStorageObject.deleteMany({ where: { projectId: projectId ?? 'not-created' } });
      await store.prisma.project.deleteMany({ where: { id: projectId ?? 'not-created' } });
      await store.prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await store.prisma.user.deleteMany({ where: { id: { in: users } } });
      await store.prisma.$disconnect();
    }

    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }

    if (originals.storage === undefined) {
      delete process.env.PROJECT_STORAGE_DIR;
    } else {
      process.env.PROJECT_STORAGE_DIR = originals.storage;
    }

    if (originals.log === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originals.log;
    }

    const output = process.env.EXPORT_TIMINGS_FILE;

    if (output) {
      if (!isAbsolute(output)) {
        throw new Error('Timing output must be absolute');
      }

      await writeFile(output, `${JSON.stringify(timings, null, 2)}\n`);
    }
  });

  it('materializes persisted files and returns their real ZIP with correlated phase durations', async () => {
    await verifyArchive();
  });

  it('repeats ten complete exports with actual disk reads and durable archive writes', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await verifyArchive();
    }
  });

  it('persists the exact archive after a new application and database connection', async () => {
    await app.close();
    await store.prisma.$disconnect();
    await start();

    const object = await store.getProjectStorageObject(saved.storageKey);
    expect(object?.contentBase64).toBe(saved.base64);
    expect(object?.contentHash).toBe(createHash('sha256').update(Buffer.from(saved.base64, 'base64')).digest('hex'));
    await verifyArchive();
  });

  it('rejects repeated inter-organization export without writing another archive', async () => {
    const before = await store.prisma.projectStorageObject.count({ where: { projectId } });

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await exportArchive(1);
      expect(result.status).toBe(404);
      expect(result.timing.outcome).toBe('failed');
      expect(result.timing.stage).toBe('authorize');
      expect(Object.keys(result.timing.timingsMs)).toEqual(['authorize']);
      expect(result.timing.fileCount).toBeUndefined();
    }
    expect(await store.prisma.projectStorageObject.count({ where: { projectId } })).toBe(before);
  });

  it('measures cold and warm exports of 200 persisted 4KiB text files without latency thresholds', async () => {
    files = Array.from({ length: 200 }, (_, i) => ({ path: `file-${i}.txt`, content: 'x'.repeat(4096) }));
    await store.upsertProjectIdeState({ projectId, state: { files: { entries: files } } });
    await verifyArchive();
    await verifyArchive();
  });
});
