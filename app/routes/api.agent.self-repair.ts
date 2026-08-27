import { type ActionFunctionArgs } from 'react-router';

import { buildSelfRepairMessageContent } from './api.agent.self-repair.message';
import { streamText, type Messages } from '~/lib/.server/llm/stream-text';
import { requireWebSession } from '~/lib/.server/require-session';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.agent.self-repair');

/*
 * Phase 0 #2 — server-side single-shot LLM call for the AST self-repair
 * pipeline. Given a self-repair prompt built by `buildSelfRepairPrompt`
 * (hunk-validate.ts), regenerate the corrected file content and return it
 * verbatim so the client retry loop in ActionRunner can re-validate and
 * write. Cookie-based provider/apiKeys resolution mirrors api.chat.ts so
 * the same user-supplied credentials drive both flows.
 *
 * This route stays plain JSON (not a stream): the caller is the
 * ActionRunner inside an in-flight artifact, not the chat UI, so a
 * single-message round trip is the right shape.
 */

const MAX_PROMPT_BYTES = 64_000;

/*
 * Tolerate malformed percent-encoding in a cookie value/name — a stray '%' must
 * not throw a URIError that 500s the whole request; fall back to the raw text.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const item of cookieHeader.split(';').map((cookie) => cookie.trim())) {
    const [name, ...rest] = item.split('=');

    if (name && rest.length > 0) {
      cookies[safeDecode(name.trim())] = safeDecode(rest.join('=').trim());
    }
  }

  return cookies;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function action({ context, request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405);
  }

  // Gate the platform's managed provider keys behind a valid session.
  await requireWebSession(request);

  let body: { prompt?: unknown; model?: unknown; provider?: unknown };

  try {
    body = (await request.json()) as { prompt?: unknown; model?: unknown; provider?: unknown };
  } catch {
    return remainingApiErrorResponse(request, 'INVALID_JSON_BODY', 400);
  }

  if (typeof body.prompt !== 'string' || body.prompt.length === 0) {
    return remainingApiErrorResponse(request, 'SELF_REPAIR_PROMPT_REQUIRED', 400);
  }

  /*
   * Pin self-repair to the same model/provider that generated the file. The
   * caller forwards the active model/provider; we encode them as `[Model:]` /
   * `[Provider:]` tags so streamText routes there instead of the gateway
   * DEFAULT_MODEL/DEFAULT_PROVIDER (which can lack the user's only credential
   * and 502, or quietly repair on a weaker model). Absent values => unchanged.
   */
  const model = typeof body.model === 'string' ? body.model : null;
  const provider = typeof body.provider === 'string' ? body.provider : null;

  if (body.prompt.length > MAX_PROMPT_BYTES) {
    return remainingApiErrorResponse(request, 'SELF_REPAIR_PROMPT_TOO_LARGE', 413, {
      values: { maximum: MAX_PROMPT_BYTES },
    });
  }

  const cookieHeader = request.headers.get('Cookie') ?? '';
  const cookies = parseCookies(cookieHeader);

  let apiKeys: Record<string, string> = {};
  let providerSettings: Record<string, IProviderSetting> = {};

  try {
    apiKeys = JSON.parse(cookies.apiKeys || '{}');
    providerSettings = JSON.parse(cookies.providers || '{}');
  } catch {
    return remainingApiErrorResponse(request, 'SELF_REPAIR_COOKIE_INVALID', 400);
  }

  const messages: Messages = [
    { id: 'self-repair', role: 'user', content: buildSelfRepairMessageContent(body.prompt, model, provider) },
  ];

  try {
    const result = await streamText({
      messages,
      env: context.cloudflare?.env,
      apiKeys,
      providerSettings,
      promptId: 'self-repair',

      /*
       * Forward the client abort signal so a Stop click or the caller's 45s
       * timeout (callSelfRepairEndpoint in action-runner.ts) cancels the
       * upstream provider request instead of letting it generate (and bill)
       * the full file after the HTTP connection has already dropped.
       */
      abortSignal: request.signal,
    });

    const content = await result.text;
    const finishReason = await result.finishReason;

    /*
     * The self-repair prompt asks the model to re-emit the FULL file. If it hit
     * the token cap, `content` is truncated — accepting it would silently drop
     * the tail of the file. Signal failure so the ActionRunner counts it as a
     * failed attempt instead of writing a truncated file.
     */
    if (finishReason === 'length') {
      return remainingApiErrorResponse(request, 'SELF_REPAIR_TRUNCATED', 422);
    }

    return json({ content });
  } catch (error) {
    logger.error(
      'Self-repair LLM call failed',
      error instanceof Response
        ? { kind: 'response', status: error.status }
        : error instanceof Error
          ? { kind: 'error', name: error.name }
          : { kind: 'unknown' },
    );

    return remainingApiErrorResponse(request, 'SELF_REPAIR_FAILED', 502);
  }
}
