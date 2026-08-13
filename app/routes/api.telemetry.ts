import { type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { FixedWindowRateLimiter } from '~/lib/fixed-window-rate-limiter';
import { createScopedLogger } from '~/utils/logger';

/*
 * Server-side sink for CLIENT-side optimization telemetry.
 *
 * The diff-edit apply telemetry (`agent:diff-edit:apply`) is emitted inside the
 * browser ActionRunner, so its `diff-edit.apply` log only reaches the devtools
 * console — invisible to `kubectl logs`. This route lets the client POST that
 * event fire-and-forget; the web pod re-logs it as a structured `opt.telemetry`
 * INFO line, making the token savings greppable + aggregatable in prod:
 *
 *   kubectl -n vibecore logs -l app.kubernetes.io/name=web | grep 'opt.telemetry'
 *
 * Purely additive + best-effort: it never touches the generation path, accepts
 * only a small bounded payload from an authenticated session, and is IP
 * rate-limited. An invalid / anonymous / rate-limited call is dropped quietly.
 */

const logger = createScopedLogger('opt.telemetry');

/*
 * A single generation can apply targeted diffs to a few dozen files, so allow a
 * generous per-IP burst while still bounding abuse on this internet-facing route.
 */
const limiter = new FixedWindowRateLimiter({ limit: 240, windowMs: 60_000 });

const SESSION_COOKIE = 'vc_session';

/*
 * Running per-process total (best-effort bonus). Resets on pod restart and is
 * per-replica, so it's a rough live signal — the authoritative number comes from
 * summing `estimatedTokensSaved` across the `opt.telemetry` log lines.
 */
let cumulativeTokensSavedThisProcess = 0;

const telemetrySchema = z
  .object({
    type: z.enum(['diff-edit-apply', 'context-optimization']),
    outcome: z.string().max(32).optional(),
    filePath: z.string().max(1024).optional(),
    blockCount: z.number().int().min(0).max(1_000_000).optional(),
    addedLines: z.number().int().min(0).max(10_000_000).optional(),
    removedLines: z.number().int().min(0).max(10_000_000).optional(),
    hunkCount: z.number().int().min(0).max(1_000_000).optional(),
    fellBackToFullFile: z.boolean().optional(),
    failureKind: z.string().max(64).optional(),
    estimatedTokensSaved: z.number().int().min(0).max(100_000_000).optional(),
    model: z.string().max(128).optional(),
    provider: z.string().max(64).optional(),
    chatId: z.string().max(128).optional(),
  })
  .strip();

/**
 * Client IP for rate limiting. Mirrors app/lib/security.ts: trust only the
 * nginx-set `x-real-ip`, then the RIGHTMOST (proxy-appended) `x-forwarded-for`
 * entry — the leftmost entry is client-forgeable and would let an attacker
 * rotate the bucket.
 */
function getClientIP(request: Request): string {
  const realIP = request.headers.get('x-real-ip');

  if (realIP?.trim()) {
    return realIP.trim();
  }

  const parts =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? [];

  return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}

/** True when the request carries a non-empty `vc_session` cookie (authenticated browser). */
function hasSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';

  return cookie
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith(`${SESSION_COOKIE}=`) && part.length > SESSION_COOKIE.length + 1);
}

const NO_CONTENT = () => new Response(null, { status: 204 });

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  /*
   * Fire-and-forget contract: the client never reacts to the response, so an
   * anonymous or rate-limited call is dropped with a quiet 204/429 rather than a
   * noisy error. Only authenticated sessions are logged.
   */
  if (!hasSession(request)) {
    return NO_CONTENT();
  }

  if (!limiter.check(getClientIP(request))) {
    return new Response(null, { status: 429 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = telemetrySchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
  }

  cumulativeTokensSavedThisProcess += parsed.data.estimatedTokensSaved ?? 0;

  // Structured INFO line — greppable as `opt.telemetry` in the web pod logs.
  logger.info(
    JSON.stringify({
      event: 'opt.telemetry',
      ...parsed.data,
      cumulativeTokensSavedThisProcess,
      timestamp: new Date().toISOString(),
    }),
  );

  return NO_CONTENT();
}
