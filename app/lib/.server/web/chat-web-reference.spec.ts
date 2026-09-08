import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireWebReferenceSlot,
  describeWebReferenceError,
  prepareWebReferenceForChat,
  resetWebReferenceRateLimiter,
  WEB_REFERENCE_RATE_LIMIT,
} from './chat-web-reference';
import type { SafeFetch } from './safe-fetch';
import type { ProgressAnnotation } from '~/types/context';

/*
 * BUG-AGENT-WEBCLONE-001 — pins the chat-route contract that api.chat.ts
 * delegates to prepareWebReferenceForChat: progress annotations (a spinner is
 * NEVER left in-progress), the block reaching the lanes' messages and the
 * generating model's context, and the zero-cost path when no URL is named.
 */

const html = (title: string, body = '') =>
  `<html><head><title>${title}</title><link rel="stylesheet" href="/a.css"></head><body><h1>${title}</h1>${body}</body></html>`;

const okSite: SafeFetch = async (url) => {
  if (url.endsWith('.css')) {
    return { ok: true, url, status: 200, statusText: 'OK', contentType: 'text/css', html: 'h1{color:#123456}' };
  }

  return { ok: true, url, status: 200, statusText: 'OK', contentType: 'text/html', html: html('Volt-Watt') };
};

const deadSite: SafeFetch = async () => ({ ok: false, status: 504, code: 'TIMEOUT' });

function harness() {
  const written: ProgressAnnotation[] = [];

  let counter = 7;

  return {
    written,
    dataStream: { writeData: (value: ProgressAnnotation) => void written.push(value) },
    nextProgressOrder: () => counter++,
    counter: () => counter,
  };
}

describe('prepareWebReferenceForChat', () => {
  beforeEach(() => resetWebReferenceRateLimiter());

  it('no rateLimitKey (no project → no quota gate) → never fetches, even with a URL and clone intent', async () => {
    const h = harness();

    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return okSite(url, lang, options);
    };

    const out = await prepareWebReferenceForChat({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com' }],
      chatMode: 'build',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      fetchPage: counting,
    });

    expect(fetched).toBe(0);
    expect(h.written).toEqual([]);
    expect(out.webReferenceContext).toBeUndefined();
  });

  it('rate limit: a slot is taken per message WITH a URL only; beyond the ceiling nothing is fetched and the block says RATE_LIMITED', async () => {
    const h = harness();

    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return okSite(url, lang, options);
    };

    const base = {
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-rl',
      fetchPage: counting,
    } as const;

    // Messages without a URL never consume a slot.
    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections * 2; i++) {
      await prepareWebReferenceForChat({ ...base, messages: [{ role: 'user', content: 'sans url' }] });
    }

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i++) {
      const out = await prepareWebReferenceForChat({
        ...base,
        messages: [{ role: 'user', content: `clone https://volt-watt.com/p${i}` }],
      });
      expect(out.webReference?.pages).toHaveLength(1);
    }

    const fetchedBefore = fetched;

    const limited = await prepareWebReferenceForChat({
      ...base,
      messages: [{ role: 'user', content: 'clone https://volt-watt.com/fresh' }],
    });

    expect(fetched).toBe(fetchedBefore);
    expect(limited.webReference?.errors).toEqual([{ url: 'https://volt-watt.com/fresh', code: 'RATE_LIMITED' }]);
    expect(limited.webReferenceContext).toContain('RATE_LIMITED');
    expect(limited.messagesForAgents[0].content).toContain('RATE_LIMITED');

    const last = h.written.slice(-2);

    expect(last.map((a) => a.status)).toEqual(['in-progress', 'complete']);
    expect(last[1].message).toBe('volt-watt.com inaccessible : trop de lectures de sites ces 10 dernières minutes');
  });

  it('memo: the same URLs within 10 minutes are served from memory — no fetch, no slot, same annotations', async () => {
    const h = harness();

    let fetched = 0;

    const counting: SafeFetch = async (url, lang, options) => {
      fetched += 1;

      return okSite(url, lang, options);
    };
    const base = {
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-memo',
      fetchPage: counting,
    } as const;

    const first = await prepareWebReferenceForChat({
      ...base,
      messages: [{ role: 'user', content: 'clone https://volt-watt.com' }],
    });

    const afterFirst = fetched;

    const second = await prepareWebReferenceForChat({
      ...base,
      messages: [{ role: 'user', content: 'refais https://volt-watt.com en clone' }],
    });

    expect(afterFirst).toBeGreaterThan(0);
    expect(fetched).toBe(afterFirst);
    expect(second.webReferenceContext).toBe(first.webReferenceContext);
    expect(h.written.map((a) => a.status)).toEqual(['in-progress', 'complete', 'in-progress', 'complete']);
  });

  it('follow-up turn: « comme sur le site » without a URL reads the earlier URL again (pages only, no crawl)', async () => {
    const h = harness();
    const seen: string[] = [];

    const spy: SafeFetch = async (url, lang, options) => {
      seen.push(url);

      return okSite(url, lang, options);
    };

    const out = await prepareWebReferenceForChat({
      messages: [
        { role: 'user', content: 'clone https://volt-watt.com' },
        { role: 'assistant', content: '<boltArtifact>…</boltArtifact>' },
        { role: 'user', content: 'ajoute la page Contact comme sur le site' },
      ],
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-followup',
      fetchPage: spy,
    });

    expect(seen).toContain('https://volt-watt.com/');
    expect(seen.some((url) => url.endsWith('/robots.txt'))).toBe(false); // no crawl on look-back
    expect(out.webReferenceContext).toContain('<web_reference');
    expect(out.messagesForAgents[2].content).toContain('<web_reference');
  });

  it('no URL → no annotation, no order consumed, messages returned as-is, no context', async () => {
    const h = harness();
    const messages = [{ role: 'user' as const, content: 'fais une todo list' }];

    const out = await prepareWebReferenceForChat({
      messages,
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      fetchPage: okSite,
    });

    expect(h.written).toEqual([]);
    expect(h.counter()).toBe(7);
    expect(out.messagesForAgents).toBe(messages);
    expect(out.webReferenceContext).toBeUndefined();
    expect(out.webReference).toBeUndefined();
  });

  it('discuss mode (Ask/Plan) fetches too; an unknown mode never does', async () => {
    const h = harness();

    const discuss = await prepareWebReferenceForChat({
      messages: [{ role: 'user', content: 'analyse https://volt-watt.com et propose un plan' }],
      chatMode: 'discuss',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      fetchPage: okSite,
    });

    expect(h.written.map((a) => a.status)).toEqual(['in-progress', 'complete']);
    expect(discuss.webReferenceContext).toContain('<web_reference');

    const other = await prepareWebReferenceForChat({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com' }],
      chatMode: 'other',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      fetchPage: okSite,
    });

    expect(h.written).toHaveLength(2);
    expect(other.webReferenceContext).toBeUndefined();
  });

  it('URL read: in-progress then complete with the SAME order, French copy, block to lanes AND context', async () => {
    const h = harness();

    const messages = [
      { role: 'user' as const, content: 'bonjour' },
      { role: 'assistant' as const, content: 'ok' },
      { role: 'user' as const, content: '[Model: m]\n\n[Provider: p]\n\nClone le site https://volt-watt.com' },
    ];

    const out = await prepareWebReferenceForChat({
      messages,
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      fetchPage: okSite,
    });

    expect(h.written).toHaveLength(2);
    expect(h.written[0]).toMatchObject({
      type: 'progress',
      label: 'web-reference',
      status: 'in-progress',
      order: 7,
      message: 'Lecture de volt-watt.com',
    });
    expect(h.written[1]).toMatchObject({
      type: 'progress',
      label: 'web-reference',
      status: 'complete',
      order: 7,
      message: 'volt-watt.com lu : 1 page(s), 1 feuille(s) de style',
    });
    expect(h.counter()).toBe(8);
    expect(out.webReferenceContextForContinuation).toContain('h1: Volt-Watt');
    expect(out.webReferenceContextForContinuation).not.toContain('<inline_css>');

    expect(out.webReference?.pages[0].title).toBe('Volt-Watt');
    expect(out.webReferenceContext).toContain('<web_reference');
    expect(out.webReferenceContext).toContain('h1: Volt-Watt');
    expect(out.webReferenceContext).toContain('#123456');

    // Lanes/planner: appended to the LAST user message only; input not mutated.
    expect(out.messagesForAgents[2].content).toContain(out.webReferenceContext);
    expect(out.messagesForAgents[0].content).toBe('bonjour');
    expect(messages[2].content).not.toContain('<web_reference');
  });

  it('unreachable site: complete annotation says so (English copy), no context, messages untouched', async () => {
    const h = harness();
    const messages = [{ role: 'user' as const, content: 'clone https://volt-watt.com' }];

    const out = await prepareWebReferenceForChat({
      messages,
      chatMode: 'build',
      language: 'en',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      fetchPage: deadSite,
    });

    expect(h.written.map((a) => [a.status, a.order, a.message])).toEqual([
      ['in-progress', 7, 'Reading volt-watt.com'],
      ['complete', 7, 'Could not read volt-watt.com: The request timed out after 10 seconds.'],
    ]);

    // The block still exists (errors only) so the model can say the site was unreachable…
    expect(out.webReferenceContext).toContain('<errors>');
    expect(out.webReferenceContext).toContain('TIMEOUT');

    // …and it is what the lanes receive too.
    expect(out.messagesForAgents[0].content).toContain('<errors>');
  });

  it('never leaves the spinner in-progress: resolver announces then dies → complete is still written', async () => {
    const h = harness();

    const out = await prepareWebReferenceForChat({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com' }],
      chatMode: 'build',
      language: 'fr',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      resolve: async (input) => {
        input.onStart?.({ urls: ['https://volt-watt.com/'], cloneIntent: true, host: 'volt-watt.com' });
        throw new Error('boom');
      },
    });

    expect(h.written.map((a) => [a.status, a.order])).toEqual([
      ['in-progress', 7],
      ['complete', 7],
    ]);
    expect(h.written[1].message).toBe(
      'volt-watt.com inaccessible : L’URL n’a pas pu être chargée. Veuillez réessayer.',
    );
    expect(out.webReferenceContext).toBeUndefined();
  });

  it('resolver announces then returns undefined → complete is still written', async () => {
    const h = harness();

    await prepareWebReferenceForChat({
      messages: [{ role: 'user', content: 'clone https://volt-watt.com' }],
      chatMode: 'build',
      dataStream: h.dataStream,
      nextProgressOrder: h.nextProgressOrder,
      rateLimitKey: 'proj-1',
      resolve: async (input) => {
        input.onStart?.({ urls: ['https://volt-watt.com/'], cloneIntent: true, host: 'volt-watt.com' });

        return undefined;
      },
    });

    expect(h.written.map((a) => a.status)).toEqual(['in-progress', 'complete']);
  });
});

describe('acquireWebReferenceSlot', () => {
  beforeEach(() => resetWebReferenceRateLimiter());

  it('is a sliding window per key', () => {
    const t0 = 1_000_000;

    for (let i = 0; i < WEB_REFERENCE_RATE_LIMIT.maxCollections; i++) {
      expect(acquireWebReferenceSlot('a', t0 + i)).toBe(true);
    }

    expect(acquireWebReferenceSlot('a', t0 + 100)).toBe(false);
    expect(acquireWebReferenceSlot('b', t0 + 100)).toBe(true); // other tenant unaffected
    expect(acquireWebReferenceSlot('a', t0 + WEB_REFERENCE_RATE_LIMIT.windowMs + 1)).toBe(true); // window slid
  });
});

describe('describeWebReferenceError', () => {
  it('maps every code to a human reason in the user language, never a raw enum', () => {
    expect(describeWebReferenceError('TIMEOUT', 'fr')).toBe('La requête a expiré après 10 secondes.');
    expect(describeWebReferenceError('HTTP_403', 'en')).toBe('The URL returned an unsuccessful response (403).');
    expect(describeWebReferenceError('ROBOTS_DISALLOWED', 'fr')).toBe('le robots.txt du site l’interdit');
    expect(describeWebReferenceError('RATE_LIMITED', 'en')).toBe('too many site reads in the last 10 minutes');
    expect(describeWebReferenceError('WHATEVER', 'en')).toBe('unknown error (WHATEVER)');
  });
});
