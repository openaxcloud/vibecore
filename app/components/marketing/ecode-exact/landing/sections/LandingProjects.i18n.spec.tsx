/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LandingProjects from './LandingProjects';
import {
  formatMarketingLandingProjectBuildTime,
  getMarketingLandingProjectsCopy,
  interpolateMarketingLandingProjectsCopy,
  marketingLandingProjectsEn,
  marketingLandingProjectsFr,
} from '~/lib/i18n/catalogs/marketing-landing-projects';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

function isInvariantProductNameOrTechnology(key: string): boolean {
  return key.endsWith('.title') && key.startsWith('marketingLandingProjects.project.')
    ? true
    : key.startsWith('marketingLandingProjects.technology.');
}

describe('LandingProjects i18n surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps a complete flat EN/FR catalog with interpolation parity and English fallback', () => {
    expect(Object.keys(marketingLandingProjectsFr)).toEqual(Object.keys(marketingLandingProjectsEn));

    for (const key of Object.keys(marketingLandingProjectsEn) as (keyof typeof marketingLandingProjectsEn)[]) {
      expect(marketingLandingProjectsEn[key].trim().length, key).toBeGreaterThan(0);
      expect(marketingLandingProjectsFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(marketingLandingProjectsFr[key]), key).toEqual(
        interpolationTokens(marketingLandingProjectsEn[key]),
      );

      if (isInvariantProductNameOrTechnology(key)) {
        expect(marketingLandingProjectsFr[key], key).toBe(marketingLandingProjectsEn[key]);
      } else {
        expect(marketingLandingProjectsFr[key], key).not.toBe(marketingLandingProjectsEn[key]);
      }
    }

    expect(getMarketingLandingProjectsCopy('de-DE')['marketingLandingProjects.title']).toBe(
      'Built with E-Code Platform',
    );
    expect(
      interpolateMarketingLandingProjectsCopy(marketingLandingProjectsFr['marketingLandingProjects.buildTime.other'], {
        count: '3',
      }),
    ).toBe('Créé en 3 heures');
  });

  it('formats localized build durations with the appropriate plural form', () => {
    expect(formatMarketingLandingProjectBuildTime(1, 'fr')).toBe('Créé en 1 heure');
    expect(formatMarketingLandingProjectBuildTime(3, 'fr')).toBe('Créé en 3 heures');
    expect(formatMarketingLandingProjectBuildTime(1_200, 'fr')).toMatch(/^Créé en 1[\s\u202f]200 heures$/u);
    expect(formatMarketingLandingProjectBuildTime(1, 'en')).toBe('Built in 1 hour');
    expect(formatMarketingLandingProjectBuildTime(3, 'de-DE')).toBe('Built in 3 hours');
  });

  it('renders all product-owned copy in professional French while preserving names and technologies', () => {
    language = 'fr';

    render(<LandingProjects />);

    const section = screen.getByTestId('section-projects');
    const projectList = screen.getByRole('list', { name: 'Des projets créés avec E-Code Platform' });

    expect(section.getAttribute('aria-labelledby')).toBe('landing-projects-heading');
    expect(screen.getByRole('heading', { name: 'Des projets créés avec E-Code Platform' })).toBeTruthy();
    expect(
      screen.getByText(
        'Des applications réellement utilisées en production, créées par notre communauté en quelques heures, pas en plusieurs mois',
      ),
    ).toBeTruthy();
    expect(projectList.children).toHaveLength(3);
    expect(within(projectList).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('heading', { name: 'TechStore Pro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'TeamSync Hub' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'DataViz Pro' })).toBeTruthy();
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.textContent === 'Plateforme e-commerce complète traitant plus de 50 000 transactions par jour',
        ),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Plateforme de collaboration en temps réel pour les équipes à distance')).toBeTruthy();
    expect(screen.getByText('Tableau de bord analytique d’entreprise avec graphiques en temps réel')).toBeTruthy();
    expect(screen.getByText('Créé en 2 heures')).toBeTruthy();
    expect(screen.getByText('Créé en 3 heures')).toBeTruthy();
    expect(screen.getByText('Créé en 4 heures')).toBeTruthy();
    expect(screen.getAllByText('PostgreSQL')).toHaveLength(2);
    expect(screen.getByText('WebSocket')).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(section.textContent).not.toContain('Built in');
    expect(section.textContent).not.toContain('Real-time collaboration platform');
  });

  it('updates every translatable string when switching from French to English at runtime', () => {
    language = 'fr';

    const { rerender } = render(<LandingProjects />);

    expect(screen.getByRole('heading', { name: 'Des projets créés avec E-Code Platform' })).toBeTruthy();
    expect(screen.getByText('Créé en 3 heures')).toBeTruthy();

    language = 'en';
    rerender(<LandingProjects />);

    expect(screen.getByRole('heading', { name: 'Built with E-Code Platform' })).toBeTruthy();
    expect(screen.getByText('Built in 3 hours')).toBeTruthy();
    expect(screen.getByText('Real-time collaboration platform for remote teams')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Des projets créés avec E-Code Platform');
    expect(document.body.textContent).not.toContain('Créé en 3 heures');
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and motion safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/landing/sections/LandingProjects.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    render(<LandingProjects />);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('lg:grid-cols-3');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('var(--ecode-background)');
    expect(source).toContain('var(--ecode-surface)');
    expect(source).toContain('var(--ecode-text)');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('<ul');
    expect(source).not.toContain('error.message');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
