import { createHash } from 'node:crypto';
import { z } from 'zod';
import { apiRequest, requirePlatformAdmin } from '~/lib/enterprise-api.server';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

const PROJECT = 'cmvrzkkmo008z0nemon1zdd3k';
const ORGANIZATION = 'org-dzj1djmz';
const APPROVAL = 'aster-recipe-20261101-30520000';
const ENDPOINT = `/admin/projects/${PROJECT}/explicit-budget-extension`;
const integer = z.number().int().nonnegative().safe();

const prices = z.object({
  providerInputCentsPerMillion: z.number().finite().positive(),
  providerOutputCentsPerMillion: z.number().finite().positive(),
  platformInputCentsPerMillion: z.number().finite().positive(),
  platformOutputCentsPerMillion: z.number().finite().positive(),
});

const permitSchema = z.object({
  kind: z.literal('bounded-explicit-v1'),
  projectId: z.literal(PROJECT),
  runId: z.string(),
  provider: z.literal('openai'),
  model: z.literal('gpt-5.6-luna'),
  serviceTier: z.literal('default'),
  routingVersion: integer.positive(),
  lineKey: z.literal('lite'),
  multiplier: z.number().finite().positive(),
  maxCalls: integer.min(1).max(2),
  maxInputTokens: z.literal(64000),
  maxBillableInputTokens: z.literal(1050000),
  maxOutputTokens: z.literal(8192),
  reservedBudgetMicros: integer.positive().max(15260000),
  budgetLimitMicros: z.literal(20000000),
  pricing: prices,
  accounting: prices,
});
const snapshotSchema = z.object({
  projectId: z.literal(PROJECT),
  organizationSlug: z.literal(ORGANIZATION),
  summary: z.object({
    scope: z.literal('explicit-runs-only'),
    currency: z.literal('USD'),
    limitMicros: z.union([z.literal(20000000), z.literal(30520000)]),
    reservedMicros: integer,
    remainingMicros: integer,
    runCount: integer,
    historicalCostsIncluded: z.literal(false),
    totalRecipeRemainingMicros: z.null(),
  }),
  runIds: z.array(z.string().min(1).max(128)).min(1).max(2),
  activeRoutingVersion: integer.positive(),
  permit: permitSchema.optional(),
  eligible: z.boolean(),
  grantApplied: z.boolean(),
  provider: z.object({ enabled: z.boolean(), baseUrlSafe: z.boolean() }),
  liveBillingSupported: z.boolean(),
  proposal: z
    .object({
      approvalId: z.literal(APPROVAL),
      expectedOrganizationSlug: z.literal(ORGANIZATION),
      expectedRunIds: z.array(z.string().min(1).max(128)).min(1).max(2),
      expectedReservedMicros: z.literal(15260000),
      expectedLimitMicros: z.literal(20000000),
      targetLimitMicros: z.literal(30520000),
      routingVersion: integer.positive(),
      expectedLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
});
type BackendSnapshot = z.infer<typeof snapshotSchema>;
export type AdminExplicitBudgetIssue =
  | 'unavailable'
  | 'invalid-request'
  | 'stale-review'
  | 'not-eligible'
  | 'reauth-failed'
  | 'outcome-unknown'
  | 'forbidden';
export interface AdminExplicitBudgetSnapshot {
  projectId: string;
  organizationSlug: string;
  summary: { limitMicros: number; reservedMicros: number; remainingMicros: number };
  permit?: { provider: string; model: string; serviceTier: string; maxCalls: number; reservedBudgetMicros: number };
  grantApplied: boolean;
  eligible: boolean;
  reviewToken: string;
}
export interface AdminExplicitBudgetLoaderData {
  language: 'en' | 'fr';
  snapshot: AdminExplicitBudgetSnapshot | null;
  issue?: AdminExplicitBudgetIssue;
}
export interface AdminExplicitBudgetActionData {
  ok: boolean;
  issue?: AdminExplicitBudgetIssue;
  snapshot?: AdminExplicitBudgetSnapshot;
}

function response(body: AdminExplicitBudgetLoaderData | AdminExplicitBudgetActionData, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function normalize(value: unknown): BackendSnapshot {
  const snapshot = snapshotSchema.parse(value);
  const { summary, proposal, runIds, permit } = snapshot;

  if (
    summary.remainingMicros !== summary.limitMicros - summary.reservedMicros ||
    summary.runCount !== runIds.length ||
    new Set(runIds).size !== runIds.length ||
    JSON.stringify(proposal.expectedRunIds) !== JSON.stringify(runIds) ||
    proposal.routingVersion !== snapshot.activeRoutingVersion ||
    (permit && permit.routingVersion !== snapshot.activeRoutingVersion) ||
    (snapshot.grantApplied
      ? summary.limitMicros !== 30520000 || summary.reservedMicros < 15260000
      : summary.limitMicros !== 20000000) ||
    (snapshot.eligible &&
      (snapshot.grantApplied ||
        !permit ||
        !snapshot.provider.enabled ||
        !snapshot.provider.baseUrlSafe ||
        !snapshot.liveBillingSupported ||
        summary.reservedMicros !== 15260000 ||
        runIds.length !== 1))
  ) {
    throw new Error();
  }

  return snapshot;
}

function view(snapshot: BackendSnapshot): AdminExplicitBudgetSnapshot {
  const { provider, model, serviceTier, maxCalls, reservedBudgetMicros } = snapshot.permit ?? {};
  return {
    projectId: snapshot.projectId,
    organizationSlug: snapshot.organizationSlug,
    summary: {
      limitMicros: snapshot.summary.limitMicros,
      reservedMicros: snapshot.summary.reservedMicros,
      remainingMicros: snapshot.summary.remainingMicros,
    },
    ...(snapshot.permit
      ? {
          permit: {
            provider: provider!,
            model: model!,
            serviceTier: serviceTier!,
            maxCalls: maxCalls!,
            reservedBudgetMicros: reservedBudgetMicros!,
          },
        }
      : {}),
    grantApplied: snapshot.grantApplied,
    eligible: snapshot.eligible,
    reviewToken: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
  };
}

async function read(request: Request) {
  return normalize(await apiRequest(request, ENDPOINT, { redirectOn401: false, cache: 'no-store' }));
}

export async function loadAdminExplicitBudget(request: Request): Promise<Response> {
  await requirePlatformAdmin(request);

  const language = resolveRequestLocale(request).language === 'fr' ? 'fr' : 'en';

  try {
    return response({ language, snapshot: view(await read(request)) });
  } catch {
    return response({ language, snapshot: null, issue: 'unavailable' }, 502);
  }
}

function applied(snapshot: BackendSnapshot, reviewed?: BackendSnapshot): boolean {
  return (
    snapshot.grantApplied &&
    snapshot.summary.limitMicros === 30520000 &&
    (!reviewed ||
      (snapshot.proposal.expectedLedgerSha256 === reviewed.proposal.expectedLedgerSha256 &&
        reviewed.runIds.every((id, index) => snapshot.runIds[index] === id) &&
        snapshot.summary.reservedMicros >= reviewed.summary.reservedMicros))
  );
}

/** Definite HTTP refusals are not ambiguous commits; only expose stable local issue codes. */
async function knownWriteRefusal(
  error: unknown,
): Promise<{ issue: AdminExplicitBudgetIssue; status: number } | undefined> {
  if (!(error instanceof Response) || error.status >= 500 || error.status < 300) {
    return undefined;
  }

  let code: unknown;

  try {
    const payload: unknown = await error.clone().json();
    code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : undefined;
  } catch {
    // HTTP status remains authoritative even without a JSON error code.
  }

  if (error.status === 400 || error.status === 422) {
    return { issue: 'invalid-request', status: 400 };
  }

  if (error.status === 409) {
    return { issue: code === 'EXPLICIT_RUN_EXTENSION_UNAVAILABLE' ? 'not-eligible' : 'stale-review', status: 409 };
  }

  if (error.status === 401 || error.status === 403) {
    return { issue: code === 'ADMIN_REAUTH_REQUIRED' ? 'reauth-failed' : 'forbidden', status: 403 };
  }

  if (error.status < 400) {
    return { issue: 'forbidden', status: 403 };
  }

  return { issue: 'unavailable', status: error.status };
}

export async function actionAdminExplicitBudget(request: Request): Promise<Response> {
  if (
    request.method !== 'POST' ||
    request.headers.get('origin') !== new URL(request.url).origin ||
    (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')
  ) {
    return response({ ok: false, issue: 'forbidden' }, 403);
  }

  await requirePlatformAdmin(request);

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return response({ ok: false, issue: 'invalid-request' }, 400);
  }

  const intent = form.get('intent'),
    confirmed = form.get('confirmed'),
    password = form.get('password'),
    token = form.get('reviewToken');

  if (
    intent !== 'extend' ||
    confirmed !== 'yes' ||
    typeof password !== 'string' ||
    !password ||
    password.length > 1024 ||
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(token) ||
    [...form.keys()].some((key) => !['intent', 'confirmed', 'password', 'reviewToken'].includes(key)) ||
    ['intent', 'confirmed', 'password', 'reviewToken'].some((key) => form.getAll(key).length !== 1)
  ) {
    return response({ ok: false, issue: 'invalid-request' }, 400);
  }

  let fresh: BackendSnapshot;

  try {
    fresh = await read(request);
  } catch {
    return response({ ok: false, issue: 'unavailable' }, 502);
  }

  if (applied(fresh)) {
    return response({ ok: true, snapshot: view(fresh) });
  }

  if (token !== view(fresh).reviewToken) {
    return response({ ok: false, issue: 'stale-review', snapshot: view(fresh) }, 409);
  }

  if (!fresh.eligible) {
    return response({ ok: false, issue: 'not-eligible', snapshot: view(fresh) }, 409);
  }

  try {
    const auth = await apiRequest<{ reauthenticated?: boolean }>(request, '/auth/reauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ password }),
    });

    if (auth?.reauthenticated !== true) {
      return response({ ok: false, issue: 'reauth-failed' }, 403);
    }
  } catch {
    return response({ ok: false, issue: 'reauth-failed' }, 403);
  }

  try {
    const afterAuth = await read(request);

    if (applied(afterAuth)) {
      return response({ ok: true, snapshot: view(afterAuth) });
    }

    if (view(afterAuth).reviewToken !== token) {
      return response({ ok: false, issue: 'stale-review', snapshot: view(afterAuth) }, 409);
    }

    fresh = afterAuth;
  } catch {
    return response({ ok: false, issue: 'unavailable' }, 502);
  }

  let refusal: Awaited<ReturnType<typeof knownWriteRefusal>>;

  try {
    await apiRequest(request, ENDPOINT, { method: 'POST', redirectOn401: false, body: JSON.stringify(fresh.proposal) });
  } catch (error) {
    refusal = await knownWriteRefusal(error);

    // A transport failure may follow a committed write. Never repeat the POST automatically.
  }

  try {
    const persisted = await read(request);

    if (refusal) {
      return response({ ok: false, issue: refusal.issue, snapshot: view(persisted) }, refusal.status);
    }

    if (applied(persisted, fresh)) {
      return response({ ok: true, snapshot: view(persisted) });
    }

    return response({ ok: false, issue: 'outcome-unknown', snapshot: view(persisted) }, 502);
  } catch {
    if (refusal) {
      return response({ ok: false, issue: refusal.issue }, refusal.status);
    }

    return response({ ok: false, issue: 'outcome-unknown' }, 502);
  }
}
