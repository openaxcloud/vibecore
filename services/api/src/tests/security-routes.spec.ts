import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

class TestGitProvider {
  importRepository = async () => ({ defaultBranch: 'main' });
  cloneRepository = async () => ({ defaultBranch: 'main' });
  commit = async () => ({ sha: 'sha' });
  push = async () => ({});
  pull = async () => ({});
  branches = async () => [];
  checkout = async () => ({});
  diff = async () => '';
  createPullRequest = async () => ({ number: 1, url: 'https://example.com/pr/1' });
}

class TestEmailProvider {
  send = async () => ({ messageId: 'test' });
}

function buildApp(opts: any = {}) {
  return buildApiApp({ gitProvider: new TestGitProvider(), emailProvider: new TestEmailProvider(), ...opts });
}

async function register(app: any, email: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Test', organizationName: 'OrgX' },
  });
  expect(r.statusCode).toBe(201);
  return r.json();
}

async function reauth(app: any, token: string) {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/reauth',
    headers: { authorization: `Bearer ${token}` },
    payload: { password: 'password123' },
  });
  expect(r.statusCode).toBe(200);
}

describe('OAuth state CSRF', () => {
  it('rejects an OAuth callback when code is present and state is invalid', async () => {
    const app = await buildApp({ store: new TestApiStore() });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/oauth/google/callback',
      payload: { code: 'real_code', state: 'tampered.state.value' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    await app.close();
  });

  it('rejects an OIDC callback when code is present and state is invalid', async () => {
    const app = await buildApp({ store: new TestApiStore() });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/oidc/callback',
      payload: { code: 'real_code', state: 'tampered' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    await app.close();
  });

  it('accepts a resolved-profile OAuth callback without state (legacy flow)', async () => {
    const app = await buildApp({ store: new TestApiStore() });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/oauth/google/callback',
      payload: {
        email: 'oauth@example.com',
        externalId: 'ext_1',
        accessToken: 'tok',
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe('HSTS in production', () => {
  let originalNodeEnv: string | undefined;
  let originalCookieSecret: string | undefined;
  let originalJwtSecret: string | undefined;
  let originalWorkspaceManagerUrl: string | undefined;
  let originalConfigEncryptionKey: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalCookieSecret = process.env.COOKIE_SECRET;
    originalJwtSecret = process.env.JWT_SECRET;
    originalWorkspaceManagerUrl = process.env.WORKSPACE_MANAGER_URL;
    originalConfigEncryptionKey = process.env.CONFIG_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECRET = 'test-cookie-secret-long-enough-for-production-hsts';
    process.env.JWT_SECRET = 'test-jwt-secret-long-enough-for-production-hsts';
    process.env.WORKSPACE_MANAGER_URL = 'http://workspace-manager.vibecore.svc:3010';
    process.env.CONFIG_ENCRYPTION_KEY = 'test-production-config-encryption-key-0001';
  });

  afterEach(() => {
    process.env.NODE_ENV = (originalNodeEnv ?? 'test') as 'test' | 'production' | 'development';

    if (originalCookieSecret === undefined) {
      delete process.env.COOKIE_SECRET;
    } else {
      process.env.COOKIE_SECRET = originalCookieSecret;
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalWorkspaceManagerUrl === undefined) {
      delete process.env.WORKSPACE_MANAGER_URL;
    } else {
      process.env.WORKSPACE_MANAGER_URL = originalWorkspaceManagerUrl;
    }

    if (originalConfigEncryptionKey === undefined) {
      delete process.env.CONFIG_ENCRYPTION_KEY;
    } else {
      process.env.CONFIG_ENCRYPTION_KEY = originalConfigEncryptionKey;
    }
  });

  it('emits Strict-Transport-Security with includeSubDomains and preload when NODE_ENV=production', async () => {
    const app = await buildApp({
      store: new TestApiStore(),
      allowedOrigins: ['https://app.example.com'],
    });
    const response = await app.inject({ method: 'GET', url: '/health' });
    const header = response.headers['strict-transport-security'];
    expect(header).toBeDefined();
    expect(String(header)).toContain('max-age=63072000');
    expect(String(header)).toContain('includeSubDomains');
    expect(String(header)).toContain('preload');
    await app.close();
  });

  it('does not emit Strict-Transport-Security in non-production', async () => {
    process.env.NODE_ENV = 'test';
    const app = await buildApp({ store: new TestApiStore() });
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['strict-transport-security']).toBeUndefined();
    await app.close();
  });
});

describe('Content-Security-Policy', () => {
  it('does not allow inline or eval scripts', async () => {
    const app = await buildApp({ store: new TestApiStore() });
    const response = await app.inject({ method: 'GET', url: '/health' });
    const csp = String(response.headers['content-security-policy']);
    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");

    await app.close();
  });
});

describe('SCIM token list / revoke / rotate', () => {
  it('lists tokens without exposing the secret, revokes, and rotates', async () => {
    const app = await buildApp({ store: new TestApiStore() });
    const { token: sessionToken, organization } = await register(app, 'scim-rotate@example.com');
    await reauth(app, sessionToken);

    const create = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/scim/tokens`,
      headers: { authorization: `Bearer ${sessionToken}`, 'x-csrf-token': 'csrf' },
      cookies: { 'csrf-token': 'csrf' },
      payload: { name: 'okta-prod' },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.token).toMatch(/^scim_/);

    const list = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/scim/tokens`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json();
    expect(listed.scimTokens).toHaveLength(1);
    expect(listed.scimTokens[0]).toMatchObject({ id: created.scimToken.id, name: 'okta-prod' });
    expect(JSON.stringify(listed)).not.toContain(created.token);

    const rotate = await app.inject({
      method: 'POST',
      url: `/orgs/${organization.id}/scim/tokens/${created.scimToken.id}/rotate`,
      headers: { authorization: `Bearer ${sessionToken}`, 'x-csrf-token': 'csrf' },
      cookies: { 'csrf-token': 'csrf' },
    });
    expect(rotate.statusCode).toBe(201);
    const rotated = rotate.json();
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.scimToken.name).toBe('okta-prod');

    const afterRotate = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/scim/tokens`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(afterRotate.json().scimTokens).toHaveLength(1);
    expect(afterRotate.json().scimTokens[0].id).toBe(rotated.scimToken.id);

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/orgs/${organization.id}/scim/tokens/${rotated.scimToken.id}`,
      headers: { authorization: `Bearer ${sessionToken}`, 'x-csrf-token': 'csrf' },
      cookies: { 'csrf-token': 'csrf' },
    });
    expect(revoke.statusCode).toBe(204);

    const finalList = await app.inject({
      method: 'GET',
      url: `/orgs/${organization.id}/scim/tokens`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(finalList.json().scimTokens).toHaveLength(0);
    await app.close();
  });
});
