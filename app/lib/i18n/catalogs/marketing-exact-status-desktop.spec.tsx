import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  formatStatusDay,
  formatStatusHistoryTitle,
  formatStatusIncidentDuration,
  getMarketingExactStatusDesktopCopy,
  interpolateMarketingExactStatusDesktopCopy,
  localizeStatusSubscriptionError,
  marketingExactStatusDesktopEn,
  marketingExactStatusDesktopFr,
} from './marketing-exact-status-desktop';

import Desktop from '~/components/marketing/ecode-exact/pages/Desktop';
import StatusPage from '~/components/marketing/ecode-exact/pages/StatusPage';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { loader as rootLoader } from '~/root';
import { loader as desktopLoader, meta as desktopMeta } from '~/routes/desktop';
import { loader as statusLoader, meta as statusMeta } from '~/routes/status';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function dataOf<T>(result: unknown): T {
  return result && typeof result === 'object' && 'data' in result ? (result as { data: T }).data : (result as T);
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact status and desktop marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactStatusDesktopFr)).toEqual(leafPaths(marketingExactStatusDesktopEn));
  });

  it('falls back to English for unsupported locales', () => {
    const fallback = getMarketingExactStatusDesktopCopy('de-DE');

    expect(fallback.exactStatus.hero.title).toBe('Platform status');
    expect(fallback.exactDesktop.hero.title).toBe('E-Code on your desktop');
  });

  it('interpolates OS labels without changing technical names', () => {
    const template = getMarketingExactStatusDesktopCopy('fr').exactDesktop.hero.downloadTemplate;

    expect(interpolateMarketingExactStatusDesktopCopy(template, { os: 'macOS' })).toBe('Télécharger pour macOS');
    expect(() => interpolateMarketingExactStatusDesktopCopy(template, {})).toThrow(/Missing/u);
  });

  it('formats dates, durations, numbers and plurals for the active locale', () => {
    const date = new Date('2026-08-04T00:00:00.000Z');

    expect(formatStatusDay(date, 'en')).toBe('Aug 04');
    expect(formatStatusDay(date, 'fr')).toBe('04 août');
    expect(formatStatusIncidentDuration(1, 'en')).toBe('1 minute');
    expect(formatStatusIncidentDuration(125, 'en')).toBe('2 hours 5 minutes');
    expect(formatStatusIncidentDuration(125, 'fr')).toBe('2 heures 5 minutes');
    expect(formatStatusHistoryTitle(7, 'fr')).toBe('Historique des incidents (7 derniers jours)');
  });

  it('localizes known and unknown newsletter failures without exposing English in French', () => {
    expect(localizeStatusSubscriptionError('Enter a valid email address.', 'fr')).toBe(
      'Saisissez une adresse e-mail valide.',
    );
    expect(localizeStatusSubscriptionError('Unexpected upstream error', 'fr')).toBe(
      'Échec de l’abonnement. Veuillez réessayer.',
    );
  });

  it('renders the complete Status page in French', () => {
    const markup = renderInFrench(<StatusPage />);

    expect(markup).toContain('État de la plateforme');
    expect(markup).toContain('Tous les systèmes sont opérationnels');
    expect(markup).toContain('Aucun incident signalé');
    expect(markup).toContain('Fournisseurs de modèles d’IA');
    expect(markup).not.toContain('Platform status');
    expect(markup).not.toContain('No incidents reported');
    expect(markup).not.toContain('Subscribe to updates');
  });

  it('renders the complete Desktop page in French', () => {
    const markup = renderInFrench(<Desktop />);

    expect(markup).toContain('E-Code sur votre ordinateur');
    expect(markup).toContain('Télécharger l’application de bureau');
    expect(markup).toContain('Gestion de versions intégrée');
    expect(markup).toContain('Configuration minimale prise en charge');
    expect(markup).not.toContain('E-Code on your desktop');
    expect(markup).not.toContain('Download the desktop app');
    expect(markup).not.toContain('System requirements');
  });

  it('preserves brands, download URLs, filenames and technical terminology', () => {
    const status = renderInFrench(<StatusPage />);
    const desktop = renderInFrench(<Desktop />);

    expect(status).toContain('OpenAI');
    expect(status).toContain('Anthropic');
    expect(status).toContain('Kubernetes');
    expect(desktop).toContain('Git');
    expect(desktop).toContain('commit');
    expect(desktop).toContain('E-Code-Setup.exe');
    expect(desktop).toContain('/download/desktop/E-Code-Setup.exe');
  });

  it.each([
    [statusLoader, statusMeta, 'https://e-code.ai/status', 'État du système — E-Code'],
    [desktopLoader, desktopMeta, 'https://e-code.ai/desktop', 'Application de bureau — E-Code'],
  ])('serves localized route metadata', (loader, meta, url, title) => {
    const data = loader({ request: new Request(`${url}?lang=fr`) } as never);
    const tags = meta({ data } as never);

    expect(data.language).toBe('fr');
    expect(tags).toEqual(expect.arrayContaining([{ title }]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'og:title', content: title })]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'twitter:description' })]));
    expect(tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'twitter:image:alt', content: expect.stringContaining('E-Code') }),
      ]),
    );
  });

  it.each(['/status', '/desktop'])('inherits canonical and en/fr alternates for %s', (path) => {
    const result = rootLoader({
      request: new Request(`https://e-code.ai${path}?lang=fr`),
      params: {},
      context: {},
    });

    const data = dataOf<{ seo: { canonical: string; english: string; french: string } }>(result);

    expect(data.seo).toEqual({
      canonical: `https://e-code.ai${path}`,
      english: `https://e-code.ai${path}`,
      french: `https://e-code.ai${path}?lang=fr`,
    });
  });

  it('leaves no hard-coded visible source copy in the two pages or routes', async () => {
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');

    const files = [
      '../../../components/marketing/ecode-exact/pages/StatusPage.tsx',
      '../../../components/marketing/ecode-exact/pages/Desktop.tsx',
      '../../../routes/status.tsx',
      '../../../routes/desktop.tsx',
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      const result = scanSource(source, relativePath);

      expect(result.parseErrors, relativePath).toEqual([]);
      expect(result.findings, relativePath).toEqual([]);
    }
  });
});
