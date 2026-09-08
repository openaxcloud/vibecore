/**
 * Automatic web reference for the agent (BUG-AGENT-WEBCLONE-001).
 *
 * When the last user message names a public URL, the chat route calls
 * `collectWebReference` BEFORE generating: the page is fetched through the
 * SSRF-guarded `safeFetch`, digested (structure, copy, palette, fonts, images,
 * navigation) and, for a clone request, the crawl follows same-site navigation
 * links within a page/time budget. The resulting `<web_reference>` block is
 * handed to the generating model (trailing context message) and to the
 * specialist lanes (appended to the last user message), so « clone ce site »
 * is answered from OBSERVED content rather than « je n'ai pas accès au réseau »
 * or an invented site description.
 *
 * Everything is fail-open: an unreachable site becomes an `<errors>` entry the
 * prompt tells the model to report honestly, never an exception on the chat path.
 */
import type { Message } from 'ai';

import { acceptLanguageFor, safeFetch, type SafeFetch } from './safe-fetch';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import {
  detectWebReferenceRequest,
  extractCssPalette,
  extractWebPageDigest,
  formatWebReferenceBlock,
  mergePaletteIntoDigest,
  type WebPageDigest,
  type WebReferenceError,
} from '~/lib/web-page-digest';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('web-reference');

export interface CollectWebReferenceInput {
  /** Text of the user's message (URL detection + intent). */
  text: string;

  /** UI language → Accept-Language for the fetch. */
  language?: string | null;

  /** Injectable for tests. Defaults to the SSRF-guarded `safeFetch`. */
  fetchPage?: SafeFetch;

  /** Total page budget: explicit URLs + crawled navigation. */
  maxPages?: number;

  /** Explicit URLs fetched at most (the user rarely means more). */
  maxExplicitUrls?: number;

  /** External stylesheets read for palette/fonts (first page only). */
  maxStylesheets?: number;

  /** Wall-clock budget for the whole collection. */
  timeBudgetMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  fetchedAt?: Date;

  /** Called once URLs are detected, before any fetch (progress UI). */
  onStart?: (info: { urls: string[]; cloneIntent: boolean; host: string }) => void;
}

export interface WebReferenceResult {
  block: string;
  pages: WebPageDigest[];
  errors: WebReferenceError[];
  cloneIntent: boolean;
  stylesheetsRead: number;

  /** The host of the first page — for the progress message. */
  host?: string;
}

export const WEB_REFERENCE_DEFAULTS = {
  maxPages: 6,
  maxPagesWithoutCloneIntent: 1,
  maxExplicitUrls: 3,
  maxStylesheets: 2,
  timeBudgetMs: 20_000,
  stylesheetParseChars: 300_000,
} as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function isHtml(contentType: string): boolean {
  return /text\/html|application\/xhtml\+xml/iu.test(contentType) || contentType.trim() === '';
}

function isCss(contentType: string, url: string): boolean {
  return /text\/css/iu.test(contentType) || (contentType.trim() === '' && /\.css(\?|$)/iu.test(url));
}

/**
 * Fetch and digest everything the message points at. Returns `undefined` when
 * the message names no URL (the common case — zero cost).
 */
export async function collectWebReference(input: CollectWebReferenceInput): Promise<WebReferenceResult | undefined> {
  const request = detectWebReferenceRequest(input.text);

  if (request.urls.length === 0) {
    return undefined;
  }

  input.onStart?.({ urls: request.urls, cloneIntent: request.cloneIntent, host: hostOf(request.urls[0]) });

  const fetchPage = input.fetchPage ?? safeFetch;
  const acceptLanguage = acceptLanguageFor(input.language);
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const timeBudgetMs = input.timeBudgetMs ?? WEB_REFERENCE_DEFAULTS.timeBudgetMs;

  const maxPages = request.cloneIntent
    ? (input.maxPages ?? WEB_REFERENCE_DEFAULTS.maxPages)
    : Math.min(input.maxPages ?? WEB_REFERENCE_DEFAULTS.maxPages, WEB_REFERENCE_DEFAULTS.maxPagesWithoutCloneIntent);

  const maxExplicit = input.maxExplicitUrls ?? WEB_REFERENCE_DEFAULTS.maxExplicitUrls;
  const maxStylesheets = input.maxStylesheets ?? WEB_REFERENCE_DEFAULTS.maxStylesheets;

  const pages: WebPageDigest[] = [];
  const errors: WebReferenceError[] = [];
  const visited = new Set<string>();
  const keyOf = (url: string) => url.replace(/\/$/u, '').toLowerCase();

  const outOfBudget = () => input.signal?.aborted || now() - startedAt > timeBudgetMs;

  const fetchOne = async (url: string): Promise<void> => {
    const key = keyOf(url);

    if (visited.has(key) || pages.length >= maxPages) {
      return;
    }

    visited.add(key);

    if (outOfBudget()) {
      errors.push({ url, code: 'TIME_BUDGET_EXCEEDED' });

      return;
    }

    let result;

    try {
      result = await fetchPage(url, acceptLanguage);
    } catch (error) {
      logger.warn('web reference fetch threw', { url, error: (error as Error)?.message });
      errors.push({ url, code: 'FETCH_FAILED' });

      return;
    }

    if (!result.ok) {
      errors.push({ url, code: result.code });

      return;
    }

    if (result.status < 200 || result.status >= 300) {
      errors.push({ url, code: `HTTP_${result.status}` });

      return;
    }

    if (!isHtml(result.contentType)) {
      errors.push({ url, code: 'UNSUPPORTED_CONTENT_TYPE' });

      return;
    }

    visited.add(keyOf(result.url));
    pages.push(extractWebPageDigest(result.html, { url: result.url, requestedUrl: url, status: result.status }));
  };

  // 1. The URLs the user wrote.
  for (const url of request.urls.slice(0, maxExplicit)) {
    await fetchOne(url);
  }

  // 2. Clone intent: follow the first page's same-site navigation.
  if (request.cloneIntent && pages.length > 0) {
    const frontier = [...pages[0].links];

    for (const link of frontier) {
      if (pages.length >= maxPages || outOfBudget()) {
        break;
      }

      await fetchOne(link);
    }
  }

  /*
   * 3. Palette/fonts from the first page's external stylesheets (Tailwind and
   *    most builders ship them compiled: inline <style> alone is often empty).
   */
  let stylesheetsRead = 0;

  if (pages.length > 0 && maxStylesheets > 0) {
    const extraColors: string[] = [];
    const extraFonts: string[] = [];

    for (const sheet of pages[0].stylesheets.slice(0, maxStylesheets)) {
      if (outOfBudget()) {
        break;
      }

      try {
        const result = await fetchPage(sheet, acceptLanguage);

        if (result.ok && result.status >= 200 && result.status < 300 && isCss(result.contentType, sheet)) {
          const palette = extractCssPalette(result.html.slice(0, WEB_REFERENCE_DEFAULTS.stylesheetParseChars));
          extraColors.push(...palette.colors);
          extraFonts.push(...palette.fonts);
          stylesheetsRead += 1;
        }
      } catch (error) {
        logger.warn('web reference stylesheet fetch threw', { sheet, error: (error as Error)?.message });
      }
    }

    if (extraColors.length > 0 || extraFonts.length > 0) {
      pages[0] = mergePaletteIntoDigest(pages[0], { colors: extraColors, fonts: extraFonts });
    }
  }

  const block = formatWebReferenceBlock(pages, errors, {
    fetchedAt: input.fetchedAt,
    cloneIntent: request.cloneIntent,
  });

  const host = hostOf(pages[0]?.url ?? request.urls[0]);

  return { block, pages, errors, cloneIntent: request.cloneIntent, stylesheetsRead, host };
}

/** Text of the last user message, model/provider tags stripped. */
export function lastUserMessageText(messages: ReadonlyArray<Omit<Message, 'id'> | Message>): string {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return '';
  }

  const { content } = extractPropertiesFromMessage(lastUser);

  return content;
}

/**
 * Chat-route entry point: resolve the web reference for THIS turn from the
 * conversation. Build mode only (Ask/Plan answer from the summary the user
 * pasted); never throws.
 */
export async function resolveWebReferenceForTurn(input: {
  messages: ReadonlyArray<Omit<Message, 'id'> | Message>;
  chatMode?: string;
  language?: string | null;
  signal?: AbortSignal;
  fetchPage?: SafeFetch;
  onStart?: CollectWebReferenceInput['onStart'];
}): Promise<WebReferenceResult | undefined> {
  if (input.chatMode !== 'build') {
    return undefined;
  }

  const text = lastUserMessageText(input.messages);

  if (!text || !/https?:\/\/|\.[a-z]{2,}(\/|\s|$)/iu.test(text)) {
    return undefined;
  }

  try {
    return await collectWebReference({
      text,
      language: input.language,
      signal: input.signal,
      fetchPage: input.fetchPage,
      onStart: input.onStart,
    });
  } catch (error) {
    logger.warn('web reference collection failed; continuing without it', error);

    return undefined;
  }
}
