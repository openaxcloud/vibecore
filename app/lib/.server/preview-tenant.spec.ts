import { createHmac, timingSafeEqual } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PREVIEW_TENANT_COOKIE,
  PREVIEW_TENANT_TTL_MS,
  previewTenantCookie,
  signPreviewTenantToken,
} from './preview-tenant';

/*
 * Verbatim copy of services/preview-proxy/src/app.ts `verifyPreviewTenantToken`
 * — the source of truth the proxy uses. If our signer ever drifts from the
 * proxy's wire format, these round-trips fail. Keep in sync with that function.
 */
function verifyPreviewTenantToken(token: string | undefined, secret: string | undefined, nowMs: number) {
  if (!token || !secret) {
    return undefined;
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    return undefined;
  }

  const [orgB64, expRaw, sig] = parts;
  const exp = Number(expRaw);

  if (!Number.isInteger(exp) || exp <= nowMs) {
    return undefined;
  }

  const b64 = (input: Buffer) => input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const expected = b64(createHmac('sha256', secret).update(`${orgB64}.${expRaw}`).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return undefined;
  }

  try {
    const orgId = Buffer.from(orgB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

    return orgId.length > 0 ? orgId : undefined;
  } catch {
    return undefined;
  }
}

const SECRET = 'test-secret-abc';
const NOW = 1_700_000_000_000;

describe('signPreviewTenantToken ↔ proxy verify', () => {
  it('produces a token the proxy verify accepts, recovering the orgId', () => {
    const token = signPreviewTenantToken('org_123', NOW + PREVIEW_TENANT_TTL_MS, SECRET);
    expect(token.split('.')).toHaveLength(3);
    expect(verifyPreviewTenantToken(token, SECRET, NOW)).toBe('org_123');
  });

  it('is rejected by verify under the wrong secret', () => {
    const token = signPreviewTenantToken('org_123', NOW + PREVIEW_TENANT_TTL_MS, SECRET);
    expect(verifyPreviewTenantToken(token, 'other', NOW)).toBeUndefined();
  });

  it('is rejected once expired', () => {
    const token = signPreviewTenantToken('org_123', NOW - 1, SECRET);
    expect(verifyPreviewTenantToken(token, SECRET, NOW)).toBeUndefined();
  });

  it('is rejected when the signature is tampered', () => {
    const token = signPreviewTenantToken('org_123', NOW + PREVIEW_TENANT_TTL_MS, SECRET);
    const tampered = `${token.slice(0, -2)}xy`;
    expect(verifyPreviewTenantToken(tampered, SECRET, NOW)).toBeUndefined();
  });
});

describe('previewTenantCookie', () => {
  const original = process.env.PREVIEW_TENANT_SECRET;

  beforeEach(() => {
    process.env.PREVIEW_TENANT_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.PREVIEW_TENANT_SECRET;
    } else {
      process.env.PREVIEW_TENANT_SECRET = original;
    }
  });

  it('mints a Domain-scoped, HttpOnly cookie whose token verifies', () => {
    const cookie = previewTenantCookie('org_123', 'app.e-code.ai', NOW);
    expect(cookie).toBeDefined();
    expect(cookie).toContain(`${PREVIEW_TENANT_COOKIE}=`);
    expect(cookie).toContain('Domain=.e-code.ai');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain(`Max-Age=${Math.floor(PREVIEW_TENANT_TTL_MS / 1000)}`);

    const token = cookie!.slice(cookie!.indexOf('=') + 1, cookie!.indexOf(';'));
    expect(verifyPreviewTenantToken(token, SECRET, NOW)).toBe('org_123');
  });

  it('drops the Domain attribute on localhost', () => {
    const cookie = previewTenantCookie('org_123', 'localhost', NOW);
    expect(cookie).toBeDefined();
    expect(cookie).not.toContain('Domain=');
  });

  it('returns undefined when no orgId', () => {
    expect(previewTenantCookie(undefined, 'app.e-code.ai', NOW)).toBeUndefined();
  });

  it('returns undefined (inert) when the secret is not set', () => {
    delete process.env.PREVIEW_TENANT_SECRET;
    expect(previewTenantCookie('org_123', 'app.e-code.ai', NOW)).toBeUndefined();
  });
});
