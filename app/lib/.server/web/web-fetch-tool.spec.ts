import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireWebReferenceSlot, resetWebReferenceRateLimiter, WEB_REFERENCE_RATE_LIMIT } from './chat-web-reference';
import type { SafeFetch } from './safe-fetch';
import {
  createWebFetchTool,
  executeWebFetch,
  isWebFetchToolEnabled,
  WEB_FETCH_TOOL_NAME,
  WEB_FETCH_TOOL_PARAMETERS,
  webFetchToolSet,
} from './web-fetch-tool';
import {
  acquireSharedWebReferenceSlot,
  WEB_REFERENCE_RATE_LIMIT_PREFIX,
  type WebReferenceRateLimitRedis,
} from './web-reference-rate-limit';

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

/*
 * Le plafond de l'outil doit être le MÊME que celui de la référence automatique,
 * et il doit être PARTAGÉ entre replicas. Mesuré avant correctif : l'outil
 * n'appelait Redis 0 fois — il comptait dans la mémoire du pod, donc un projet
 * disposait de 12 lectures automatiques PLUS 12 lectures par outil, chacune
 * multipliée par le nombre de pods.
 */
describe('executeWebFetch — plafond partagé avec la référence automatique', () => {
  beforeEach(() => resetWebReferenceRateLimiter());

  /** Double de Redis : un ensemble par clé, fenêtre glissante, mêmes arguments. */
  function fakeRedis() {
    const sets = new Map<string, number[]>();
    const keys: string[] = [];

    const redis: WebReferenceRateLimitRedis = {
      async eval(_script, _numKeys, ...args) {
        const [key, now, window, maximum] = args as [string, string, string, string];
        const at = Number(now);

        keys.push(key);

        const kept = (sets.get(key) ?? []).filter((stamp) => stamp > at - Number(window));

        if (kept.length >= Number(maximum)) {
          sets.set(key, kept);

          return [0, kept.length];
        }

        kept.push(at);
        sets.set(key, kept);

        return [1, kept.length];
      },
    };

    return { redis, keys };
  }

  it('compte dans Redis, sous la clé du projet — pas dans la mémoire du pod', async () => {
    const { redis, keys } = fakeRedis();

    await executeWebFetch({ rateLimitKey: 'p6', redis, fetchPage: site }, { url: 'https://volt-watt.com/' });

    expect(keys).toEqual([`${WEB_REFERENCE_RATE_LIMIT_PREFIX}p6`]);

    // Le compteur PAR POD n'a pas bougé : c'est Redis qui a compté.
    expect(acquireWebReferenceSlot('p6')).toBe(true);
  });

  it('un seul budget pour les deux chemins : la référence automatique épuise le plafond de l’outil', async () => {
    const { redis } = fakeRedis();
    const now = 7_000_000;

    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return site(url, lang, options);
    };

    // La référence automatique consomme tout le plafond du projet…
    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      const decision = await acquireSharedWebReferenceSlot({ key: 'p7', redis, now: now + i });

      expect(decision.allowed).toBe(true);
    }

    // …et l'outil n'a plus de place : il ne sort AUCUNE requête.
    const refus = await executeWebFetch(
      { rateLimitKey: 'p7', redis, fetchPage: counting, now: () => now + 50 },
      { url: 'https://volt-watt.com/' },
    );

    expect(refus).toContain('RATE_LIMITED');
    expect(fetched).toBe(0);

    // Un autre projet n'est pas entamé.
    const autre = await executeWebFetch(
      { rateLimitKey: 'p8', redis, fetchPage: counting, now: () => now + 50 },
      { url: 'https://volt-watt.com/' },
    );

    expect(autre).toContain('h1: Accueil');
  });

  it('Redis absent : repli sur le compteur par pod, jamais « autorisé sans compter »', async () => {
    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return site(url, lang, options);
    };

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i += 1) {
      await executeWebFetch(
        { rateLimitKey: 'p9', redis: null, fetchPage: counting },
        { url: 'https://volt-watt.com/' },
      );
    }

    const before = fetched;

    const refus = await executeWebFetch(
      { rateLimitKey: 'p9', redis: null, fetchPage: counting },
      { url: 'https://volt-watt.com/' },
    );

    expect(refus).toContain('RATE_LIMITED');
    expect(fetched).toBe(before);
  });
});
