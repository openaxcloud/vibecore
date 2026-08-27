import { describe, expect, it } from 'vitest';
import { action } from './api.report.abuse';
import { getWebApiRoutesCopy } from '~/lib/i18n/catalogs/web-api-routes';
import { toResponse } from '~/lib/test/rr7-data';

function request(body: unknown, init: RequestInit = {}) {
  const { headers, ...rest } = init;

  return new Request('https://e-code.ai/api/report/abuse', {
    method: 'POST',
    ...rest,
    headers: { 'content-type': 'application/json', ...((headers as Record<string, string>) ?? {}) },
    body: JSON.stringify(body),
  });
}

describe('/api/report/abuse', () => {
  it('rejects unsupported methods', async () => {
    const response = toResponse(
      await action({
        request: new Request('https://e-code.ai/api/report/abuse', { method: 'GET' }),
        context: {},
        params: {},
      }),
    );

    expect(response.status).toBe(405);
  });

  it('validates abuse report payloads', async () => {
    const response = toResponse(
      await action({
        request: request({ reportType: 'code', targetUrl: 'not-a-url', description: 'too short' }),
        context: {},
        params: {},
      }),
    );

    const data = (await response.json()) as { code: string; error: string; details?: unknown[] };
    const copy = getWebApiRoutesCopy('en');

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Language')).toBe('en');
    expect(data).toMatchObject({
      code: 'ABUSE_REPORT_INVALID',
      error: copy.ABUSE_REPORT_INVALID,
    });
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'targetUrl', code: expect.any(String) }),
        expect.objectContaining({ field: 'description', code: expect.any(String) }),
      ]),
    );
    expect(JSON.stringify(data)).not.toContain('not-a-url');
    expect(JSON.stringify(data)).not.toContain('too short');
  });

  it('returns a real email fallback when intake credentials are not configured', async () => {
    const previousToken = process.env.ABUSE_REPORT_GITHUB_TOKEN;
    const previousAltToken = process.env.GITHUB_ABUSE_REPORT_TOKEN;
    const previousBugToken = process.env.GITHUB_BUG_REPORT_TOKEN;

    delete process.env.ABUSE_REPORT_GITHUB_TOKEN;
    delete process.env.GITHUB_ABUSE_REPORT_TOKEN;
    delete process.env.GITHUB_BUG_REPORT_TOKEN;

    try {
      const response = toResponse(
        await action({
          request: request({
            reportType: 'privacy',
            targetUrl: 'https://e-code.ai/u/example/project',
            description: 'This page exposes private information without consent.',
            reporterEmail: 'reporter@example.com',
            username: '@example',
            pagePath: '/report-abuse',
          }),
          context: {},
          params: {},
        }),
      );

      const data = (await response.json()) as { code: string; error: string; fallbackMailto: string };
      const copy = getWebApiRoutesCopy('en');
      const mailto = decodeURIComponent(data.fallbackMailto);

      expect(response.status).toBe(503);
      expect(response.headers.get('Content-Language')).toBe('en');
      expect(data).toMatchObject({
        code: 'ABUSE_INTAKE_UNAVAILABLE',
        error: copy.ABUSE_INTAKE_UNAVAILABLE,
      });
      expect(mailto).toContain('mailto:abuse@e-code.ai?subject=');
      expect(mailto).toContain(copy.abuseTypePrivacy);
      expect(mailto).toContain(copy.abuseMailReportType.replace('{type}', copy.abuseTypePrivacy));
      expect(mailto).toContain('https://e-code.ai/u/example/project');
      expect(mailto).toContain('This page exposes private information without consent.');
    } finally {
      if (previousToken === undefined) {
        delete process.env.ABUSE_REPORT_GITHUB_TOKEN;
      } else {
        process.env.ABUSE_REPORT_GITHUB_TOKEN = previousToken;
      }

      if (previousAltToken === undefined) {
        delete process.env.GITHUB_ABUSE_REPORT_TOKEN;
      } else {
        process.env.GITHUB_ABUSE_REPORT_TOKEN = previousAltToken;
      }

      if (previousBugToken === undefined) {
        delete process.env.GITHUB_BUG_REPORT_TOKEN;
      } else {
        process.env.GITHUB_BUG_REPORT_TOKEN = previousBugToken;
      }
    }
  });

  it('does not consume the rate-limit quota on validation or spam failures', async () => {
    const previousToken = process.env.ABUSE_REPORT_GITHUB_TOKEN;
    const previousAltToken = process.env.GITHUB_ABUSE_REPORT_TOKEN;
    const previousBugToken = process.env.GITHUB_BUG_REPORT_TOKEN;

    delete process.env.ABUSE_REPORT_GITHUB_TOKEN;
    delete process.env.GITHUB_ABUSE_REPORT_TOKEN;
    delete process.env.GITHUB_BUG_REPORT_TOKEN;

    // A unique IP isolates this test from any quota consumed by earlier cases.
    const clientIP = '203.0.113.77';

    try {
      /*
       * Far more rejected submissions than the 10/hour limit. Validation
       * failures (15) plus a spam-flagged submission must NOT burn slots.
       */
      for (let i = 0; i < 15; i += 1) {
        const invalid = toResponse(
          await action({
            request: request(
              { reportType: 'code', targetUrl: 'not-a-url', description: 'too short' },
              { headers: { 'x-real-ip': clientIP } },
            ),
            context: {},
            params: {},
          }),
        );
        expect(invalid.status).toBe(400);
      }

      const spam = toResponse(
        await action({
          request: request(
            {
              reportType: 'spam',
              targetUrl: 'https://e-code.ai/u/example/project',
              description: 'Buy now! Limited time offer, click here to win a free casino bonus right now.',
            },
            { headers: { 'x-real-ip': clientIP } },
          ),
          context: {},
          params: {},
        }),
      );
      expect(spam.status).toBe(400);

      /*
       * After 16 rejected requests, a first valid submission must still be
       * accepted into the pipeline (503 fallback here, not 429).
       */
      const valid = toResponse(
        await action({
          request: request(
            {
              reportType: 'privacy',
              targetUrl: 'https://e-code.ai/u/example/project',
              description: 'This page exposes private information without consent.',
            },
            { headers: { 'x-real-ip': clientIP } },
          ),
          context: {},
          params: {},
        }),
      );
      expect(valid.status).toBe(503);
    } finally {
      if (previousToken === undefined) {
        delete process.env.ABUSE_REPORT_GITHUB_TOKEN;
      } else {
        process.env.ABUSE_REPORT_GITHUB_TOKEN = previousToken;
      }

      if (previousAltToken === undefined) {
        delete process.env.GITHUB_ABUSE_REPORT_TOKEN;
      } else {
        process.env.GITHUB_ABUSE_REPORT_TOKEN = previousAltToken;
      }

      if (previousBugToken === undefined) {
        delete process.env.GITHUB_BUG_REPORT_TOKEN;
      } else {
        process.env.GITHUB_BUG_REPORT_TOKEN = previousBugToken;
      }
    }
  });
});
