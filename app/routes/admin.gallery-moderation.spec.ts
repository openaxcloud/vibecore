/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, loader, moderationForm } from './admin.gallery-moderation';
import { toResponse } from '~/lib/test/rr7-data';

const ENV_KEYS = ['SAAS_API_URL', 'API_BASE_URL'] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(body?: Record<string, string>, url = 'http://localhost/admin/gallery-moderation') {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: 'vc_session=platform-admin-session',
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
}

const args = (incoming: Request) =>
  ({ request: incoming, params: {}, context: {} }) as unknown as Parameters<typeof action>[0];

function adminFetch(
  overrides: Partial<{
    queue: unknown;
    published: unknown;
    reports: unknown;
    moderate: { body: unknown; status?: number };
    resolve: { body: unknown; status?: number };
  }> = {},
) {
  const calls: Array<{ href: string; method: string; body?: string }> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url.toString();
      const method = init?.method ?? 'GET';
      calls.push({ href, method, body: init?.body as string | undefined });

      if (href.endsWith('/auth/me')) {
        return jsonResponse({ user: { id: 'admin-1', platformAdmin: true } });
      }

      if (href.includes('/admin/gallery/moderation')) {
        return jsonResponse(overrides.queue ?? { apps: [], nextCursor: 'next-queue' });
      }

      if (href.includes('/gallery/apps?')) {
        return jsonResponse(overrides.published ?? { apps: [], nextCursor: 'next-published' });
      }

      if (href.includes('/admin/gallery/reports?')) {
        return jsonResponse(overrides.reports ?? { reports: [], nextCursor: 'next-report' });
      }

      if (href.includes('/admin/gallery/apps/') && href.endsWith('/moderate')) {
        return jsonResponse(overrides.moderate?.body ?? { app: { id: 'app-1' } }, overrides.moderate?.status ?? 200);
      }

      if (href.includes('/admin/gallery/reports/') && href.endsWith('/resolve')) {
        return jsonResponse(
          overrides.resolve?.body ?? { report: { id: 'report-1' } },
          overrides.resolve?.status ?? 200,
        );
      }

      return jsonResponse({});
    }),
  );

  return calls;
}

describe('admin.gallery-moderation', () => {
  let originals: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

  beforeEach(() => {
    originals = {};

    for (const key of ENV_KEYS) {
      originals[key] = process.env[key];
    }

    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    for (const key of ENV_KEYS) {
      const value = originals[key];

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('loads the protected moderation queue, public apps and open reports in parallel with cursor-safe pagination', async () => {
    const calls = adminFetch({
      queue: { apps: [{ id: 'pending-1' }], nextCursor: 'queue-next' },
      published: { apps: [{ id: 'published-1' }], nextCursor: 'published-next' },
      reports: { reports: [{ id: 'report-1' }], nextCursor: 'report-next' },
    });

    const response = toResponse(
      await loader(
        args(
          request(
            undefined,
            'http://localhost/admin/gallery-moderation?tab=reports&queueCursor=q1&publishedCursor=p1&reportCursor=r1',
          ),
        ),
      ),
    ) as Response;
    const payload = (await response.json()) as {
      queue: Array<{ id: string }>;
      publishedApps: Array<{ id: string }>;
      reports: Array<{ id: string }>;
      initialTab: string;
      nextPageHrefs: Record<string, string>;
    };

    expect(payload.queue[0]?.id).toBe('pending-1');
    expect(payload.publishedApps[0]?.id).toBe('published-1');
    expect(payload.reports[0]?.id).toBe('report-1');
    expect(payload.initialTab).toBe('reports');
    expect(payload.nextPageHrefs.reports).toContain('reportCursor=report-next');
    expect(calls.some((call) => call.href.includes('/admin/gallery/moderation?limit=100&cursor=q1'))).toBe(true);
    expect(calls.some((call) => call.href.includes('/gallery/apps?limit=50&sort=RECENT&cursor=p1'))).toBe(true);
    expect(calls.some((call) => call.href.includes('/admin/gallery/reports?status=OPEN&limit=100&cursor=r1'))).toBe(
      true,
    );
  });

  it('approves and features applications through the real admin moderation endpoint', async () => {
    const calls = adminFetch();

    const approve = toResponse(
      await action(
        args(
          request({
            intent: 'moderate',
            appId: 'app/community-1',
            moderationAction: 'APPROVE',
            functionalPreviewConfirmed: 'true',
          }),
        ),
      ),
    ) as Response;

    expect(approve.status).toBe(200);

    const approveCall = calls.find((call) => call.href.endsWith('/admin/gallery/apps/app%2Fcommunity-1/moderate'));
    expect(approveCall?.method).toBe('POST');
    expect(JSON.parse(approveCall?.body ?? '{}')).toEqual({
      action: 'APPROVE',
      functionalPreviewConfirmed: true,
    });

    await action(
      args(
        request({
          intent: 'moderate',
          appId: 'app-2',
          moderationAction: 'FEATURE',
        }),
      ),
    );

    const featureCall = calls.find((call) => call.href.endsWith('/admin/gallery/apps/app-2/moderate'));
    expect(JSON.parse(featureCall?.body ?? '{}')).toEqual({ action: 'FEATURE' });
  });

  it('rejects approval without the explicit functional Preview confirmation', async () => {
    const calls = adminFetch();

    const response = toResponse(
      await action(
        args(
          request({
            intent: 'moderate',
            appId: 'app-unverified',
            moderationAction: 'APPROVE',
          }),
        ),
      ),
    ) as Response;

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/real-browser Preview/i);
    expect(calls.some((call) => call.href.endsWith('/moderate'))).toBe(false);
  });

  it('serializes the UI confirmation into the web moderation form', () => {
    const form = moderationForm({
      kind: 'moderate',
      appId: 'app-confirmed',
      action: 'APPROVE',
      functionalPreviewConfirmed: true,
    });

    expect(form.get('functionalPreviewConfirmed')).toBe('true');
  });

  it('archives a published application with a mandatory audit reason', async () => {
    const calls = adminFetch();

    const response = toResponse(
      await action(
        args(
          request({
            intent: 'moderate',
            appId: 'app-harmful',
            moderationAction: 'ARCHIVE',
            reason: 'Confirmed harmful executable in Preview.',
          }),
        ),
      ),
    ) as Response;

    expect(response.status).toBe(200);

    const call = calls.find((candidate) => candidate.href.endsWith('/admin/gallery/apps/app-harmful/moderate'));
    expect(JSON.parse(call?.body ?? '{}')).toEqual({
      action: 'ARCHIVE',
      reason: 'Confirmed harmful executable in Preview.',
    });
  });

  it('rejects incomplete moderation decisions before calling the mutation endpoint', async () => {
    const calls = adminFetch();

    const response = toResponse(
      await action(
        args(
          request({
            intent: 'moderate',
            appId: 'app-1',
            moderationAction: 'REJECT',
          }),
        ),
      ),
    ) as Response;

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/reason/i);
    expect(calls.some((call) => call.href.endsWith('/moderate'))).toBe(false);
  });

  it('resolves a report with a mandatory audit note', async () => {
    const calls = adminFetch();

    const response = toResponse(
      await action(
        args(
          request({
            intent: 'resolve-report',
            reportId: 'report/1',
            resolution: 'ACTIONED',
            note: 'Preview disabled after malware confirmation.',
          }),
        ),
      ),
    ) as Response;

    expect(response.status).toBe(200);

    const resolveCall = calls.find((call) => call.href.endsWith('/admin/gallery/reports/report%2F1/resolve'));
    expect(resolveCall?.method).toBe('POST');
    expect(JSON.parse(resolveCall?.body ?? '{}')).toEqual({
      resolution: 'ACTIONED',
      note: 'Preview disabled after malware confirmation.',
    });
  });

  it('turns backend state conflicts into a recoverable review message', async () => {
    adminFetch({
      moderate: {
        status: 409,
        body: { error: 'conflict', code: 'GALLERY_MODERATION_STATE_CONFLICT' },
      },
    });

    const response = toResponse(
      await action(
        args(
          request({
            intent: 'moderate',
            appId: 'app-1',
            moderationAction: 'APPROVE',
            functionalPreviewConfirmed: 'true',
          }),
        ),
      ),
    ) as Response;

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toMatch(/changed while you were reviewing/i);
  });
});
