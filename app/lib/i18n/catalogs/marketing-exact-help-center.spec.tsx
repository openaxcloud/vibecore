/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactHelpCenterCopy,
  interpolateMarketingExactHelpCenterCopy,
  marketingExactHelpCenterEn,
  marketingExactHelpCenterFr,
} from './marketing-exact-help-center';
import HelpCenter from '~/components/marketing/ecode-exact/pages/HelpCenter';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicNavbar: () => <nav data-testid="public-navbar" />,
  EcodeExactPublicFooter: () => <footer data-testid="public-footer" />,
}));

vi.mock('~/components/marketing/ecode-exact/EcodeExactUi', () => ({
  Card: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }) => (
    <h3 {...props}>{children}</h3>
  ),
  CardDescription: ({ children, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) => (
    <p {...props}>{children}</p>
  ),
}));

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

describe('exact Help Center marketing catalog and surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity, interpolation and English fallback', () => {
    expect(leafPaths(marketingExactHelpCenterFr)).toEqual(leafPaths(marketingExactHelpCenterEn));
    expect(getMarketingExactHelpCenterCopy('de-DE').exactHelpCenter.hero.title).toBe('How can we help?');
    expect(getMarketingExactHelpCenterCopy('fr-FR').exactHelpCenter.hero.title).toBe(
      'Comment pouvons-nous vous aider ?',
    );
    expect(
      interpolateMarketingExactHelpCenterCopy(marketingExactHelpCenterFr.exactHelpCenter.search.noResults, {
        query: 'GitHub Enterprise',
      }),
    ).toBe(
      'Aucun résultat pour « GitHub Enterprise ». Essayez une autre recherche ou parcourez les rubriques ci-dessous.',
    );
  });

  it('renders every default Help Center section in French', () => {
    language = 'fr';

    render(<HelpCenter />);

    expect(screen.getByRole('heading', { level: 1, name: /Comment pouvons-nous vous aider/u })).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans le Centre d’aide' })).toHaveProperty(
      'placeholder',
      'Rechercher dans le Centre d’aide…',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Parcourir les rubriques' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Premiers pas' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Espaces de travail' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Déploiements' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Facturation' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Agent IA' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Intégrations' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Articles populaires' })).toBeTruthy();
    expect(screen.getByText(/Comment créer un projet à partir d’un prompt/u)).toBeTruthy();
    expect(screen.getByText('Configurer une intégration MCP')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Repérez-vous dans l’espace de travail' })).toBeTruthy();
    expect(screen.getByAltText(/IDE E-Code réunissant l’agent IA/u)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: /Besoin d’aide supplémentaire/u })).toBeTruthy();
    expect(screen.getByText('Contacter l’assistance').closest('a')?.getAttribute('href')).toBe('/contact');
    expect(screen.getByText('Lire la documentation').closest('a')?.getAttribute('href')).toBe('/docs');
    expect(document.body.textContent).not.toContain('How can we help?');
    expect(document.body.textContent).not.toContain('Popular articles');
    expect(document.body.textContent).not.toContain('Still need help?');
  });

  it('searches the localized French topic corpus only after submission', () => {
    language = 'fr';

    render(<HelpCenter />);

    const input = screen.getByRole('searchbox', { name: 'Rechercher dans le Centre d’aide' });
    fireEvent.change(input, { target: { value: 'facturation' } });

    expect(screen.getByRole('heading', { level: 2, name: 'Parcourir les rubriques' })).toBeTruthy();
    fireEvent.submit(screen.getByTestId('form-help-search'));

    expect(screen.getByRole('heading', { level: 2, name: 'Rubriques correspondantes' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Facturation' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Premiers pas' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Repérez-vous dans l’espace de travail' })).toBeNull();
  });

  it('matches French topics without requiring users to type diacritics', () => {
    language = 'fr';

    render(<HelpCenter />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans le Centre d’aide' }), {
      target: { value: 'deploiements' },
    });
    fireEvent.submit(screen.getByTestId('form-help-search'));

    expect(screen.getByRole('heading', { level: 3, name: 'Déploiements' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Facturation' })).toBeNull();
  });

  it('filters localized articles and preserves technical search terms', () => {
    language = 'fr';

    render(<HelpCenter />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans le Centre d’aide' }), {
      target: { value: 'GitHub' },
    });
    fireEvent.submit(screen.getByTestId('form-help-search'));

    expect(screen.getByRole('heading', { level: 2, name: 'Articles correspondants' })).toBeTruthy();
    expect(screen.getByText('Connecter un dépôt GitHub à votre espace de travail')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Intégrations' })).toBeTruthy();
    expect(screen.queryByText('Configurer une intégration MCP')).toBeNull();
  });

  it('announces localized empty results, preserves the query and restores content when cleared', () => {
    language = 'fr';

    render(<HelpCenter />);

    const input = screen.getByRole('searchbox', { name: 'Rechercher dans le Centre d’aide' });
    fireEvent.change(input, { target: { value: 'rubrique introuvable 204' } });
    fireEvent.submit(screen.getByTestId('form-help-search'));

    expect(screen.getByRole('status').textContent).toBe(
      'Aucun résultat pour « rubrique introuvable 204 ». Essayez une autre recherche ou parcourez les rubriques ci-dessous.',
    );
    expect(screen.queryByRole('heading', { level: 2, name: 'Parcourir les rubriques' })).toBeNull();

    fireEvent.change(input, { target: { value: '' } });

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Parcourir les rubriques' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Articles populaires' })).toBeTruthy();
  });

  it('preserves brands and technical terms while localizing SEO copy', () => {
    const copy = marketingExactHelpCenterFr.exactHelpCenter;

    expect(copy.seo).toEqual({
      title: 'Centre d’aide — E-Code',
      description:
        'Consultez les guides E-Code sur les espaces de travail, les déploiements, la facturation, les intégrations et l’agent IA.',
      imageAlt: 'Guides et documentation de l’espace de travail dans le Centre d’aide E-Code',
    });
    expect(copy.topics.find(({ id }) => id === 'integrations')?.description).toContain('GitHub');
    expect(copy.topics.find(({ id }) => id === 'integrations')?.description).toContain('MCP');
    expect(copy.popularArticles).toContain('Comprendre les limites d’utilisation du forfait Free');
    expect(copy.workspace.windowLabel).toContain('E-Code');
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/pages/HelpCenter.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('lg:grid-cols-2');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('text-[16px]');
    expect(source).toContain('min-h-11');
    expect(source).toContain('w-full');
    expect(source).toContain('sm:w-auto');
    expect(source).toContain('bg-primary');
    expect(source).toContain('text-primary-foreground');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-hidden');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toContain('HELP_TOPICS');
    expect(source).not.toContain('HELP_POPULAR_ARTICLES');
  });
});
