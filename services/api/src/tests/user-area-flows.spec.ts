import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Deep E2E flow edge-inputs found live on app.e-code.ai (throwaway QA account):
 *  - BUG-USR-009: a whitespace-only / over-long project name was accepted (empty was
 *    rejected, but "   " passed min(1) → a project literally named "   ").
 *  - BUG-USR-010: inviting an email that is ALREADY a member (incl. your own) returned 201.
 *  - BUG-USR-011: inviting the same email twice created TWO pending invitations.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ emailProvider: new QuietEmailProvider(), store });

  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'owner@flows.test', password: 'password123', name: 'Owner', organizationName: 'Flows Org' },
  });
  expect(register.statusCode).toBe(201);

  const auth = register.json() as { token: string; organization: { id: string } };
  await store.upsertSubscription({ organizationId: auth.organization.id, planKey: 'pro', status: 'ACTIVE' });

  const headers = { authorization: `Bearer ${auth.token}` };

  return { app, store, orgId: auth.organization.id, headers };
}

const createProject = (
  app: Awaited<ReturnType<typeof setup>>['app'],
  orgId: string,
  headers: Record<string, string>,
  name: string,
) => app.inject({ method: 'POST', url: `/orgs/${orgId}/projects`, headers, payload: { name } });

describe('project name validation (BUG-USR-009)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  afterEach(() => ctx?.app.close());

  it('rejects an empty name (baseline)', async () => {
    ctx = await setup();

    const res = await createProject(ctx.app, ctx.orgId, ctx.headers, '');
    expect(res.statusCode).toBe(400);
  });

  it('rejects a whitespace-only name (was accepted → project named "   ")', async () => {
    ctx = await setup();

    const res = await createProject(ctx.app, ctx.orgId, ctx.headers, '   ');
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('rejects an over-long (>200 char) name', async () => {
    ctx = await setup();

    const res = await createProject(ctx.app, ctx.orgId, ctx.headers, 'A'.repeat(201));
    expect(res.statusCode).toBe(400);
  });

  it('accepts and TRIMS a valid padded name', async () => {
    ctx = await setup();

    const res = await createProject(ctx.app, ctx.orgId, ctx.headers, '  My Project  ');
    expect(res.statusCode).toBe(201);
    expect((res.json() as { project: { name: string } }).project.name).toBe('My Project');
  });

  it('rejects a whitespace-only RENAME', async () => {
    ctx = await setup();

    const created = await createProject(ctx.app, ctx.orgId, ctx.headers, 'Renamable');
    const projectId = (created.json() as { project: { id: string } }).project.id;

    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}/settings`,
      headers: ctx.headers,
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('invitation guards (BUG-USR-010 / BUG-USR-011)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  afterEach(() => ctx?.app.close());

  const invite = (email: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/orgs/${ctx.orgId}/invitations`,
      headers: ctx.headers,
      payload: { email, roleKey: 'member' },
    });

  it('refuses inviting your own (already-member) email → 409 ALREADY_MEMBER', async () => {
    ctx = await setup();

    const res = await invite('owner@flows.test');
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ALREADY_MEMBER');
  });

  it('is case-insensitive for the already-member check', async () => {
    ctx = await setup();

    const res = await invite('OWNER@Flows.Test');
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('ALREADY_MEMBER');
  });

  it('accepts a first invite but refuses a DUPLICATE pending invite → 409 ALREADY_INVITED', async () => {
    ctx = await setup();

    const first = await invite('teammate@flows.test');
    expect(first.statusCode).toBe(201);

    const dup = await invite('teammate@flows.test');
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { code: string }).code).toBe('ALREADY_INVITED');

    // exactly ONE pending invite exists for that email
    const list = await ctx.store.listOrganizationInvites(ctx.orgId);
    expect(list.filter((i) => i.email.toLowerCase() === 'teammate@flows.test').length).toBe(1);
  });
});
