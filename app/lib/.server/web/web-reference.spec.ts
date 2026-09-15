import { describe, expect, it, vi } from 'vitest';
import type { SafeFetch, SafeFetchResult } from './safe-fetch';
import {
  collectWebReference,
  lastUserMessageText,
  resolveReferenceText,
  resolveWebReferenceForTurn,
  WEB_REFERENCE_DEFAULTS,
  WEB_REFERENCE_USER_AGENT,
} from './web-reference';

/*
 * BUG-AGENT-WEBCLONE-001 — the server half: given a message naming a URL, the
 * site is fetched (through the injected guard), crawled on a clone request
 * within a page + time budget, its stylesheets read for palette, and every
 * failure reported in the block instead of thrown.
 */

const page = (title: string, body: string, extraHead = ''): SafeFetchResult => ({
  ok: true,
  url: '',
  status: 200,
  statusText: 'OK',
  contentType: 'text/html; charset=utf-8',
  html: `<html><head><title>${title}</title>${extraHead}</head><body>${body}</body></html>`,
});

function fakeSite(): { fetchPage: SafeFetch; calls: string[] } {
  const calls: string[] = [];

  const routes: Record<string, SafeFetchResult> = {
    'https://volt-watt.com/': page(
      'Accueil',
      '<nav><a href="/solutions">Solutions</a><a href="/simulateur">Simulateur</a><a href="/tarifs">Tarifs</a><a href="/contact">Contact</a><a href="/blog">Blog</a><a href="/a-propos">À propos</a><a href="/mentions">Mentions</a></nav><h1>Passez au solaire</h1>',
      '<link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/third.css">',
    ),
    'https://volt-watt.com/solutions': page('Solutions', '<h1>Nos solutions</h1>'),
    'https://volt-watt.com/simulateur': page('Simulateur', '<h1>Simulez</h1>'),
    'https://volt-watt.com/tarifs': { ok: false, status: 504, code: 'TIMEOUT' },
    'https://volt-watt.com/contact': page('Contact', '<h1>Contact</h1>'),
    'https://volt-watt.com/blog': page('Blog', '<h1>Blog</h1>'),
    'https://volt-watt.com/a-propos': page('À propos', '<h1>Équipe</h1>'),
    'https://volt-watt.com/mentions': page('Mentions', '<h1>Mentions</h1>'),
    'https://volt-watt.com/app.css': {
      ok: true,
      url: 'https://volt-watt.com/app.css',
      status: 200,
      statusText: 'OK',
      contentType: 'text/css',
      html: '.btn{background:#0f9d58;color:#fff;font-family:"Inter",sans-serif}',
    },
    'https://volt-watt.com/theme.css': {
      ok: true,
      url: 'https://volt-watt.com/theme.css',
      status: 200,
      statusText: 'OK',
      contentType: 'text/css',
      html: 'h1{color:#0f9d58;font-family:"Poppins"}',
    },
  };

  const fetchPage: SafeFetch = async (url) => {
    calls.push(url);

    const hit = routes[url];

    if (!hit) {
      return { ok: false, status: 502, code: 'FETCH_FAILED' };
    }

    return hit.ok ? { ...hit, url } : hit;
  };

  return { fetchPage, calls };
}

describe('collectWebReference', () => {
  it('returns undefined — and fetches nothing — when the message names no URL', async () => {
    const { fetchPage, calls } = fakeSite();

    expect(await collectWebReference({ text: 'fais-moi une todo list', fetchPage })).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('without clone intent reads ONE page (+ its stylesheets), never the navigation', async () => {
    const { fetchPage, calls } = fakeSite();
    const result = await collectWebReference({ text: 'Résume https://volt-watt.com/', fetchPage });

    expect(result?.cloneIntent).toBe(false);
    expect(result?.pages.map((p) => p.title)).toEqual(['Accueil']);
    expect(calls).toEqual([
      'https://volt-watt.com/',
      'https://volt-watt.com/app.css',
      'https://volt-watt.com/theme.css',
    ]);
  });

  it('with clone intent crawls the same-site navigation up to the page budget, records failures, reads 2 stylesheets', async () => {
    const { fetchPage, calls } = fakeSite();
    const onStart = vi.fn();

    const result = await collectWebReference({
      text: 'Clone le site https://volt-watt.com/ avec toutes ses pages',
      fetchPage,
      maxPages: 5,
      onStart,
      fetchedAt: new Date('2026-09-08T08:39:00Z'),
    });

    expect(onStart).toHaveBeenCalledWith({
      urls: ['https://volt-watt.com/'],
      cloneIntent: true,
      host: 'volt-watt.com',
    });
    expect(result?.cloneIntent).toBe(true);
    expect(result?.host).toBe('volt-watt.com');

    // 1 explicit + 4 crawled = budget 5; /tarifs failed and is NOT a page.
    expect(result?.pages.map((p) => p.title)).toEqual(['Accueil', 'Solutions', 'Simulateur', 'Contact', 'Blog']);
    expect(result?.errors).toEqual([{ url: 'https://volt-watt.com/tarifs', code: 'TIMEOUT' }]);
    expect(calls).not.toContain('https://volt-watt.com/a-propos');

    // Stylesheets: capped at 2 of the 3 declared; palette merged into page 1.
    expect(result?.stylesheetsRead).toBe(2);
    expect(calls).not.toContain('https://volt-watt.com/third.css');
    expect(result?.pages[0].colors).toContain('#0f9d58');
    expect(result?.pages[0].fonts).toEqual(['Inter', 'Poppins']);

    expect(result?.block).toContain('intent="clone"');
    expect(result?.block).toContain('pages="5"');
    expect(result?.block).toContain('https://volt-watt.com/tarifs — TIMEOUT');
  });

  it('reports an unreachable site in the block rather than throwing or returning undefined', async () => {
    const fetchPage: SafeFetch = async () => ({ ok: false, status: 400, code: 'INTERNAL_ADDRESS' });
    const result = await collectWebReference({ text: 'clone https://10.0.0.1/', fetchPage });

    expect(result?.pages).toEqual([]);
    expect(result?.errors).toEqual([{ url: 'https://10.0.0.1/', code: 'INTERNAL_ADDRESS' }]);
    expect(result?.block).toContain('<errors>');
    expect(result?.host).toBe('10.0.0.1');
  });

  it('turns a thrown fetch into FETCH_FAILED and a non-2xx into HTTP_<status>, skips non-HTML', async () => {
    const fetchPage: SafeFetch = async (url) => {
      if (url.endsWith('/boom')) {
        throw new Error('socket hang up');
      }

      if (url.endsWith('/gone')) {
        return { ok: true, url, status: 410, statusText: 'Gone', contentType: 'text/html', html: '' };
      }

      return { ok: true, url, status: 200, statusText: 'OK', contentType: 'application/pdf', html: '%PDF' };
    };

    const result = await collectWebReference({
      text: 'https://a.io/boom https://a.io/gone https://a.io/doc',
      fetchPage,
      maxPages: 3,
      maxExplicitUrls: 3,
    });

    expect(result?.errors).toEqual([
      { url: 'https://a.io/boom', code: 'FETCH_FAILED' },
      { url: 'https://a.io/gone', code: 'HTTP_410' },
      { url: 'https://a.io/doc', code: 'UNSUPPORTED_CONTENT_TYPE' },
    ]);
  });

  it('stops crawling once the time budget is spent', async () => {
    const { fetchPage, calls } = fakeSite();

    let clock = 0;

    const now = () => clock;

    const timedFetch: SafeFetch = async (url, lang) => {
      clock += 4_000;

      return fetchPage(url, lang);
    };

    const result = await collectWebReference({
      text: 'clone https://volt-watt.com/',
      fetchPage: timedFetch,
      now,
      timeBudgetMs: 10_000,
      maxPages: 6,
    });

    // 3 fetches × 4 s: home (4 s), /solutions (8 s), /simulateur (12 s → over budget afterwards).
    expect(result?.pages.length).toBeLessThan(6);
    expect(calls.length).toBeLessThan(8);
    expect(result?.block).toContain('<web_reference');
  });

  it('honours an already-aborted signal without fetching', async () => {
    const { fetchPage, calls } = fakeSite();
    const controller = new AbortController();
    controller.abort();

    const result = await collectWebReference({
      text: 'clone https://volt-watt.com/',
      fetchPage,
      signal: controller.signal,
    });

    expect(calls).toEqual([]);
    expect(result?.errors).toEqual([{ url: 'https://volt-watt.com/', code: 'TIME_BUDGET_EXCEEDED' }]);
  });
});

describe('collectWebReference — explicit URLs, deadlines, digest failures', () => {
  it('reads EVERY explicit URL (up to 3) even without clone intent, and only crawls on clone intent', async () => {
    const { fetchPage, calls } = fakeSite();

    const result = await collectWebReference({
      text: 'utilise la page https://volt-watt.com/ et la page https://volt-watt.com/contact',
      fetchPage,
      maxStylesheets: 0,
    });

    expect(result?.cloneIntent).toBe(false);
    expect(result?.pages.map((p) => p.title)).toEqual(['Accueil', 'Contact']);
    expect(calls).toEqual(['https://volt-watt.com/', 'https://volt-watt.com/contact']);
  });

  it('passes a hard per-fetch deadline bounded by the remaining budget, the caller signal and a 2 MB cap', async () => {
    const seen: Array<{ url: string; options?: Parameters<SafeFetch>[2] }> = [];

    let clock = 0;

    const controller = new AbortController();

    const fetchPage: SafeFetch = async (url, _lang, options) => {
      seen.push({ url, options });
      clock += 6_000;

      return page('X', '<a href="/next">n</a>')
        ? { ...page('X', '<a href="/next">n</a>'), url }
        : { ok: false, status: 502, code: 'FETCH_FAILED' };
    };

    await collectWebReference({
      text: 'clone https://a.io/',
      fetchPage,
      now: () => clock,
      timeBudgetMs: 10_000,
      maxStylesheets: 0,
      signal: controller.signal,
    });

    expect(seen[0].options?.deadlineMs).toBe(10_000); // min(fetchDeadlineMs=10 000, remaining=10 000)
    expect(seen[0].options?.maxBytes).toBe(2 * 1024 * 1024);
    expect(seen[0].options?.signal).toBe(controller.signal);
    expect(seen[1].options?.deadlineMs).toBe(4_000); // remaining budget after the first 6 s
  });

  it('stylesheets are requested with a CSS Accept header', async () => {
    const { fetchPage } = fakeSite();
    const seen: Array<Parameters<SafeFetch>> = [];

    const spy: SafeFetch = (...args) => {
      seen.push(args);

      return fetchPage(...args);
    };

    await collectWebReference({ text: 'https://volt-watt.com/', fetchPage: spy });

    const css = seen.find(([url]) => url.endsWith('.css'));

    expect(css?.[2]?.accept).toBe('text/css,*/*;q=0.1');
    expect(seen[0][2]?.accept).toBeUndefined();
  });

  it('an out-of-range numeric entity in the page is not fatal (it used to throw inside the digest)', async () => {
    const fetchPage: SafeFetch = async (url) => ({
      ok: true,
      url,
      status: 200,
      statusText: 'OK',
      contentType: 'text/html',
      html: '<html><head><title>T &#x110000; &#99999999999; &#xD800;</title></head><body><h1>ok</h1></body></html>',
    });

    const result = await collectWebReference({ text: 'clone https://a.io/', fetchPage, maxStylesheets: 0 });

    expect(result?.errors).toEqual([]);
    expect(result?.pages[0].title).toBe('T &#x110000; &#99999999999; &#xD800;');
  });

  it('an http:// URL is fetched over https (port 80 is blocked in production)', async () => {
    const { fetchPage, calls } = fakeSite();

    await collectWebReference({ text: 'regarde http://volt-watt.com/', fetchPage, maxStylesheets: 0 });

    expect(calls).toEqual(['https://volt-watt.com/']);
  });
});

describe('collectWebReference — defaults', () => {
  it('pins the default crawl budget: 6 pages, 2 stylesheets, 20 s (no overrides)', async () => {
    const { fetchPage, calls } = fakeSite();
    const result = await collectWebReference({ text: 'clone https://volt-watt.com/', fetchPage });

    expect(WEB_REFERENCE_DEFAULTS.maxPages).toBe(6);
    expect(WEB_REFERENCE_DEFAULTS.maxStylesheets).toBe(2);
    expect(WEB_REFERENCE_DEFAULTS.timeBudgetMs).toBe(20_000);
    expect(result?.pages).toHaveLength(6);
    expect(calls.filter((url) => url.endsWith('.css'))).toHaveLength(2);
    expect(calls).not.toContain('https://volt-watt.com/mentions'); // 7th navigation entry, beyond the budget
  });

  it('a bare domain followed by a comma is still read (the old pre-filter dropped it)', async () => {
    const { fetchPage } = fakeSite();

    const result = await resolveWebReferenceForTurn({
      messages: [{ role: 'user', content: 'Clone volt-watt.com, avec toutes les pages' }],
      chatMode: 'build',
      fetchPage,
    });

    expect(result?.pages.length).toBeGreaterThan(0);
  });
});

describe('collectWebReference — crawl etiquette', () => {
  it('honours robots.txt for crawled pages only, identifies itself, and never crawls with crawl=false', async () => {
    const { fetchPage } = fakeSite();
    const calls: string[] = [];
    const seenAgents = new Set<string | undefined>();

    const withRobots: SafeFetch = async (url, lang, options) => {
      calls.push(url);
      seenAgents.add(options?.userAgent);

      if (url === 'https://volt-watt.com/robots.txt') {
        return {
          ok: true,
          url,
          status: 200,
          statusText: 'OK',
          contentType: 'text/plain',
          html: 'User-agent: *\nDisallow: /blog\nDisallow: /simulateur',
        };
      }

      return fetchPage(url, lang, options);
    };

    const result = await collectWebReference({
      text: 'clone https://volt-watt.com/',
      fetchPage: withRobots,
      maxPages: 4,
      maxStylesheets: 0,
    });

    expect(calls).toContain('https://volt-watt.com/robots.txt');
    expect(calls).not.toContain('https://volt-watt.com/blog');
    expect(calls).not.toContain('https://volt-watt.com/simulateur');
    expect(result?.pages.map((p) => p.title)).toEqual(['Accueil', 'Solutions', 'Contact', 'À propos']);
    expect(result?.errors).toEqual(
      expect.arrayContaining([
        { url: 'https://volt-watt.com/simulateur', code: 'ROBOTS_DISALLOWED' },
        { url: 'https://volt-watt.com/blog', code: 'ROBOTS_DISALLOWED' },
      ]),
    );
    expect([...seenAgents]).toEqual([WEB_REFERENCE_USER_AGENT]);
    expect(WEB_REFERENCE_USER_AGENT).toContain('E-CodeBot');

    // The user's own URL is fetched even when robots.txt forbids it.
    const { fetchPage: site2, calls: calls2 } = fakeSite();

    const forbidAll: SafeFetch = async (url, lang, options) =>
      url.endsWith('/robots.txt')
        ? {
            ok: true,
            url,
            status: 200,
            statusText: 'OK',
            contentType: 'text/plain',
            html: 'User-agent: *\nDisallow: /',
          }
        : site2(url, lang, options);

    const own = await collectWebReference({
      text: 'clone https://volt-watt.com/',
      fetchPage: forbidAll,
      maxStylesheets: 0,
    });

    expect(own?.pages.map((p) => p.title)).toEqual(['Accueil']);
    expect(calls2.filter((u) => !u.endsWith('robots.txt'))).toEqual(['https://volt-watt.com/']);

    // crawl=false: explicit page only, no robots.txt either.
    const { fetchPage: site3, calls: calls3 } = fakeSite();
    await collectWebReference({
      text: 'clone https://volt-watt.com/',
      fetchPage: site3,
      crawl: false,
      maxStylesheets: 0,
    });
    expect(calls3).toEqual(['https://volt-watt.com/']);
  });
});

describe('resolveReferenceText', () => {
  it('uses the current message when it names a URL', () => {
    expect(resolveReferenceText([{ role: 'user', content: 'clone https://a.io' }])).toEqual({
      text: 'clone https://a.io',
      lookedBack: false,
    });
  });

  it('looks back to the last user message with a URL when the current one refers to « le site »', () => {
    const messages = [
      { role: 'user' as const, content: 'clone https://a.io' },
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, content: 'ajoute un footer' },
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, content: "[Model: m]\n\nreprends les couleurs de l'original" },
    ];

    expect(resolveReferenceText(messages)).toEqual({
      text: "reprends les couleurs de l'original\nhttps://a.io/",
      lookedBack: true,
    });
  });

  it('does not look back without a site-referring phrase, nor beyond the window', () => {
    const messages = [
      { role: 'user' as const, content: 'clone https://a.io' },
      { role: 'user' as const, content: 'ajoute un footer' },
    ];

    expect(resolveReferenceText(messages).lookedBack).toBe(false);

    const far = [
      { role: 'user' as const, content: 'clone https://a.io' },
      ...Array.from({ length: 10 }, () => ({ role: 'user' as const, content: 'x' })),
      { role: 'user' as const, content: 'comme sur le site' },
    ];

    expect(resolveReferenceText(far, 10).lookedBack).toBe(false);
    expect(resolveReferenceText(far, 11).lookedBack).toBe(true);
  });
});

describe('lastUserMessageText', () => {
  it('strips the [Model:]/[Provider:] tags and picks the LAST user message', () => {
    const text = lastUserMessageText([
      { role: 'user', content: '[Model: x]\n\n[Provider: y]\n\nfirst' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: '[Model: x]\n\n[Provider: y]\n\nclone https://a.io' },
    ]);

    expect(text).toBe('clone https://a.io');
  });
});

describe('resolveWebReferenceForTurn', () => {
  it('runs for build and discuss (Ask/Plan « analyse ce site ») and for nothing else', async () => {
    const { fetchPage, calls } = fakeSite();
    const messages = [{ role: 'user' as const, content: 'clone https://volt-watt.com/' }];

    expect(await resolveWebReferenceForTurn({ messages, chatMode: 'other', fetchPage })).toBeUndefined();
    expect(await resolveWebReferenceForTurn({ messages, chatMode: undefined, fetchPage })).toBeUndefined();
    expect(calls).toEqual([]);

    const discuss = await resolveWebReferenceForTurn({ messages, chatMode: 'discuss', fetchPage });

    expect(discuss?.pages.map((p) => p.title)).toContain('Accueil');
  });

  it('collects for a build turn and never throws when the collector fails', async () => {
    const { fetchPage } = fakeSite();

    const ok = await resolveWebReferenceForTurn({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com/' }],
      chatMode: 'build',
      fetchPage,
    });

    expect(ok?.pages.length).toBeGreaterThan(0);

    const broken = await resolveWebReferenceForTurn({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com/' }],
      chatMode: 'build',
      fetchPage: (() => {
        throw new TypeError('unexpected');
      }) as unknown as SafeFetch,
    });

    // fetchOne catches per-URL throws → still a result, with the error recorded.
    expect(broken?.errors[0]?.code).toBe('FETCH_FAILED');
  });
});
