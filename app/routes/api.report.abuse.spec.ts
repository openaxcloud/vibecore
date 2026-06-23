import { describe, expect, it } from 'vitest';
import { action } from './api.report.abuse';
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

    const data = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid abuse report data');
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

      const data = (await response.json()) as { fallbackMailto: string };

      expect(response.status).toBe(503);
      expect(data.fallbackMailto).toContain('mailto:abuse@e-code.ai');
      expect(data.fallbackMailto).toContain('privacy');
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
