import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Socket } from 'node:net';
import { createDatabaseClient } from '@vibecore/database';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPreviewProxyApp } from '../../../preview-proxy/src/app.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { PrismaApiStore } from '../prisma-store.js';
import { appendReleaseManifestAtHead, configDigest } from '../release-manifest.js';

type DatabaseClient = ReturnType<typeof createDatabaseClient>;
type StopFault = 'http-500' | 'timeout' | 'socket-close';

const IMAGE_REF = 'europe-west9-docker.pkg.dev/vibecore-audit/rollback/app';
const IMAGE_DIGEST = `sha256:${'d'.repeat(64)}`;
const JWT_SECRET = 'rollback-resilience-test-jwt-secret-32-bytes';
const PREVIEW_DOMAIN = 'preview.e-code.test';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

async function canReachDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

const runDbTests = (await canReachDatabase()) ? describe.sequential : describe.skip;

const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

async function readRequestBody(request: AsyncIterable<Uint8Array>): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server, sockets: Set<Socket>): Promise<void> {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function startManager(options: { stopFault?: StopFault; startDelayMs?: number } = {}) {
  const active = new Set<string>();
  const starts: Array<Record<string, unknown>> = [];
  const stops: string[] = [];
  const sockets = new Set<Socket>();
  let workloadHits = 0;
  let stopFault = options.stopFault;
  let stopFaultObserved = false;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://manager.test');

    if (request.method === 'POST' && url.pathname === '/server-deployments/start') {
      const body = await readRequestBody(request);
      const deploymentId = String(body.deploymentId ?? '');
      starts.push(body);
      active.add(deploymentId);

      if (options.startDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.startDelayMs));
      }

      return json(response, 200, {
        ready: true,
        url: `https://d-${deploymentId}.${PREVIEW_DOMAIN}`,
        name: `app-${deploymentId}`,
        readyReplicas: 1,
      });
    }

    const stop = /^\/server-deployments\/([^/]+)\/stop$/.exec(url.pathname);
    if (request.method === 'POST' && stop) {
      const deploymentId = decodeURIComponent(stop[1]);
      stops.push(deploymentId);

      if (stopFault) {
        const fault = stopFault;
        stopFault = undefined;
        stopFaultObserved = true;

        if (fault === 'http-500') return json(response, 500, { error: 'injected stop failure' });
        if (fault === 'socket-close') {
          request.socket.destroy();
          return;
        }

        // Longer than SERVER_DEPLOY_STOP_TIMEOUT_MS in the test. The client must
        // abort, retry, and only acknowledge the CAS loss after a later status
        // probe observes `exists:false`.
        setTimeout(() => {
          if (!response.writableEnded) json(response, 504, { error: 'injected timeout' });
        }, 500);
        return;
      }

      active.delete(deploymentId);
      return json(response, 200, { stopped: true });
    }

    const status = /^\/server-deployments\/([^/]+)\/status$/.exec(url.pathname);
    if (request.method === 'GET' && status) {
      const deploymentId = decodeURIComponent(status[1]);
      const exists = active.has(deploymentId);
      return json(response, 200, { exists, readyReplicas: exists ? 1 : 0, replicas: exists ? 1 : 0 });
    }

    const workload = /^\/workload\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
    if (workload) {
      const deploymentId = decodeURIComponent(workload[1]);
      workloadHits += 1;
      if (!active.has(deploymentId)) return json(response, 404, { code: 'NOT_FOUND' });
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end(`STALE-ROLLBACK-BYTES:${deploymentId}`);
      return;
    }

    json(response, 404, { code: 'NOT_FOUND' });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  const url = await listen(server);

  return {
    url,
    active,
    starts,
    stops,
    get workloadHits() {
      return workloadHits;
    },
    get stopFaultObserved() {
      return stopFaultObserved;
    },
    async status(deploymentId: string): Promise<{ exists: boolean }> {
      const response = await fetch(`${url}/server-deployments/${encodeURIComponent(deploymentId)}/status`);
      return (await response.json()) as { exists: boolean };
    },
    close: () => closeServer(server, sockets),
  };
}

class PausingPrismaStore extends PrismaApiStore {
  pauseAfterRollbackRowCreated: Promise<void> | undefined;
  rollbackRowCreated: Promise<void>;
  #signalRollbackRowCreated!: () => void;

  constructor(prisma: DatabaseClient) {
    super(prisma);
    this.rollbackRowCreated = new Promise<void>((resolve) => {
      this.#signalRollbackRowCreated = resolve;
    });
  }

  override async createDeployment(input: Parameters<PrismaApiStore['createDeployment']>[0]) {
    const row = await super.createDeployment(input);

    if ((input.metadata as Record<string, unknown> | undefined)?.rollbackToPrevious === true) {
      this.#signalRollbackRowCreated();
      if (this.pauseAfterRollbackRowCreated) await this.pauseAfterRollbackRowCreated;
    }

    return row;
  }
}

async function seedProject(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  store: PrismaApiStore,
  suffix: string,
) {
  const email = `${unique(`rollback-${suffix}`)}@example.test`;
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'password123',
      name: 'Rollback resilience',
      organizationName: `Rollback ${suffix}`,
    },
  });
  expect(register.statusCode).toBe(201);
  const auth = register.json() as {
    token: string;
    user: { id: string };
    organization: { id: string };
  };
  await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

  const projectResponse = await app.inject({
    method: 'POST',
    url: `/orgs/${auth.organization.id}/projects`,
    headers: { authorization: `Bearer ${auth.token}` },
    payload: { name: `Rollback ${suffix}` },
  });
  expect(projectResponse.statusCode).toBe(201);
  const projectId = (projectResponse.json() as { project: { id: string } }).project.id;

  const releases = [];
  for (const version of [1, 2]) {
    const deployment = await store.createDeployment({
      projectId,
      provider: 'server',
      environment: 'preview',
      status: 'READY',
      url: `https://d-v${version}.${PREVIEW_DOMAIN}`,
      metadata: {
        rollbackable: true,
        serverDeploy: {
          host: `d-v${version}.${PREVIEW_DOMAIN}`,
          ready: true,
          applied: true,
          image: { imageRef: IMAGE_REF, imageDigest: IMAGE_DIGEST },
        },
      },
    });
    await store.createReleaseManifest({
      projectId,
      deploymentId: deployment.id,
      environment: 'preview',
      version,
      provider: 'server',
      artifactKind: 'server-image',
      artifactRef: IMAGE_REF,
      artifactDigest: IMAGE_DIGEST,
      configDigest: configDigest({}),
    });
    releases.push(deployment);
  }

  return { ...auth, email, projectId, v1: releases[0], v2: releases[1] };
}

function rollback(
  app: Awaited<ReturnType<typeof buildApiApp>>,
  token: string,
  projectId: string,
  idempotencyKey?: string,
  environment = 'preview',
) {
  return app.inject({
    method: 'POST',
    url: `/projects/${projectId}/deployments/rollback-to-previous`,
    headers: {
      authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    payload: { environment },
  });
}

async function cleanProject(prisma: DatabaseClient, input: { projectId: string; organizationId: string; user: { id: string } }) {
  await prisma.releaseManifest.deleteMany({ where: { projectId: input.projectId } });
  await prisma.organization.delete({ where: { id: input.organizationId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: input.user.id } }).catch(() => undefined);
}

runDbTests('rollback resilience — real PostgreSQL + real HTTP manager/proxy', () => {
  const previousEnvironment = {
    managerUrl: process.env.WORKSPACE_MANAGER_URL,
    rollbackFlag: process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST,
    stopTimeout: process.env.SERVER_DEPLOY_STOP_TIMEOUT_MS,
    cleanupRetries: process.env.SERVER_DEPLOY_CLEANUP_RETRIES,
    cleanupRetryDelay: process.env.SERVER_DEPLOY_CLEANUP_RETRY_DELAY_MS,
    idempotencyWait: process.env.ROLLBACK_IDEMPOTENCY_WAIT_MS,
  };

  beforeEach(() => {
    delete process.env.SERVER_DEPLOY_ROLLBACK_FROM_DIGEST;
    process.env.SERVER_DEPLOY_STOP_TIMEOUT_MS = '50';
    process.env.SERVER_DEPLOY_CLEANUP_RETRIES = '4';
    process.env.SERVER_DEPLOY_CLEANUP_RETRY_DELAY_MS = '10';
    process.env.ROLLBACK_IDEMPOTENCY_WAIT_MS = '5000';
  });

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('WORKSPACE_MANAGER_URL', previousEnvironment.managerUrl);
    restore('SERVER_DEPLOY_ROLLBACK_FROM_DIGEST', previousEnvironment.rollbackFlag);
    restore('SERVER_DEPLOY_STOP_TIMEOUT_MS', previousEnvironment.stopTimeout);
    restore('SERVER_DEPLOY_CLEANUP_RETRIES', previousEnvironment.cleanupRetries);
    restore('SERVER_DEPLOY_CLEANUP_RETRY_DELAY_MS', previousEnvironment.cleanupRetryDelay);
    restore('ROLLBACK_IDEMPOTENCY_WAIT_MS', previousEnvironment.idempotencyWait);
  });

  it.each(['http-500', 'timeout', 'socket-close'] as const)(
    'CAS loser cleanup survives %s and proves zero public reachability',
    async (fault) => {
      const manager = await startManager({ stopFault: fault });
      process.env.WORKSPACE_MANAGER_URL = manager.url;
      const prisma = createDatabaseClient();
      const publisherPrisma = createDatabaseClient();
      const store = new PausingPrismaStore(prisma);
      const publisherStore = new PrismaApiStore(publisherPrisma);
      const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
      let seeded: Awaited<ReturnType<typeof seedProject>> | undefined;

      try {
        seeded = await seedProject(app, store, fault);
        let releaseRollback!: () => void;
        store.pauseAfterRollbackRowCreated = new Promise<void>((resolve) => {
          releaseRollback = resolve;
        });

        const inFlight = rollback(app, seeded.token, seeded.projectId, `cas-cleanup-${fault}`);
        await store.rollbackRowCreated;

        await appendReleaseManifestAtHead(publisherStore, {
          projectId: seeded.projectId,
          environment: 'preview',
          expectedHeadVersion: 2,
          manifest: {
            deploymentId: seeded.v2.id,
            provider: 'server',
            artifactKind: 'server-image',
            artifactRef: IMAGE_REF,
            artifactDigest: IMAGE_DIGEST,
            configDigest: configDigest({}),
          },
        });
        releaseRollback();

        const response = await inFlight;
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
          code: 'ROLLBACK_RELEASE_MOVED',
          expectedVersion: 2,
          observedVersion: 3,
        });
        expect(manager.stopFaultObserved).toBe(true);
        expect(manager.starts).toHaveLength(1);
        expect(manager.stops.length).toBeGreaterThanOrEqual(2);

        const rollbackId = String(manager.starts[0].deploymentId);
        expect(await manager.status(rollbackId)).toEqual({ exists: false });
        expect(manager.active.has(rollbackId)).toBe(false);

        const row = await store.getDeployment(seeded.projectId, rollbackId);
        expect(row?.status).toBe('FAILED');
        expect(row?.url ?? '').toBe('');
        expect(row?.previewUrl ?? '').toBe('');
        expect(row?.productionUrl ?? '').toBe('');

        const manifests = await store.listReleaseManifests(seeded.projectId, 'preview');
        expect(manifests.map((manifest) => manifest.version)).toEqual([3, 2, 1]);
        expect(manifests.some((manifest) => manifest.deploymentId === rollbackId)).toBe(false);

        await app.listen({ host: '127.0.0.1', port: 0 });
        const apiAddress = app.server.address() as AddressInfo;
        const apiUrl = `http://127.0.0.1:${apiAddress.port}`;
        const serving = await fetch(`${apiUrl}/deployments/${rollbackId}/serving-state`);
        expect((await serving.json()) as { state: string }).toMatchObject({ state: 'not-found' });

        const proxy = await buildPreviewProxyApp({
          previewDomain: PREVIEW_DOMAIN,
          apiBaseUrl: apiUrl,
          serverDeployUpstreamTemplate: `${manager.url}/workload/{deploymentId}`,
          serverDeployManagerUrl: manager.url,
          requestTimeoutMs: 500,
        });

        try {
          const hitsBefore = manager.workloadHits;
          const publicResponse = await proxy.inject({
            method: 'GET',
            url: '/',
            headers: { host: `d-${rollbackId}.${PREVIEW_DOMAIN}` },
          });
          expect([404, 410, 503]).toContain(publicResponse.statusCode);
          expect(publicResponse.body).not.toContain(`STALE-ROLLBACK-BYTES:${rollbackId}`);
          expect(manager.workloadHits).toBe(hitsBefore);
        } finally {
          await proxy.close();
        }

        const direct = await fetch(`${manager.url}/workload/${rollbackId}/`);
        expect(direct.status).toBe(404);
      } finally {
        await app.close();
        if (seeded) await cleanProject(prisma, seeded);
        await Promise.all([prisma.$disconnect(), publisherPrisma.$disconnect()]);
        await manager.close();
      }
    },
  );

  it('replays the durable 201 after the first response is lost and the API restarts', async () => {
    const manager = await startManager();
    process.env.WORKSPACE_MANAGER_URL = manager.url;
    const prismaA = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const appA = await buildApiApp({ store: storeA, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
    let seeded: Awaited<ReturnType<typeof seedProject>> | undefined;

    try {
      seeded = await seedProject(appA, storeA, 'lost-response');
      const key = unique('lost-201');
      const first = await rollback(appA, seeded.token, seeded.projectId, key);
      expect(first.statusCode).toBe(201);
      const committedId = String(manager.starts[0].deploymentId);

      // Simulate the client losing the response and the serving API process being
      // replaced. The replay gets no state from appA, only PostgreSQL.
      await appA.close();
      await prismaA.$disconnect();

      const prismaB = createDatabaseClient();
      const storeB = new PrismaApiStore(prismaB);
      const appB = await buildApiApp({ store: storeB, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });

      try {
        const replay = await rollback(appB, seeded.token, seeded.projectId, key);
        expect(replay.statusCode).toBe(201);
        expect(replay.json().deployment.id).toBe(committedId);
        expect(manager.starts).toHaveLength(1);
        expect(
          (await storeB.listDeployments(seeded.projectId)).filter(
            (deployment) => (deployment.metadata as Record<string, unknown>)?.rollbackToPrevious === true,
          ),
        ).toHaveLength(1);
        expect((await storeB.listReleaseManifests(seeded.projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
          3, 2, 1,
        ]);
      } finally {
        await appB.close();
        await cleanProject(prismaB, seeded);
        await prismaB.$disconnect();
      }
    } finally {
      // appA/prismaA may already be closed above; both close operations are safe.
      await appA.close().catch(() => undefined);
      await prismaA.$disconnect().catch(() => undefined);
      await manager.close();
    }
  });

  it('collapses concurrent requests with one key across two API replicas', async () => {
    const manager = await startManager({ startDelayMs: 75 });
    process.env.WORKSPACE_MANAGER_URL = manager.url;
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();
    const storeA = new PrismaApiStore(prismaA);
    const storeB = new PrismaApiStore(prismaB);
    const appA = await buildApiApp({ store: storeA, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
    const appB = await buildApiApp({ store: storeB, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
    let seeded: Awaited<ReturnType<typeof seedProject>> | undefined;

    try {
      seeded = await seedProject(appA, storeA, 'two-replicas');
      const key = unique('same-key');
      const [a, b] = await Promise.all([
        rollback(appA, seeded.token, seeded.projectId, key),
        rollback(appB, seeded.token, seeded.projectId, key),
      ]);

      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 201]);
      expect(a.json().deployment.id).toBe(b.json().deployment.id);
      expect(manager.starts).toHaveLength(1);
      expect(
        (await storeA.listDeployments(seeded.projectId)).filter(
          (deployment) => (deployment.metadata as Record<string, unknown>)?.rollbackToPrevious === true,
        ),
      ).toHaveLength(1);
      expect((await storeA.listReleaseManifests(seeded.projectId, 'preview')).map((manifest) => manifest.version)).toEqual([
        3, 2, 1,
      ]);
    } finally {
      await Promise.all([appA.close(), appB.close()]);
      if (seeded) await cleanProject(prismaA, seeded);
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
      await manager.close();
    }
  });

  it('requires an idempotency key before creating a rollback side effect', async () => {
    const manager = await startManager();
    process.env.WORKSPACE_MANAGER_URL = manager.url;
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
    let seeded: Awaited<ReturnType<typeof seedProject>> | undefined;

    try {
      seeded = await seedProject(app, store, 'missing-key');
      const response = await rollback(app, seeded.token, seeded.projectId);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      expect(manager.starts).toHaveLength(0);
      expect(
        (await store.listDeployments(seeded.projectId)).filter(
          (deployment) => (deployment.metadata as Record<string, unknown>)?.rollbackToPrevious === true,
        ),
      ).toHaveLength(0);
    } finally {
      await app.close();
      if (seeded) await cleanProject(prisma, seeded);
      await prisma.$disconnect();
      await manager.close();
    }
  });

  it('rejects reusing one key with a different request fingerprint', async () => {
    const manager = await startManager();
    process.env.WORKSPACE_MANAGER_URL = manager.url;
    const prisma = createDatabaseClient();
    const store = new PrismaApiStore(prisma);
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), jwtSecret: JWT_SECRET });
    let seeded: Awaited<ReturnType<typeof seedProject>> | undefined;

    try {
      seeded = await seedProject(app, store, 'fingerprint');
      const key = unique('fingerprint-key');
      expect((await rollback(app, seeded.token, seeded.projectId, key, 'preview')).statusCode).toBe(201);

      const mismatch = await rollback(app, seeded.token, seeded.projectId, key, 'production');
      expect(mismatch.statusCode).toBe(409);
      expect(mismatch.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(manager.starts).toHaveLength(1);
    } finally {
      await app.close();
      if (seeded) await cleanProject(prisma, seeded);
      await prisma.$disconnect();
      await manager.close();
    }
  });
});
