import { afterEach, describe, expect, it, vi } from 'vitest';
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

async function register(app: any, email: string, organizationName = 'OrgX') {
  const r = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Test', organizationName },
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

const CLIENT_SECRET = 'super-secret-oidc-value-DO-NOT-LEAK-9f3a';

// A well-formed (but fake) PEM block; the body must never appear in any response.
const SAML_CERT = `-----BEGIN CERTIFICATE-----\n${'MIIB'.repeat(20)}\n-----END CERTIFICATE-----`;

async function putOidc(app: any, orgId: string, token: string, issuer: string) {
  const r = await app.inject({
    method: 'PUT',
    url: `/orgs/${orgId}/sso/oidc`,
    headers: { authorization: `Bearer ${token}` },
    payload: { issuer, clientId: 'client-abc', clientSecret: CLIENT_SECRET, enabled: true },
  });
  expect(r.statusCode).toBe(200);
}

async function putSaml(app: any, orgId: string, token: string, ssoUrl: string) {
  const r = await app.inject({
    method: 'PUT',
    url: `/orgs/${orgId}/sso/saml`,
    headers: { authorization: `Bearer ${token}` },
    payload: { entityId: 'urn:example:idp', ssoUrl, x509Certificate: SAML_CERT, enabled: true },
  });
  expect(r.statusCode).toBe(200);
}

const GOOD_DISCOVERY = {
  issuer: 'https://idp.example.com',
  authorization_endpoint: 'https://idp.example.com/authorize',
  token_endpoint: 'https://idp.example.com/token',
  jwks_uri: 'https://idp.example.com/jwks',
};

describe('POST /orgs/:orgId/sso/:type/test', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('OIDC: returns passing checks when discovery is reachable and complete, never echoing secrets', async () => {
    const fetched: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      fetched.push(String(input));

      return new Response(JSON.stringify(GOOD_DISCOVERY), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'owner@example.com');
    const orgId = organization.id;
    await reauth(app, token);
    await putOidc(app, orgId, token, 'https://idp.example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/sso/oidc/test`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.checks)).toBe(true);
    expect(body.checks.map((c: any) => c.name)).toContain('Discovery document');
    expect(body.checks.every((c: any) => c.ok)).toBe(true);

    // The discovery endpoint was actually fetched, at the well-known path.
    expect(fetched.some((u) => u.endsWith('/.well-known/openid-configuration'))).toBe(true);

    // No secret material appears anywhere in the response.
    expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);

    await app.close();
  });

  it('OIDC: fails the discovery check when required fields are missing (no secret leak)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const partial = {
        issuer: 'https://idp.example.com',
        authorization_endpoint: 'https://idp.example.com/authorize',
      };

      return new Response(JSON.stringify(partial), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'owner2@example.com');
    const orgId = organization.id;
    await reauth(app, token);
    await putOidc(app, orgId, token, 'https://idp.example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/sso/oidc/test`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ok).toBe(false);

    const discovery = body.checks.find((c: any) => c.name === 'Discovery document');
    expect(discovery.ok).toBe(false);
    expect(discovery.detail).toMatch(/token_endpoint/);
    expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);

    await app.close();
  });

  it('OIDC: an SSRF host (link-local metadata IP) is blocked and never fetched', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));

    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'owner3@example.com');
    const orgId = organization.id;
    await reauth(app, token);
    await putOidc(app, orgId, token, 'https://169.254.169.254');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/sso/oidc/test`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ok).toBe(false);

    const issuerCheck = body.checks.find((c: any) => c.name === 'Issuer URL');
    expect(issuerCheck.ok).toBe(false);

    // The guard must prevent any outbound request to the internal target.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);

    await app.close();
  });

  it('SAML: validates stored config and reachability without echoing the certificate', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 302 }));

    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'owner4@example.com');
    const orgId = organization.id;
    await reauth(app, token);
    await putSaml(app, orgId, token, 'https://idp.example.com/sso');

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/sso/saml/test`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.checks.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(['Entity ID', 'Signing certificate', 'SSO URL', 'SSO endpoint reachable']),
    );

    // The stored certificate body must never appear in the response.
    const certBody = SAML_CERT.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    expect(JSON.stringify(body)).not.toContain(certBody);

    await app.close();
  });

  it('returns 404 when no provider of that type is configured', async () => {
    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'owner5@example.com');
    const orgId = organization.id;
    await reauth(app, token);

    const response = await app.inject({
      method: 'POST',
      url: `/orgs/${orgId}/sso/oidc/test`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('SSO_NOT_CONFIGURED');

    await app.close();
  });
});

describe('SSO enforcement (7-day grace + owner exemption)', () => {
  it('PUT enforcement persists and computes a grace deadline 7 days out', async () => {
    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'ent-owner@example.com');
    const orgId = organization.id;
    await reauth(app, token);

    const response = await app.inject({
      method: 'PUT',
      url: `/orgs/${orgId}/sso/enforcement`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enforced: true },
    });

    expect(response.statusCode).toBe(200);

    const { enforcement } = response.json();
    expect(enforcement.enforced).toBe(true);
    expect(enforcement.enforcedAt).toBeTruthy();
    expect(enforcement.graceDays).toBe(7);
    expect(enforcement.active).toBe(false);

    const started = new Date(enforcement.enforcedAt).getTime();
    const deadline = new Date(enforcement.graceDeadline).getTime();
    expect(deadline - started).toBe(7 * 24 * 60 * 60 * 1000);

    // GET reflects the persisted state.
    const get = await app.inject({
      method: 'GET',
      url: `/orgs/${orgId}/sso/enforcement`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.json().enforcement.enforced).toBe(true);

    await app.close();
  });

  it('re-enabling does not reset an already-running grace window', async () => {
    const store = new TestApiStore();
    const app = await buildApp({ store });
    const { token, organization } = await register(app, 'ent-owner2@example.com');
    const orgId = organization.id;
    await reauth(app, token);

    const first = await app.inject({
      method: 'PUT',
      url: `/orgs/${orgId}/sso/enforcement`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enforced: true },
    });

    const firstAt = first.json().enforcement.enforcedAt;

    const second = await app.inject({
      method: 'PUT',
      url: `/orgs/${orgId}/sso/enforcement`,
      headers: { authorization: `Bearer ${token}` },
      payload: { enforced: true },
    });
    expect(second.json().enforcement.enforcedAt).toBe(firstAt);

    await app.close();
  });

  it('blocks a non-owner member password login once the grace window has elapsed, but exempts the owner', async () => {
    const store = new TestApiStore();
    const app = await buildApp({ store });
    const owner = await register(app, 'owner-a@example.com', 'AcmeOrg');
    const orgId = owner.organization.id;

    // A second user who is a plain member of the enforcing org.
    const member = await register(app, 'member-a@example.com', 'MemberOrg');
    await store.addMember({ organizationId: orgId, userId: member.user.id, roleKey: 'member' });

    // Enforcement started 8 days ago → grace has elapsed.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await store.updateEnterpriseSettings({ organizationId: orgId, ssoEnforced: true, ssoEnforcedAt: eightDaysAgo });

    const memberLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'member-a@example.com', password: 'password123' },
    });
    expect(memberLogin.statusCode).toBe(403);
    expect(memberLogin.json().code).toBe('SSO_ENFORCED');

    // Owner is always exempt.
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'owner-a@example.com', password: 'password123' },
    });
    expect(ownerLogin.statusCode).toBe(200);

    await app.close();
  });

  it('allows member password login while still inside the grace window', async () => {
    const store = new TestApiStore();
    const app = await buildApp({ store });
    const owner = await register(app, 'owner-b@example.com', 'BravoOrg');
    const orgId = owner.organization.id;

    const member = await register(app, 'member-b@example.com', 'MemberOrg2');
    await store.addMember({ organizationId: orgId, userId: member.user.id, roleKey: 'member' });

    // Enforcement just started → still within the 7-day grace.
    await store.updateEnterpriseSettings({
      organizationId: orgId,
      ssoEnforced: true,
      ssoEnforcedAt: new Date().toISOString(),
    });

    const memberLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'member-b@example.com', password: 'password123' },
    });
    expect(memberLogin.statusCode).toBe(200);

    await app.close();
  });
});
