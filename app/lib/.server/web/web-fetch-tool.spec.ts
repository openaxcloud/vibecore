import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWebReferenceRateLimiter, WEB_REFERENCE_RATE_LIMIT } from './chat-web-reference';
import type { SafeFetch } from './safe-fetch';
import {
  createWebFetchTool,
  executeWebFetch,
  isWebFetchToolEnabled,
  WEB_FETCH_TOOL_NAME,
  WEB_FETCH_TOOL_PARAMETERS,
  webFetchToolSet,
} from './web-fetch-tool';

/*
 * RP-WEB-03 — the model-callable page reader. Same guards as the automatic
 * reference; registered only behind the flag AND on a project.
 */

const page = (title: string, links = ''): string =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1>${links}</body></html>`;

const site: SafeFetch = async (url) => {
  const routes: Record<string, string> = {
    'https://volt-watt.com/': page('Accueil', '<a href="/tarifs">Tarifs</a><a href="/contact">Contact</a>'),
    'https://volt-watt.com/tarifs': page('Tarifs'),
    'https://volt-watt.com/contact': page('Contact'),
  };

  const html = routes[url];

  if (!html) {
    return { ok: false, status: 502, code: 'FETCH_FAILED' };
  }

  return { ok: true, url, status: 200, statusText: 'OK', contentType: 'text/html', html };
};

describe('isWebFetchToolEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is OFF unless the flag is exactly 1/true', () => {
    vi.stubEnv('ECODE_WEB_FETCH_TOOL_ENABLED', '');
    expect(isWebFetchToolEnabled()).toBe(false);
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: 'yes' })).toBe(false);
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: '1' })).toBe(true);
    expect(isWebFetchToolEnabled({ ECODE_WEB_FETCH_TOOL_ENABLED: 'true' })).toBe(true);
  });
});

describe('webFetchToolSet', () => {
  it('is empty without the flag or without a project, and holds fetch_web_page otherwise', () => {
    expect(webFetchToolSet({ env: {}, rateLimitKey: 'p' })).toEqual({});
    expect(webFetchToolSet({ env: { ECODE_WEB_FETCH_TOOL_ENABLED: '1' } })).toEqual({});

    const set = webFetchToolSet({ env: { ECODE_WEB_FETCH_TOOL_ENABLED: '1' }, rateLimitKey: 'p' });

    expect(Object.keys(set)).toEqual([WEB_FETCH_TOOL_NAME]);
    expect(typeof set[WEB_FETCH_TOOL_NAME].execute).toBe('function');
  });

  it('validates its parameters: absolute URL required', () => {
    expect(WEB_FETCH_TOOL_PARAMETERS.safeParse({ url: 'https://a.io/' }).success).toBe(true);
    expect(WEB_FETCH_TOOL_PARAMETERS.safeParse({ url: 'a.io' }).success).toBe(false);
    expect(WEB_FETCH_TOOL_PARAMETERS.safeParse({ url: 'https://a.io/', follow_links: true }).success).toBe(true);
  });
});

describe('executeWebFetch', () => {
  beforeEach(() => resetWebReferenceRateLimiter());

  it('reads one page by default and returns the observed block', async () => {
    const seen: string[] = [];

    const spy: SafeFetch = async (url, lang, options) => {
      seen.push(url);

      return site(url, lang, options);
    };

    const block = await executeWebFetch({ rateLimitKey: 'p1', fetchPage: spy }, { url: 'https://volt-watt.com/' });

    expect(block).toContain('<web_reference');
    expect(block).toContain('h1: Accueil');
    expect(block).toContain('third-party DATA');
    expect(seen).toEqual(['https://volt-watt.com/']);
  });

  it('follow_links reads same-site pages too (robots.txt consulted, budget 4)', async () => {
    const seen: string[] = [];

    const spy: SafeFetch = async (url, lang, options) => {
      seen.push(url);

      return site(url, lang, options);
    };

    const block = await executeWebFetch(
      { rateLimitKey: 'p2', fetchPage: spy },
      { url: 'https://volt-watt.com/', follow_links: true },
    );

    expect(seen).toContain('https://volt-watt.com/robots.txt');
    expect(seen).toContain('https://volt-watt.com/tarifs');
    expect(block).toContain('h1: Tarifs');
    expect(block).toContain('h1: Contact');
  });

  it('refuses platform / code hosts and reports failures as blocks, never throws', async () => {
    const refused = await executeWebFetch({ rateLimitKey: 'p3', fetchPage: site }, { url: 'https://github.com/x/y' });

    expect(refused).toContain('URL_NOT_ALLOWED');

    const dead = await executeWebFetch({ rateLimitKey: 'p3', fetchPage: site }, { url: 'https://nowhere.example/' });

    expect(dead).toContain('FETCH_FAILED');

    const boom: SafeFetch = () => {
      throw new TypeError('unexpected');
    };

    const thrown = await executeWebFetch({ rateLimitKey: 'p3', fetchPage: boom }, { url: 'https://volt-watt.com/' });

    expect(thrown).toContain('<errors>');
  });

  it('shares the per-project rate limit with the automatic reference', async () => {
    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return site(url, lang, options);
    };

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i++) {
      await executeWebFetch({ rateLimitKey: 'p4', fetchPage: counting }, { url: 'https://volt-watt.com/' });
    }

    const before = fetched;

    const limited = await executeWebFetch(
      { rateLimitKey: 'p4', fetchPage: counting },
      { url: 'https://volt-watt.com/' },
    );

    expect(fetched).toBe(before);
    expect(limited).toContain('RATE_LIMITED');
  });

  it('the AI SDK tool wrapper executes through the same path', async () => {
    const t = createWebFetchTool({ rateLimitKey: 'p5', fetchPage: site });
    const out = await t.execute!({ url: 'https://volt-watt.com/contact' }, { toolCallId: 'c1', messages: [] });

    expect(out).toContain('h1: Contact');
  });
});
