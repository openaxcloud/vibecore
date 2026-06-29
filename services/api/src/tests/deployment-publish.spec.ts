import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { buildPublishedDeploymentInput, canPublishDeployment } from '../deployments.js';
import type { EmailProvider } from '../email.js';
import type { DeploymentRecord } from '../store.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

const READY_PREVIEW = {
  id: 'dep_src',
  projectId: 'proj_1',
  provider: 'static',
  environment: 'preview',
  status: 'READY',
  url: 'https://preview-app.example/',
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  branch: 'main',
  commitSha: 'abc123',
  logs: [],
} as unknown as DeploymentRecord;

describe('canPublishDeployment', () => {
  it('allows a READY non-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'preview' })).toEqual({ ok: true });
  });

  it('rejects a not-yet-built deployment', () => {
    expect(canPublishDeployment({ status: 'BUILDING', environment: 'preview' })).toMatchObject({
      ok: false,
      code: 'NOT_READY',
    });
  });

  it('rejects an already-production deployment', () => {
    expect(canPublishDeployment({ status: 'READY', environment: 'production' })).toMatchObject({
      ok: false,
      code: 'ALREADY_PRODUCTION',
    });
  });
});

describe('buildPublishedDeploymentInput', () => {
  it('clones the build config into a production deployment linked to its source', () => {
    const input = buildPublishedDeploymentInput(READY_PREVIEW, 'https://prod-app.example/');

    expect(input).toMatchObject({
      projectId: 'proj_1',
      provider: 'static',
      environment: 'production',
      status: 'READY',
      url: 'https://preview-app.example/', // same built artifact
      productionUrl: 'https://prod-app.example/',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      branch: 'main',
      commitSha: 'abc123',
      parentDeploymentId: 'dep_src',
    });
    expect(input.metadata).toMatchObject({ publishedFrom: 'dep_src' });
  });
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'pub@example.com',
    name: 'Pub User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Pub Org', slug: 'pub-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pub-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Pub Project', slug: 'pub-project' });

  return { app, store, token: 'pub-token', project };
}

describe('POST /projects/:id/deployments/:id/publish', () => {
  it('promotes a READY preview deployment to a linked production deployment', async () => {
    const { app, store, token, project } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'READY',
      url: 'https://preview.example/',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(201);
    const deployment = res.json().deployment;
    expect(deployment).toMatchObject({
      environment: 'production',
      status: 'READY',
      parentDeploymentId: source.id,
      url: 'https://preview.example/',
    });
  });

  it('rejects publishing a deployment that is not READY (409)', async () => {
    const { app, store, token, project } = await setup();
    const source = await store.createDeployment({
      projectId: project.id,
      provider: 'static',
      environment: 'preview',
      status: 'BUILDING',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/${source.id}/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NOT_READY');
  });

  it('404s for an unknown deployment', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/deployments/dep_missing/publish`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
