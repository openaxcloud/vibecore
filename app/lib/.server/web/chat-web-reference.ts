/**
 * Chat-route half of the automatic web reference (BUG-AGENT-WEBCLONE-001),
 * extracted from api.chat.ts so it can be pinned by a unit test: the route is
 * ~2 100 lines with no harness, and the progress-annotation contract below
 * (« never leave a spinner in-progress ») is exactly the kind of guard a
 * refactor breaks silently.
 *
 * Contract:
 *  - no URL in the last user message → no annotation, messages untouched;
 *  - URL detected → ONE 'in-progress' annotation (« Lecture de <host> ») then,
 *    whatever happens, ONE 'complete' annotation with the same `order`
 *    (« <host> lu : N page(s) » or « <host> illisible (<code>) »);
 *  - the observed block is appended to the last user message for the planner
 *    and the specialist lanes, and returned as `webReferenceContext` for the
 *    generating model's trailing context message.
 */
import type { Message } from 'ai';

import type { SafeFetch } from './safe-fetch';
import { resolveReferenceText, resolveWebReferenceForTurn, type WebReferenceResult } from './web-reference';
import { API_CHAT_PROGRESS_LABELS, formatApiChatCopy, type ApiChatCopyKey } from '~/lib/i18n/catalogs/api-chat';
import {
  formatApiRuntimeRoutesCopy,
  getApiRuntimeRoutesCopy,
  type ApiRuntimeRoutesKey,
} from '~/lib/i18n/catalogs/api-runtime-routes';
import {
  appendWebReferenceToMessages,
  detectWebReferenceRequest,
  formatWebReferenceBlock,
} from '~/lib/web-page-digest';
import type { ProgressAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('web-reference');

type ResolveWebReference = typeof resolveWebReferenceForTurn;

/**
 * Soft per-tenant limiter for site reads (in-memory, per web pod). One chat
 * message can cost up to ~9 outbound fetches; without a ceiling a single
 * project could turn the web pod into a crawler. Sliding window, pruned on use.
 */
export const WEB_REFERENCE_RATE_LIMIT = { maxCollections: 12, windowMs: 10 * 60 * 1000 } as const;

const collectionsByKey = new Map<string, number[]>();

export function acquireWebReferenceSlot(key: string, now: number = Date.now()): boolean {
  const since = now - WEB_REFERENCE_RATE_LIMIT.windowMs;
  const recent = (collectionsByKey.get(key) ?? []).filter((at) => at > since);

  if (recent.length >= WEB_REFERENCE_RATE_LIMIT.maxCollections) {
    collectionsByKey.set(key, recent);

    return false;
  }

  recent.push(now);
  collectionsByKey.set(key, recent);

  // Keep the map bounded: drop keys idle for a whole window.
  if (collectionsByKey.size > 5000) {
    for (const [otherKey, stamps] of collectionsByKey) {
      if (!stamps.some((at) => at > since)) {
        collectionsByKey.delete(otherKey);
      }
    }
  }

  return true;
}

/**
 * Memo of recent collections per tenant: a follow-up turn that names the same
 * URLs (or refers to « le site ») reuses the result for 10 minutes instead of
 * re-fetching — and does not consume a rate-limit slot.
 */
export const WEB_REFERENCE_MEMO_TTL_MS = 10 * 60 * 1000;

const memoByKey = new Map<string, { at: number; result: WebReferenceResult }>();

function memoKey(tenant: string, urls: string[], crawl: boolean): string {
  return `${tenant}|${crawl ? 'crawl' : 'pages'}|${[...urls].sort().join(',')}`;
}

function readMemo(key: string, now: number): WebReferenceResult | undefined {
  const hit = memoByKey.get(key);

  if (!hit) {
    return undefined;
  }

  if (now - hit.at > WEB_REFERENCE_MEMO_TTL_MS) {
    memoByKey.delete(key);

    return undefined;
  }

  return hit.result;
}

function writeMemo(key: string, result: WebReferenceResult, now: number): void {
  if (memoByKey.size > 500) {
    for (const [otherKey, entry] of memoByKey) {
      if (now - entry.at > WEB_REFERENCE_MEMO_TTL_MS) {
        memoByKey.delete(otherKey);
      }
    }
  }

  memoByKey.set(key, { at: now, result });
}

/** Test hook. */
export function resetWebReferenceRateLimiter(): void {
  collectionsByKey.clear();
  memoByKey.clear();
}

const RUNTIME_REASON_KEYS: Readonly<Record<string, ApiRuntimeRoutesKey>> = {
  FETCH_FAILED: 'apiRuntime.web.fetchFailed',
  HOST_UNRESOLVED: 'apiRuntime.web.hostUnresolved',
  INTERNAL_ADDRESS: 'apiRuntime.web.internalAddress',
  PAGE_TOO_LARGE: 'apiRuntime.web.pageTooLarge',
  TIMEOUT: 'apiRuntime.web.timeout',
  TOO_MANY_REDIRECTS: 'apiRuntime.web.tooManyRedirects',
  URL_NOT_ALLOWED: 'apiRuntime.web.urlNotAllowed',
  UNSUPPORTED_CONTENT_TYPE: 'apiRuntime.web.unsupportedContent',
};

const CHAT_REASON_KEYS: Readonly<Record<string, ApiChatCopyKey>> = {
  RATE_LIMITED: 'webReasonRateLimited',
  DIGEST_FAILED: 'webReasonDigestFailed',
  TIME_BUDGET_EXCEEDED: 'webReasonTimeBudget',
  ROBOTS_DISALLOWED: 'webReasonRobots',
};

/** Human reason for an error code, in the user's language (never a raw enum in the status bar). */
export function describeWebReferenceError(code: string, language: string | null | undefined): string {
  const runtimeKey = RUNTIME_REASON_KEYS[code];

  if (runtimeKey) {
    return getApiRuntimeRoutesCopy(language)[runtimeKey];
  }

  const http = code.match(/^HTTP_(\d{3})$/u);

  if (http) {
    return formatApiRuntimeRoutesCopy(getApiRuntimeRoutesCopy(language)['apiRuntime.web.httpFailure'], {
      status: http[1],
    });
  }

  const chatKey = CHAT_REASON_KEYS[code];

  if (chatKey) {
    return formatApiChatCopy(language, chatKey);
  }

  return formatApiChatCopy(language, 'webReasonUnknown', { code });
}

export interface PrepareWebReferenceInput<T extends Omit<Message, 'id'> | Message> {
  messages: T[];
  chatMode?: string;
  language?: string | null;
  signal?: AbortSignal;

  /** The chat route's data stream (only `writeData` is used). */
  dataStream: { writeData: (value: ProgressAnnotation) => void };

  /** Allocates the next progress `order` (the route's `progressCounter++`). */
  nextProgressOrder: () => number;

  /**
   * Tenant key (the project id). REQUIRED to fetch anything: the chat quota
   * gate only runs `if (projectId)`, so a request without one has not been
   * authenticated or metered and must not make the web pod fetch on its behalf.
   */
  rateLimitKey?: string;

  /** Injectable for tests. */
  fetchPage?: SafeFetch;
  resolve?: ResolveWebReference;
  now?: () => number;
}

export interface PreparedWebReference<T> {
  webReference: WebReferenceResult | undefined;

  /** Messages for the planner + specialist lanes (block appended to the last user message). */
  messagesForAgents: T[];

  /** The block for the generating model's trailing context message. */
  webReferenceContext: string | undefined;

  /**
   * Condensed block (titles, headings, palette, navigation; no copy, no CSS)
   * for the auto-continuation segments: the files already generated carry the
   * copy, and the full block would be re-sent uncached up to 8 times.
   */
  webReferenceContextForContinuation: string | undefined;
}

/** Cap for the condensed continuation block. */
export const CONTINUATION_BLOCK_MAX_CHARS = 12_000;

export async function prepareWebReferenceForChat<T extends Omit<Message, 'id'> | Message>(
  input: PrepareWebReferenceInput<T>,
): Promise<PreparedWebReference<T>> {
  const resolve = input.resolve ?? resolveWebReferenceForTurn;
  const now = input.now ?? (() => Date.now());
  const startedAt = now();

  let progressOrder: number | undefined;
  let announcedHost = 'site';

  const writeProgress = (status: ProgressAnnotation['status'], message: string) => {
    if (progressOrder === undefined) {
      return;
    }

    input.dataStream.writeData({
      type: 'progress',
      label: API_CHAT_PROGRESS_LABELS.webReference,
      status,
      order: progressOrder,
      message,
    });
  };

  let webReference: WebReferenceResult | undefined;

  const passthrough: PreparedWebReference<T> = {
    webReference: undefined,
    messagesForAgents: input.messages,
    webReferenceContext: undefined,
    webReferenceContextForContinuation: undefined,
  };

  if (!input.rateLimitKey) {
    return passthrough;
  }

  const announce = (host: string) => {
    announcedHost = host || announcedHost;
    progressOrder = input.nextProgressOrder();
    writeProgress('in-progress', formatApiChatCopy(input.language, 'readingWebsite', { host: announcedHost }));
  };

  const reference =
    input.chatMode === 'build' || input.chatMode === 'discuss'
      ? resolveReferenceText(input.messages)
      : { text: '', lookedBack: false };

  const request = detectWebReferenceRequest(reference.text);

  if (request.urls.length === 0) {
    return passthrough;
  }

  const crawl = !reference.lookedBack;
  const memo = memoKey(input.rateLimitKey, request.urls, crawl);
  const cached = readMemo(memo, startedAt);

  if (cached) {
    webReference = cached;
    announce(cached.host ?? announcedHost);
  } else if (!acquireWebReferenceSlot(input.rateLimitKey, startedAt)) {
    /* Over the ceiling: tell the user and the model, fetch nothing. */
    const errors = request.urls.map((url) => ({ url, code: 'RATE_LIMITED' }));

    webReference = {
      block: formatWebReferenceBlock([], errors, { cloneIntent: request.cloneIntent }),
      pages: [],
      errors,
      cloneIntent: request.cloneIntent,
      stylesheetsRead: 0,
      host: new URL(request.urls[0]).hostname,
    };
    announce(webReference.host ?? announcedHost);
  } else {
    try {
      webReference = await resolve({
        messages: input.messages,
        chatMode: input.chatMode,
        language: input.language,
        signal: input.signal,
        fetchPage: input.fetchPage,
        onStart: ({ host }) => announce(host),
      });
    } catch (error) {
      // resolveWebReferenceForTurn never throws by contract; belt and braces for the spinner.
      logger.warn('web reference resolution threw; continuing without it', error);
      webReference = undefined;
    }

    if (webReference && webReference.pages.length > 0) {
      writeMemo(memo, webReference, startedAt);
    }
  }

  if (progressOrder !== undefined) {
    const host = webReference?.host ?? announcedHost;

    if (webReference && webReference.pages.length > 0) {
      writeProgress(
        'complete',
        formatApiChatCopy(input.language, 'websiteRead', {
          host,
          pages: webReference.pages.length,
          stylesheets: webReference.stylesheetsRead,
        }),
      );
    } else {
      writeProgress(
        'complete',
        formatApiChatCopy(input.language, 'websiteUnreachable', {
          host,
          reason: describeWebReferenceError(webReference?.errors[0]?.code ?? 'FETCH_FAILED', input.language),
        }),
      );
    }

    // One greppable line per site read for operators (no page content): grep 'chat.webReference'.
    logger.info(
      JSON.stringify({
        event: 'chat.webReference',
        projectId: input.rateLimitKey,
        host,
        cached: Boolean(cached),
        crawl,
        cloneIntent: webReference?.cloneIntent ?? false,
        pages: webReference?.pages.length ?? 0,
        stylesheets: webReference?.stylesheetsRead ?? 0,
        errors: webReference?.errors.map((entry) => entry.code) ?? ['FETCH_FAILED'],
        blockChars: webReference?.block.length ?? 0,
        durationMs: now() - startedAt,
      }),
    );
  }

  const condensed = webReference
    ? formatWebReferenceBlock(webReference.pages, webReference.errors, {
        cloneIntent: webReference.cloneIntent,
        maxTextChars: 400,
        maxBlockChars: CONTINUATION_BLOCK_MAX_CHARS,
        includeInlineCss: false,
      })
    : undefined;

  return {
    webReference,
    messagesForAgents: webReference ? appendWebReferenceToMessages(input.messages, webReference.block) : input.messages,
    webReferenceContext: webReference?.block,
    webReferenceContextForContinuation: condensed,
  };
}
