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
import { isAllowedByRobots, parseRobotsTxt } from '~/lib/robots-txt';
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

/**
 * The crawl identifies itself (operators of the sites we read can recognise and
 * block it); the URL the user typed is fetched with the same string — one
 * honest identity for everything this feature sends.
 */
export const WEB_REFERENCE_USER_AGENT =
  'Mozilla/5.0 (compatible; E-CodeBot/1.0; +https://e-code.ai) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface CollectWebReferenceInput {
  /** Text of the user's message (URL detection + intent). */
  text: string;

  /** Follow same-site navigation on a clone intent (default true; off when the URL came from an earlier turn). */
  crawl?: boolean;

  /** Honour robots.txt for crawled pages (default true; the user's own URL is never subject to it). */
  robots?: boolean;

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
  maxExplicitUrls: 3,
  maxStylesheets: 2,
  timeBudgetMs: 20_000,

  /** Per-fetch hard deadline (never above the remaining collection budget). */
  fetchDeadlineMs: 10_000,

  /** Per-document byte cap: an HTML page or stylesheet beyond this is not a site to clone. */
  maxBytesPerDocument: 2 * 1024 * 1024,
  stylesheetParseChars: 300_000,
  stylesheetAccept: 'text/css,*/*;q=0.1',
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

  const maxExplicit = input.maxExplicitUrls ?? WEB_REFERENCE_DEFAULTS.maxExplicitUrls;

  /*
   * Every URL the user wrote counts (up to maxExplicit); the crawl beyond them
   * only happens on a clone intent. Without this, « la tarification de A et la
   * FAQ de B » silently dropped B.
   */
  const explicitUrls = request.urls.slice(0, maxExplicit);

  const maxPages = request.cloneIntent
    ? Math.max(input.maxPages ?? WEB_REFERENCE_DEFAULTS.maxPages, explicitUrls.length)
    : explicitUrls.length;

  const maxStylesheets = input.maxStylesheets ?? WEB_REFERENCE_DEFAULTS.maxStylesheets;

  const pages: WebPageDigest[] = [];
  const errors: WebReferenceError[] = [];
  const visited = new Set<string>();
  const keyOf = (url: string) => url.replace(/\/$/u, '').toLowerCase();

  const outOfBudget = () => input.signal?.aborted || now() - startedAt > timeBudgetMs;
  const remainingMs = () => Math.max(0, timeBudgetMs - (now() - startedAt));

  const fetchOptions = (accept?: string) => ({
    signal: input.signal,
    deadlineMs: Math.min(WEB_REFERENCE_DEFAULTS.fetchDeadlineMs, remainingMs()),
    maxBytes: WEB_REFERENCE_DEFAULTS.maxBytesPerDocument,
    userAgent: WEB_REFERENCE_USER_AGENT,
    ...(accept ? { accept } : {}),
  });

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
      result = await fetchPage(url, acceptLanguage, fetchOptions());
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

    try {
      pages.push(extractWebPageDigest(result.html, { url: result.url, requestedUrl: url, status: result.status }));
    } catch (error) {
      // A page that defeats the digest is reported, never a thrown chat request (and never a stuck spinner).
      logger.warn('web reference digest threw', { url, error: (error as Error)?.message });
      errors.push({ url, code: 'DIGEST_FAILED' });
    }
  };

  // 1. The URLs the user wrote.
  for (const url of explicitUrls) {
    await fetchOne(url);
  }

  // 2. Clone intent: follow the first page's same-site navigation — under robots.txt.
  if (request.cloneIntent && input.crawl !== false && pages.length > 0 && pages.length < maxPages) {
    const frontier = [...pages[0].links];

    let robotsRules = parseRobotsTxt('');

    if (input.robots !== false && frontier.length > 0 && !outOfBudget()) {
      try {
        const robotsUrl = new URL('/robots.txt', pages[0].url).toString();
        const result = await fetchPage(robotsUrl, acceptLanguage, fetchOptions('text/plain,*/*;q=0.1'));

        if (result.ok && result.status >= 200 && result.status < 300) {
          robotsRules = parseRobotsTxt(result.html.slice(0, 200_000));
        }
      } catch (error) {
        logger.warn('robots.txt fetch threw; crawling as allowed', { error: (error as Error)?.message });
      }
    }

    for (const link of frontier) {
      if (pages.length >= maxPages || outOfBudget()) {
        break;
      }

      if (!isAllowedByRobots(robotsRules, link)) {
        errors.push({ url: link, code: 'ROBOTS_DISALLOWED' });
        continue;
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
        const result = await fetchPage(sheet, acceptLanguage, fetchOptions(WEB_REFERENCE_DEFAULTS.stylesheetAccept));

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

/*
 * Follow-up turns: « reprends les couleurs de l'original », « ajoute la page
 * Contact comme sur le site » name no URL. When the message refers to THE site,
 * the most recent earlier user message that named one supplies the URLs — read
 * again, explicit pages only (no crawl), so the reference is not lost after the
 * first turn.
 */
const SITE_REFERENCE_RE =
  /\b(le site|du site|ce site|au site|sur le site|l'original|de l'original|comme sur|the site|the website|the original|that site|this site|from the site)\b/iu;

export const WEB_REFERENCE_LOOKBACK_MESSAGES = 10;

export function resolveReferenceText(
  messages: ReadonlyArray<Omit<Message, 'id'> | Message>,
  lookback: number = WEB_REFERENCE_LOOKBACK_MESSAGES,
): { text: string; lookedBack: boolean } {
  const text = lastUserMessageText(messages);

  if (detectWebReferenceRequest(text).urls.length > 0 || !SITE_REFERENCE_RE.test(text)) {
    return { text, lookedBack: false };
  }

  const earlierUsers = messages
    .filter((message) => message.role === 'user')
    .slice(0, -1)
    .reverse()
    .slice(0, lookback);

  for (const earlier of earlierUsers) {
    const { urls } = detectWebReferenceRequest(extractPropertiesFromMessage(earlier).content);

    if (urls.length > 0) {
      return { text: `${text}\n${urls.join(' ')}`, lookedBack: true };
    }
  }

  return { text, lookedBack: false };
}

/**
 * Chat-route entry point: resolve the web reference for THIS turn from the
 * conversation. Build and discuss modes; never throws.
 */
export async function resolveWebReferenceForTurn(input: {
  messages: ReadonlyArray<Omit<Message, 'id'> | Message>;
  chatMode?: string;
  language?: string | null;
  signal?: AbortSignal;
  fetchPage?: SafeFetch;
  onStart?: CollectWebReferenceInput['onStart'];
}): Promise<WebReferenceResult | undefined> {
  // Build AND discuss (Ask/Plan « analyse ce site ») — both prompts carry the honesty rule.
  if (input.chatMode !== 'build' && input.chatMode !== 'discuss') {
    return undefined;
  }

  const { text, lookedBack } = resolveReferenceText(input.messages);

  /*
   * The detector IS the fast path (regex, returns urls: [] when nothing is named);
   * a looser pre-filter here silently dropped « Clone volt-watt.com, avec toutes les pages ».
   */
  if (!text || detectWebReferenceRequest(text).urls.length === 0) {
    return undefined;
  }

  try {
    return await collectWebReference({
      text,
      crawl: !lookedBack,
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
