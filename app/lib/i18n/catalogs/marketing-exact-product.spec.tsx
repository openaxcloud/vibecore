import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactProductCopy,
  marketingExactProductEn,
  marketingExactProductFr,
} from './marketing-exact-product';

import Features from '~/components/marketing/ecode-exact/pages/Features';
import Mobile from '~/components/marketing/ecode-exact/pages/Mobile';
import { createI18nInstance } from '~/lib/i18n/runtime';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
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

describe('exact product marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactProductFr)).toEqual(leafPaths(marketingExactProductEn));
  });

  it('falls back to English and resolves professional French copy', () => {
    expect(getMarketingExactProductCopy('de').exactProduct.mobile.hero.accent).toBe('in your pocket');
    expect(getMarketingExactProductCopy('fr').exactProduct.mobile.hero.accent).toBe('dans votre poche');
    expect(getMarketingExactProductCopy('fr').exactProduct.features.tabs[1]?.label).toBe('Avec l’IA');
  });

  it('renders the exact features page in French', () => {
    const markup = renderInFrench(<Features />);

    expect(markup).toContain('Tout ce dont vous avez besoin, au même endroit');
    expect(markup).toContain('Plateforme complète');
    expect(markup).toContain('Contacter le service commercial');
    expect(markup).not.toContain('Everything works together seamlessly');
  });

  it('renders the exact mobile page in French', () => {
    const markup = renderInFrench(<Mobile />);

    expect(markup).toContain('Tout votre IDE,');
    expect(markup).toContain('Aperçu pensé pour le tactile');
    expect(markup).toContain('Prêt à créer où que vous soyez ?');
    expect(markup).not.toContain('Ready to build from anywhere?');
  });
});
