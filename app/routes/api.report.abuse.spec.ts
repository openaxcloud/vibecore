import { describe, expect, it } from 'vitest';
import { action } from './api.report.abuse';

function request(body: unknown, init: RequestInit = {}) {
  return new Request('https://e-code.ai/api/report/abuse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

describe('/api/report/abuse', () => {
  it('rejects unsupported methods', async () => {
    const response = await action({
      request: new Request('https://e-code.ai/api/report/abuse', { method: 'GET' }),
      context: {},
      params: {},
    });

    expect(response.status).toBe(405);
  });

  it('validates abuse report payloads', async () => {
    const response = await action({
      request: request({ reportType: 'code', targetUrl: 'not-a-url', description: 'too short' }),
      context: {},
      params: {},
    });

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
      const response = await action({
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
      });

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
});
