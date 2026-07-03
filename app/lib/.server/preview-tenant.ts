import { createHmac } from 'node:crypto';

import { themeCookieDomain } from '~/lib/stores/theme-cookie';

/**
 * Mint the `vc_preview` tenant cookie the preview-proxy verifies.
 *
 * The preview is a cross-origin iframe served from `preview.e-code.ai`, a
 * DIFFERENT origin than the IDE (`app.e-code.ai`), so the IDE's host-only
 * `vc_session` cookie is never sent there. To let the proxy recognise an
 * authenticated owner — and to gate a port the project marked PRIVATE — the web
 * app sets a SEPARATE cookie `vc_preview`, scoped to the registrable parent
 * domain (`Domain=.e-code.ai`) so the browser sends it to the preview host, and
 * HMAC-signed over the caller's orgId + an expiry. The proxy
 * (`services/preview-proxy` `verifyPreviewTenantToken`) verifies the exact same
 * wire format: `<base64url(orgId)>.<expEpochMs>.<base64url(HMAC-SHA256)>`.
 *
 * Entirely GATED on `PREVIEW_TENANT_SECRET`: with no secret this mints nothing
 * (returns undefined), so there is zero behaviour change until the secret is
 * provisioned — matching the dark-launch of `PREVIEW_ENFORCE_PRIVATE_PORTS`.
 */

export const PREVIEW_TENANT_COOKIE = 'vc_preview';

/** Cookie lifetime: refreshed on every IDE load, so a 12h window is ample. */
export const PREVIEW_TENANT_TTL_MS = 12 * 60 * 60 * 1000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign a `vc_preview` token. MUST stay byte-identical to the proxy's
 * `signPreviewTenantToken` so the proxy's constant-time verify accepts it.
 */
export function signPreviewTenantToken(orgId: string, expiresAtMs: number, secret: string): string {
  const payload = `${base64url(orgId)}.${Math.floor(expiresAtMs)}`;
  const sig = base64url(createHmac('sha256', secret).update(payload).digest());

  return `${payload}.${sig}`;
}

/**
 * Read `PREVIEW_TENANT_SECRET`. The SSR bundle shims bare `process.env` to `{}`
 * (vite-plugin-node-polyfills), so read the real value off `globalThis.process`
 * — same pattern as require-session.ts / ai-usage.ts.
 */
export function previewTenantSecret(): string | undefined {
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  const value = env.PREVIEW_TENANT_SECRET?.trim();

  return value && value.length > 0 ? value : undefined;
}

/**
 * Build the `Set-Cookie` value for `vc_preview`, or undefined when the feature
 * is not provisioned (no secret) or there is no org to sign. `SameSite=None;
 * Secure` so the cookie is sent when the preview loads in the cross-origin IDE
 * iframe; `HttpOnly` (JS never needs it). `Domain` is the registrable parent
 * (`.e-code.ai`) so `preview.e-code.ai` receives it; on localhost/IP hosts the
 * Domain is dropped (browser would reject it) and SameSite falls back to Lax
 * since `Secure` is not set on plaintext dev.
 */
export function previewTenantCookie(orgId: string | undefined, hostname: string, nowMs: number): string | undefined {
  const secret = previewTenantSecret();

  if (!secret || !orgId) {
    return undefined;
  }

  const token = signPreviewTenantToken(orgId, nowMs + PREVIEW_TENANT_TTL_MS, secret);
  const domain = themeCookieDomain(hostname);
  const isProd = process.env.NODE_ENV === 'production';
  const domainAttr = domain ? `; Domain=${domain}` : '';
  const security = isProd ? '; SameSite=None; Secure' : '; SameSite=Lax';
  const maxAge = Math.floor(PREVIEW_TENANT_TTL_MS / 1000);

  return `${PREVIEW_TENANT_COOKIE}=${token}; Path=/; HttpOnly${security}${domainAttr}; Max-Age=${maxAge}`;
}
