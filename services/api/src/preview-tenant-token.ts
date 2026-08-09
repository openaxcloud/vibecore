import { createHmac } from 'node:crypto';

/*
 * Minting of the `vc_preview` tenant token, API side.
 *
 * WHY THIS EXISTS. The preview-proxy gates preview access on this token
 * (PREVIEW_PROXY_ENFORCE_TENANT). Browsers get it as a cookie minted by the web
 * app's IDE loader. But the SCREENSHOTTER — which renders project thumbnails —
 * drives a deliberately blank browser context ("fresh, isolated context so
 * cookies/storage never leak between projects") and therefore carries no cookie
 * at all. Proven live on the audit cluster (2026-08-09): with enforcement on, the
 * screenshotter's exact request shape got `403 PREVIEW_TENANT_FORBIDDEN`, so every
 * thumbnail would have broken the moment the flag was flipped in production.
 *
 * The API knows the project's organisation, so it mints a short-lived token for
 * that org and hands it to the screenshotter, which presents it on the internal
 * header the proxy also accepts. Same credential, same verification, no bypass.
 *
 * The wire format MUST stay byte-identical to
 * services/preview-proxy/src/app.ts#signPreviewTenantToken and
 * app/lib/.server/preview-tenant.ts — three writers, one verifier.
 */

/** Short TTL: a capture is a one-shot render that starts within seconds. */
export const PREVIEW_CAPTURE_TOKEN_TTL_MS = 5 * 60 * 1000;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** `<orgId-b64url>.<expEpochMs>.<sig>` — same scheme the proxy verifies. */
export function signPreviewTenantToken(orgId: string, expiresAtMs: number, secret: string): string {
  const payload = `${base64url(orgId)}.${Math.floor(expiresAtMs)}`;
  const sig = base64url(createHmac('sha256', secret).update(payload).digest());

  return `${payload}.${sig}`;
}

/**
 * Token for a capture of this org's preview, or undefined when the feature is not
 * provisioned (no secret) or there is no org to sign for. Undefined is NOT an
 * error: with enforcement off the proxy ignores the token entirely, so a
 * non-provisioned environment keeps working exactly as before.
 */
export function previewCaptureToken(
  orgId: string | undefined | null,
  nowMs: number = Date.now(),
  secret: string | undefined = process.env.PREVIEW_TENANT_SECRET,
): string | undefined {
  if (!secret || !orgId) {
    return undefined;
  }

  return signPreviewTenantToken(orgId, nowMs + PREVIEW_CAPTURE_TOKEN_TTL_MS, secret);
}
