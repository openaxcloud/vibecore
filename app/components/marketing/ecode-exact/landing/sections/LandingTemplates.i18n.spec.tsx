/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LandingTemplates from './LandingTemplates';
import {
  formatMarketingLandingTemplateLinkLabel,
  getMarketingLandingTemplatesCopy,
  marketingLandingTemplatesEn,
  marketingLandingTemplatesFr,
} from '~/lib/i18n/catalogs/marketing-landing-templates-video';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function renderTemplates({
  templates = [],
  isLoading = false,
}: {
  templates?: React.ComponentProps<typeof LandingTemplates>['templates'];
  isLoading?: boolean;
} = {}) {
  return render(
    <MemoryRouter>
      <LandingTemplates templates={templates} isLoading={isLoading} />
    </MemoryRouter>,
  );
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('LandingTemplates i18n surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps a complete flat EN/FR catalog with interpolation parity and an English fallback', () => {
    expect(Object.keys(marketingLandingTemplatesFr)).toEqual(Object.keys(marketingLandingTemplatesEn));

    for (const key of Object.keys(marketingLandingTemplatesEn) as (keyof typeof marketingLandingTemplatesEn)[]) {
      expect(marketingLandingTemplatesEn[key].trim().length, key).toBeGreaterThan(0);
      expect(marketingLandingTemplatesFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(marketingLandingTemplatesFr[key]), key).toEqual(
        interpolationTokens(marketingLandingTemplatesEn[key]),
      );
    }

    expect(getMarketingLandingTemplatesCopy('de-DE')['marketingLandingTemplates.title']).toBe('Start with templates');
    expect(formatMarketingLandingTemplateLinkLabel('Kit de démarrage SaaS', 'fr')).toBe(
      'Ouvrir le modèle Kit de démarrage SaaS',
    );
    expect(formatMarketingLandingTemplateLinkLabel(undefined, 'fr')).toBe('Ouvrir le modèle');
  });

  it('renders every product-owned fallback template in professional French', () => {
    language = 'fr';

    renderTemplates();

    const section = screen.getByTestId('section-templates');
    const links = screen.getAllByRole('link');

    expect(section.getAttribute('aria-labelledby')).toBe('landing-templates-heading');
    expect(section.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('heading', { name: 'Commencez avec un modèle' })).toBeTruthy();
    expect(screen.getByText('Des modèles prêts pour la production afin d’accélérer votre développement')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(links).toHaveLength(7);
    expect(screen.getByRole('link', { name: 'Ouvrir le modèle Kit de démarrage SaaS' })).toBeTruthy();
    expect(screen.getByText('Tableau de bord analytique')).toBeTruthy();
    expect(screen.getByText('Application de messagerie')).toBeTruthy();
    expect(screen.getByText('Panneau d’administration')).toBeTruthy();
    expect(screen.getAllByText('Entreprise')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Voir tous les modèles' }).getAttribute('href')).toBe('/templates');

    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/templates');
    }
  });

  it('preserves external catalog content instead of translating user or API data', () => {
    language = 'fr';

    renderTemplates({
      templates: [
        {
          id: 'customer-template',
          name: 'Customer API Workspace',
          description: 'User-authored content stays unchanged',
          category: 'Internal Tools',
          technologies: ['React'],
        },
      ],
    });

    expect(screen.getByText('Customer API Workspace')).toBeTruthy();
    expect(screen.getByText('User-authored content stays unchanged')).toBeTruthy();
    expect(screen.getByText('Internal Tools')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ouvrir le modèle Customer API Workspace' })).toBeTruthy();
    expect(screen.queryByText('Kit de démarrage SaaS')).toBeNull();
  });

  it('updates every product-owned string when switching from French to English at runtime', () => {
    language = 'fr';

    const { rerender } = renderTemplates();

    expect(screen.getByRole('heading', { name: 'Commencez avec un modèle' })).toBeTruthy();
    expect(screen.getByText('Kit de démarrage SaaS')).toBeTruthy();

    language = 'en';
    rerender(
      <MemoryRouter>
        <LandingTemplates templates={[]} isLoading={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Start with templates' })).toBeTruthy();
    expect(screen.getByText('SaaS starter kit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View all templates' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Commencez avec un modèle');
    expect(document.body.textContent).not.toContain('Kit de démarrage SaaS');
  });

  it('announces the localized loading state without exposing empty cards', () => {
    language = 'fr';

    renderTemplates({ isLoading: true });

    const section = screen.getByTestId('section-templates');
    const status = screen.getByRole('status');

    expect(section.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Chargement des modèles…');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Voir tous les modèles' })).toBeTruthy();
  });

  it('has zero targeted scanner findings and explicit long-copy, responsive, theme, focus, and motion safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/landing/sections/LandingTemplates.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    renderTemplates();

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('lg:grid-cols-3');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('var(--ecode-surface-tertiary)');
    expect(source).toContain('var(--ecode-text)');
    expect(source).not.toContain('error.message');
  });
});
