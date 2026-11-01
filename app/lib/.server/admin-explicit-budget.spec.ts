import { buildExplicitRunPermit, BUILTIN_AGENT_ROUTING_CARD } from '@vibecore/billing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { actionAdminExplicitBudget, loadAdminExplicitBudget } from './admin-explicit-budget';

const projectId = 'cmvrzkkmo008z0nemon1zdd3k';
const url = 'https://app.test/admin/aster-budget';
const endpoint = `/admin/projects/${projectId}/explicit-budget-extension`;

let snapshots: unknown[];
let admin = true;
let auth = true;
let writeFails = false;
let writeRejection: { status: number; code: string } | undefined;

const requests: Array<{ path: string; method: string; body?: unknown; headers: Headers }> = [];

function fixture(granted = false) {
  return {
    projectId,
    organizationSlug: 'org-dzj1djmz',
    summary: {
      scope: 'explicit-runs-only',
      currency: 'USD',
      limitMicros: granted ? 30520000 : 20000000,
      reservedMicros: 15260000,
      remainingMicros: granted ? 15260000 : 4740000,
      runCount: 1,
      historicalCostsIncluded: false,
      totalRecipeRemainingMicros: null,
    },
    runIds: ['historical-run'],
    activeRoutingVersion: 4,
    permit: buildExplicitRunPermit({
      projectId,
      runId: 'extension-proposal-only',
      planKey: 'free',
      card: BUILTIN_AGENT_ROUTING_CARD,
    }),
    eligible: !granted,
    grantApplied: granted,
    provider: { enabled: true, baseUrlSafe: true },
    liveBillingSupported: true,
    proposal: {
      approvalId: 'aster-recipe-20261101-30520000',
      expectedOrganizationSlug: 'org-dzj1djmz',
      expectedRunIds: ['historical-run'],
      expectedReservedMicros: 15260000,
      expectedLimitMicros: 20000000,
      targetLimitMicros: 30520000,
      routingVersion: 4,
      expectedLedgerSha256: 'a'.repeat(64),
    },
  };
}
beforeEach(() => {
  requests.length = 0;
  snapshots = [fixture()];
  admin = true;
  auth = true;
  writeFails = false;
  writeRejection = undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const path = new URL(input).pathname;
      const method = init.method ?? 'GET';
      requests.push({
        path,
        method,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        headers: new Headers(init.headers),
      });

      if (path === '/auth/me') {
        return Response.json({ user: { platformAdmin: admin } });
      }

      if (path === '/auth/reauth') {
        return Response.json({ reauthenticated: auth }, { status: auth ? 200 : 401 });
      }

      if (path === endpoint && method === 'GET') {
        const next = snapshots.length > 1 ? snapshots.shift() : snapshots[0];

        if (next instanceof Error) {
          throw next;
        }

        return Response.json(next);
      }

      if (path === endpoint && method === 'POST') {
        if (writeRejection) {
          return Response.json(
            { code: writeRejection.code, error: 'synthetic private upstream details' },
            { status: writeRejection.status },
          );
        }

        if (writeFails) {
          throw new Error('synthetic network lost after write');
        }

        return Response.json({ untrustedAck: true });
      }

      throw new Error(`Unexpected synthetic request path: ${path}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function reviewed() {
  const result = await loadAdminExplicitBudget(new Request(url));
  return (await result.json()).snapshot.reviewToken as string;
}

function request(token: string, fields: Record<string, string> = {}, origin = 'https://app.test') {
  const form = new FormData();
  Object.entries({
    intent: 'extend',
    confirmed: 'yes',
    password: 'synthetic-password',
    reviewToken: token,
    ...fields,
  }).forEach(([k, v]) => form.set(k, v));

  return new Request(url, {
    method: 'POST',
    headers: { origin, cookie: 'vc_session=synthetic-session; unrelated=private-cookie' },
    body: form,
  });
}

const writes = () => requests.filter((r) => r.path === endpoint && r.method === 'POST');

test('read-only loader normalizes and excludes proposal, run IDs and upstream secret fields', async () => {
  snapshots = [{ ...fixture(), secret: 'synthetic-upstream-secret' }];

  const response = await loadAdminExplicitBudget(new Request(url));
  const text = await response.text();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(text).not.toContain('historical-run');
  expect(text).not.toContain('proposal');
  expect(text).not.toContain('synthetic-upstream-secret');
  expect(writes()).toHaveLength(0);
  expect(requests.some((r) => r.path === '/auth/reauth')).toBe(false);
});
test('checks a reviewed snapshot twice, reauthenticates, posts exact proposal once and confirms by readback', async () => {
  const token = await reviewed();
  snapshots = [fixture(), fixture(), fixture(true)];

  const response = await actionAdminExplicitBudget(request(token));
  expect(await response.json()).toMatchObject({ ok: true, snapshot: { grantApplied: true } });
  expect(writes()).toHaveLength(1);
  expect(writes()[0].body).toEqual(fixture().proposal);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(requests.filter((r) => r.path === '/auth/reauth')).toHaveLength(1);
  expect(requests.every((r) => !r.headers.has('cookie'))).toBe(true);
});
test.each(['before-auth', 'after-auth'])('rejects a changed ledger %s before writing', async (when) => {
  const token = await reviewed();
  const changed = fixture();
  changed.proposal.expectedLedgerSha256 = 'b'.repeat(64);
  snapshots = when === 'before-auth' ? [changed] : [fixture(), changed];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: false,
    issue: 'stale-review',
  });
  expect(writes()).toHaveLength(0);
  expect(requests.filter((r) => r.path === '/auth/reauth')).toHaveLength(when === 'before-auth' ? 0 : 1);
});
test('changed same-version pricing invalidates the reviewed snapshot', async () => {
  const token = await reviewed();
  const changed = fixture();
  changed.permit.pricing.platformInputCentsPerMillion += 1;
  snapshots = [changed];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: false,
    issue: 'stale-review',
  });
  expect(writes()).toHaveLength(0);
});
test.each([false, true])('uncertain POST is read back without repeat; persisted=%s', async (persisted) => {
  const token = await reviewed();
  writeFails = true;
  snapshots = [fixture(), fixture(), fixture(persisted)];

  const result = await (await actionAdminExplicitBudget(request(token))).json();
  expect(result).toMatchObject(persisted ? { ok: true } : { ok: false, issue: 'outcome-unknown' });
  expect(writes()).toHaveLength(1);
});
test('failed readback never trusts a successful POST acknowledgement', async () => {
  const token = await reviewed();
  snapshots = [fixture(), fixture(), new Error('private upstream error')];

  const response = await actionAdminExplicitBudget(request(token));
  expect(await response.json()).toEqual({ ok: false, issue: 'outcome-unknown' });
  expect(writes()).toHaveLength(1);
});
test('already-granted and consumed grant are read-only success', async () => {
  const token = await reviewed();
  const used = fixture(true);
  used.runIds.push('new-run');
  used.proposal.expectedRunIds.push('new-run');
  used.summary.runCount = 2;
  used.summary.reservedMicros = 30520000;
  used.summary.remainingMicros = 0;
  snapshots = [used];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: true,
    snapshot: { summary: { remainingMicros: 0 } },
  });
  expect(writes()).toHaveLength(0);
  expect(requests.some((r) => r.path === '/auth/reauth')).toBe(false);
});
test('post readback accepts consumption only with preserved baseline', async () => {
  const token = await reviewed();
  const used = fixture(true);
  used.runIds.push('new-run');
  used.proposal.expectedRunIds.push('new-run');
  used.summary.runCount = 2;
  used.summary.reservedMicros = 30520000;
  used.summary.remainingMicros = 0;
  snapshots = [fixture(), fixture(), used];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({ ok: true });
  expect(writes()).toHaveLength(1);
});
test('rejects origin, missing confirmation, wrong intent and password failure without writes', async () => {
  const token = await reviewed();
  expect((await actionAdminExplicitBudget(request(token, {}, 'https://other.test'))).status).toBe(403);

  for (const fields of [{ confirmed: 'no' }, { password: '' }, { intent: 'other' }, { projectId: 'other' }]) {
    expect((await actionAdminExplicitBudget(request(token, fields))).status).toBe(400);
  }
  auth = false;
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: false,
    issue: 'reauth-failed',
  });
  expect(writes()).toHaveLength(0);
});
test('non-admin follows existing authorization refusal before reading or writing budget', async () => {
  admin = false;
  await expect(loadAdminExplicitBudget(new Request(url))).rejects.toMatchObject({ status: 302 });
  await expect(actionAdminExplicitBudget(request('a'.repeat(64)))).rejects.toMatchObject({ status: 302 });
  expect(requests.every((r) => r.path === '/auth/me')).toBe(true);
});
test('rejects malformed scope, another provider and excessive permit limits without exposing payload', async () => {
  for (const patch of [
    { projectId: 'other' },
    { permit: { ...fixture().permit, provider: 'anthropic' } },
    { permit: { ...fixture().permit, maxCalls: 3 } },
    { permit: { ...fixture().permit, reservedBudgetMicros: 15260001 } },
  ]) {
    snapshots = [{ ...fixture(), ...patch, secret: 'synthetic-private' }];

    const response = await loadAdminExplicitBudget(new Request(url));
    expect(await response.json()).toMatchObject({ snapshot: null, issue: 'unavailable' });
  }
  expect(writes()).toHaveLength(0);
});

test('uses existing session forwarding without echoing passwords or browser cookies', async () => {
  const token = await reviewed();
  snapshots = [fixture(), fixture(), fixture(true)];
  requests.length = 0;

  const result = await actionAdminExplicitBudget(request(token));
  const text = await result.text();
  expect(requests.every((entry) => entry.headers.get('authorization') === 'Bearer synthetic-session')).toBe(true);
  expect(requests.every((entry) => !entry.headers.has('cookie'))).toBe(true);
  expect(text).not.toContain('synthetic-session');
  expect(text).not.toContain('synthetic-password');
  expect(writes()[0].body).not.toHaveProperty('password');
});
test('does not confirm a readback grant tied to another baseline', async () => {
  const token = await reviewed();
  const changed = fixture(true);
  changed.proposal.expectedLedgerSha256 = 'b'.repeat(64);
  snapshots = [fixture(), fixture(), changed];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: false,
    issue: 'outcome-unknown',
  });
  expect(writes()).toHaveLength(1);
});
test('an ineligible reviewed snapshot does not reauthenticate or mutate', async () => {
  snapshots = [{ ...fixture(), eligible: false, permit: undefined }];

  const token = await reviewed();
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({
    ok: false,
    issue: 'not-eligible',
  });
  expect(requests.some((entry) => entry.path === '/auth/reauth')).toBe(false);
  expect(writes()).toHaveLength(0);
});

test.each([
  { status: 403, code: 'ADMIN_REAUTH_REQUIRED', issue: 'reauth-failed' },
  { status: 403, code: 'ADMIN_REQUIRED', issue: 'forbidden' },
  { status: 409, code: 'EXPLICIT_RUN_EXTENSION_CONFLICT', issue: 'stale-review' },
  { status: 409, code: 'EXPLICIT_RUN_EXTENSION_UNAVAILABLE', issue: 'not-eligible' },
  { status: 400, code: 'INVALID_REQUEST', issue: 'invalid-request' },
])('preserves definite rejection $status/$code even when a concurrent grant appears', async (rejection) => {
  const token = await reviewed();
  writeRejection = rejection;
  snapshots = [fixture(), fixture(), fixture(true)];

  const result = await actionAdminExplicitBudget(request(token));
  const body = await result.text();
  expect(JSON.parse(body)).toMatchObject({ ok: false, issue: rejection.issue, snapshot: { grantApplied: true } });
  expect(body).not.toContain('synthetic private upstream details');
  expect(writes()).toHaveLength(1);
});
test('preserves a definite refusal when its readback also fails', async () => {
  const token = await reviewed();
  writeRejection = { status: 409, code: 'EXPLICIT_RUN_EXTENSION_CONFLICT' };
  snapshots = [fixture(), fixture(), new Error('synthetic readback lost')];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toEqual({ ok: false, issue: 'stale-review' });
  expect(writes()).toHaveLength(1);
});
test('a 503 remains ambiguous and can only succeed through matching readback', async () => {
  const token = await reviewed();
  writeRejection = { status: 503, code: 'UNAVAILABLE' };
  snapshots = [fixture(), fixture(), fixture(true)];
  expect(await (await actionAdminExplicitBudget(request(token))).json()).toMatchObject({ ok: true });
  expect(writes()).toHaveLength(1);
});

test('falls back to English for an unsupported administrative locale', async () => {
  const response = await loadAdminExplicitBudget(new Request(url, { headers: { 'accept-language': 'es' } }));
  expect(await response.json()).toMatchObject({ language: 'en' });
});
