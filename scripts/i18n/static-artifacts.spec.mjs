import { readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { applyAllowlist, scanHtml } from './source-scanner.mjs';

const activeHtmlSources = [
  'apps/admin/index.html',
  'apps/mobile/index.html',
  'public/offline.html',
  'public/ecode-static/offline.html',
];

const brandAllowlist = {
  schemaVersion: 1,
  entries: [
    {
      id: 'brand',
      path: '**/*',
      rule: '*',
      textPattern: '^(?:E-Code|VibeCore)$',
      justification: 'Brand names are not translated.',
      owner: 'brand-and-i18n',
      expiresOn: '2099-01-01',
    },
  ],
};

async function offlineDom({ language, cookie } = {}) {
  const [html, catalog, runtime] = await Promise.all([
    readFile('public/offline.html', 'utf8'),
    readFile('public/offline-messages.js', 'utf8'),
    readFile('public/offline-i18n.js', 'utf8'),
  ]);
  const dom = new JSDOM(html, {
    url: 'https://e-code.ai/offline.html',
    runScripts: 'outside-only',
  });

  Object.defineProperty(dom.window.navigator, 'language', {
    configurable: true,
    value: language ?? 'en-US',
  });
  Object.defineProperty(dom.window.navigator, 'onLine', { configurable: true, value: false });
  dom.window.matchMedia = vi.fn(() => ({ matches: false }));
  dom.window.fetch = vi.fn(() => Promise.reject(new Error('offline')));

  if (cookie) {
    dom.window.document.cookie = cookie;
  }

  dom.window.eval(catalog);
  dom.window.eval(runtime);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  return dom;
}

describe('localized static artifacts', () => {
  it('keeps every active source HTML shell free of non-catalogued visible copy', async () => {
    for (const file of activeHtmlSources) {
      const result = scanHtml(await readFile(file, 'utf8'), file);
      const { residual } = applyAllowlist(result.findings, brandAllowlist);

      expect(result.parseErrors, file).toEqual([]);
      expect(residual, file).toEqual([]);
    }
  });

  it('keeps the standalone offline EN/FR catalogue structurally aligned', async () => {
    const dom = await offlineDom({ language: 'en-US' });
    const messages = dom.window.__ECODE_OFFLINE_MESSAGES__;

    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
    expect(Object.keys(messages.en)).toContain('stillOffline');

    dom.window.close();
  });

  it('renders the offline shell in French on a French browser first visit', async () => {
    const dom = await offlineDom({ language: 'fr-FR' });

    expect(dom.window.document.documentElement.lang).toBe('fr');
    expect(dom.window.document.title).toBe('E-Code — Hors ligne');
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('Vous êtes hors ligne');
    expect(dom.window.document.querySelector('#retry-button')?.textContent).toBe('Réessayer');
    expect(dom.window.document.querySelector('#connection-status')?.textContent).toBe('Aucune connexion');
    expect(dom.window.document.cookie).toContain('vibecore-auto-lang=fr');

    dom.window.close();
  });

  it('gives the manual language cookie precedence and supports a live FR/EN switch', async () => {
    const dom = await offlineDom({ language: 'fr-FR', cookie: 'vibecore-lang=en; Path=/' });
    const frenchButton = dom.window.document.querySelector('[data-language="fr"]');

    expect(dom.window.document.documentElement.lang).toBe('en');
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('You’re offline');

    frenchButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    expect(dom.window.document.documentElement.lang).toBe('fr');
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('Vous êtes hors ligne');
    expect(dom.window.document.cookie).toContain('vibecore-lang=fr');
    expect(dom.window.localStorage.getItem('vibecore:user-language')).toBe('fr');

    dom.window.close();
  });

  it('keeps the silent landing captions paired in English and French', async () => {
    const [english, french] = await Promise.all([
      readFile('public/captions/landing-demo.en.vtt', 'utf8'),
      readFile('public/captions/landing-demo.fr.vtt', 'utf8'),
    ]);

    expect(english).toContain('00:00:00.000 --> 00:00:08.000');
    expect(french).toContain('00:00:00.000 --> 00:00:08.000');
    expect(english).toContain('[No spoken audio');
    expect(french).toContain('[Aucune parole');
  });
});
