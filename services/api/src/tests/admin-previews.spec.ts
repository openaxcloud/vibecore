import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  const adminSession = await store.createSession({
    userId: admin.id,
    token: 'admin-token',
    expiresAt: new Date(Date.now() + 3600_000),
  });

  const organization = await store.createOrganization({
    name: 'Admin previews',
    slug: `admin-previews-${admin.id}`,
    ownerUserId: admin.id,
  });
  const project = await store.createProject({
    organizationId: organization.id,
    name: 'Admin previews',
    slug: `admin-previews-${admin.id}`,
  });

  return { app, store, admin, adminSession, organization, project };
}

/*
 * Stand up a throwaway HTTP server that mimics the workspace manager so we can
 * assert the kill endpoint actually issues the real POST /workspaces/:id/stop
 * terminate call rather than only flipping the DB row.
 */
async function withMockManager(handler: (calls: Array<{ method: string; path: string }>) => Promise<void>) {
  const calls: Array<{ method: string; path: string }> = [];
  const server = createServer((request, response) => {
    calls.push({ method: request.method ?? '', path: request.url ?? '' });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'STOPPED' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const previous = process.env.WORKSPACE_MANAGER_URL;
  process.env.WORKSPACE_MANAGER_URL = `http://127.0.0.1:${port}`;

  try {
    await handler(calls);
  } finally {
    if (previous === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = previous;
    }
    await new Promise<void>((resolve) => (server as Server).close(() => resolve()));
  }
}

describe('F25 admin previews — default TTL', () => {
  it('falls back to a 120-minute default when unset', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultTtlMinutes).toBe(120);
  });

  it('reflects the preview.defaultTtlMinutes system setting', async () => {
    const { app, store } = await setup();
    await store.setSystemSetting({ key: 'preview.defaultTtlMinutes', value: 45 });

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultTtlMinutes).toBe(45);
  });

  it('forbids non-admins', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'user@example.com',
      name: 'User',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('user-token') });
    expect(res.statusCode).toBe(403);
  });

  it('round-trips the default TTL through the real system-setting write path', async () => {
    const { app, store, adminSession } = await setup();
    // Satisfy the step-up window the system-setting write requires.
    await store.markSessionReauthenticated(adminSession.id);

    const write = await app.inject({
      method: 'POST',
      url: '/admin/system-settings',
      headers: auth('admin-token'),
      payload: { key: 'preview.defaultTtlMinutes', value: 30 },
    });
    expect(write.statusCode).toBe(201);

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultTtlMinutes).toBe(30);
  });

  it('derives each preview expiry from createdAt + the default TTL', async () => {
    const { app, store, organization, project } = await setup();
    await store.setSystemSetting({ key: 'preview.defaultTtlMinutes', value: 60 });
    const workspace = await store.createWorkspace({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      name: 'ws',
      runtimeMode: 'remote',
    });

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);

    const row = res.json().previews.find((p: { workspaceId: string }) => p.workspaceId === workspace.id);
    expect(row).toBeTruthy();
    const expected = new Date(new Date(workspace.createdAt).getTime() + 60 * 60_000).toISOString();
    expect(row.expiresAt).toBe(expected);
  });
});

describe('F25 admin previews — kill endpoint', () => {
  it('rejects anonymous callers', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/admin/previews/ws_1/kill' });
    expect(res.statusCode).toBe(401);
  });

  it('forbids non-admins', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'user@example.com',
      name: 'User',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({ method: 'POST', url: '/admin/previews/ws_1/kill', headers: auth('user-token') });
    expect(res.statusCode).toBe(403);
  });

  it('requires a recent admin step-up re-auth', async () => {
    const { app } = await setup();
    // No markSessionReauthenticated → step-up window not satisfied.
    const res = await app.inject({ method: 'POST', url: '/admin/previews/ws_1/kill', headers: auth('admin-token') });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('ADMIN_REAUTH_REQUIRED');
  });

  it('calls the real terminate path, stops the workspace, and audits (admin + reauth)', async () => {
    const { app, store, adminSession, organization, project } = await setup();
    await store.markSessionReauthenticated(adminSession.id);
    const workspace = await store.createWorkspace({
      projectId: project.id,
      expectedOrganizationId: organization.id,
      name: 'ws',
      runtimeMode: 'remote',
    });
    await store.updateWorkspaceStatus({
      workspaceId: workspace.id,
      expectedProjectId: project.id,
      expectedOrganizationId: organization.id,
      status: 'RUNNING',
    });

    await withMockManager(async (calls) => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/previews/${workspace.id}/kill`,
        headers: auth('admin-token'),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().preview.status).toBe('STOPPED');

      // Real terminate path: the manager received the stop call for this workspace.
      expect(calls).toContainEqual({ method: 'POST', path: `/workspaces/${workspace.id}/stop` });
    });

    expect((await store.getWorkspace(workspace.id))?.status).toBe('STOPPED');
    expect((await store.listAdminAuditLogs()).some((event) => event.action === 'admin.preview.kill')).toBe(true);
  });
});
