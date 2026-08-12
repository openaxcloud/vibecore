import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACTED, redactUrlCredentials } from './log-redaction.js';

/*
 * BUG-QA-TOKEN-IN-LOGS — proven live on the audit test cluster (2026-08-12).
 *
 * A scan of the shared api pod's own logs found 9 occurrences of a live bearer
 * token, all on the runtime WebSocket endpoints, e.g.:
 *
 *   {"msg":"incoming request",
 *    "req":{"url":"/api/runtime/workspaces/ws-090fb06e5a098932/ports/watch?token=<LIVE TOKEN>"}}
 *
 * A browser cannot set headers on a WebSocket handshake, so these endpoints
 * must carry their credential in the query string; the defect is that the
 * request logger serialized the URL verbatim.
 */

const WS = '/api/runtime/workspaces/ws-090fb06e5a098932';

describe('redactUrlCredentials', () => {
  it('redacts the token on the exact URLs found in the live logs', () => {
    for (const path of ['ports/watch', 'files/watch']) {
      const out = redactUrlCredentials(`${WS}/${path}?token=vc_live_9f3a8b2c1d4e5f6a7b8c9d0e`);

      expect(out).toBe(`${WS}/${path}?token=${REDACTED}`);
      expect(out).not.toContain('vc_live_');
    }
  });

  it('keeps the useful parameters and redacts only the credential', () => {
    const out = redactUrlCredentials(
      `${WS}/terminal?sessionId=terminal-1786549119190-ws48mql2vve&cols=80&rows=24&managed=1&token=vc_live_secret_value`,
    );

    // Diagnostic value is preserved…
    expect(out).toContain('sessionId=terminal-1786549119190-ws48mql2vve');
    expect(out).toContain('cols=80');
    expect(out).toContain('rows=24');
    expect(out).toContain('managed=1');

    // …the credential is not.
    expect(out).toContain(`token=${REDACTED}`);
    expect(out).not.toContain('vc_live_secret_value');
  });

  it('is case-insensitive on the parameter name', () => {
    expect(redactUrlCredentials('/x?Token=abc123def456')).toBe(`/x?Token=${REDACTED}`);
    expect(redactUrlCredentials('/x?ACCESS_TOKEN=abc123def456')).toBe(`/x?ACCESS_TOKEN=${REDACTED}`);
  });

  it('covers the other credential-bearing parameter names', () => {
    for (const name of ['api_key', 'apikey', 'secret', 'password', 'signature', 'refresh_token', 'client_secret']) {
      const out = redactUrlCredentials(`/x?${name}=super-secret-value`);

      expect(out).toBe(`/x?${name}=${REDACTED}`);
      expect(out).not.toContain('super-secret-value');
    }
  });

  it('still masks capability tokens carried in the PATH', () => {
    expect(redactUrlCredentials('/chat-shares/abc123token')).toBe(`/chat-shares/${REDACTED}`);
    expect(redactUrlCredentials('/chat-shares/abc123token?x=1')).toBe(`/chat-shares/${REDACTED}?x=1`);
  });

  it('leaves URLs without credentials untouched', () => {
    for (const url of ['/api/projects/abc/files', '/api/projects/abc?limit=20&cursor=xyz', '/health', '']) {
      expect(redactUrlCredentials(url)).toBe(url);
    }
  });

  it('never throws on malformed or unusual input, and preserves fragments', () => {
    expect(() => redactUrlCredentials('/x?')).not.toThrow();
    expect(() => redactUrlCredentials('/x?&&')).not.toThrow();
    expect(() => redactUrlCredentials('%%%not-a-url%%%')).not.toThrow();
    expect(redactUrlCredentials('/x?debug&token=abc123')).toBe(`/x?debug&token=${REDACTED}`);
    expect(redactUrlCredentials('/x?token=abc123#frag')).toBe(`/x?token=${REDACTED}#frag`);
  });

  it('redacts every occurrence when a parameter is repeated', () => {
    const out = redactUrlCredentials('/x?token=one111111&y=2&token=two2222222');

    expect(out).toBe(`/x?token=${REDACTED}&y=2&token=${REDACTED}`);
    expect(out).not.toContain('one111111');
    expect(out).not.toContain('two2222222');
  });
});

describe('BUG-QA-TOKEN-IN-LOGS — the redaction is wired into the request logger', () => {
  const appSource = readFileSync(join(__dirname, 'app.ts'), 'utf8');

  it("the fastify req serializer routes request.url through redactUrlCredentials", () => {
    expect(appSource).toMatch(/const\s+safeUrl\s*=\s*redactUrlCredentials\(/);
  });

  it('no longer masks only the chat-shares path inline', () => {
    // The previous implementation was a bare .replace() on the path and nothing else.
    expect(appSource).not.toMatch(/const\s+safeUrl\s*=\s*\(request\.url as string\)\.replace\(/);
  });
});
