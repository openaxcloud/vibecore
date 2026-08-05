/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LandingWorkflow from './LandingWorkflow';
import {
  formatMarketingLandingWorkflowNumber,
  formatMarketingLandingWorkflowStepPosition,
  formatMarketingLandingWorkflowSubtitle,
  getMarketingLandingWorkflowCopy,
  interpolateMarketingLandingWorkflowCopy,
  marketingLandingWorkflowEn,
  marketingLandingWorkflowFr,
} from '~/lib/i18n/catalogs/marketing-landing-workflow';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('LandingWorkflow i18n surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps flat EN/FR catalog and interpolation parity with an English fallback', () => {
    expect(Object.keys(marketingLandingWorkflowFr)).toEqual(Object.keys(marketingLandingWorkflowEn));

    for (const key of Object.keys(marketingLandingWorkflowEn) as (keyof typeof marketingLandingWorkflowEn)[]) {
      expect(marketingLandingWorkflowEn[key].trim().length, key).toBeGreaterThan(0);
      expect(marketingLandingWorkflowFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(marketingLandingWorkflowFr[key]), key).toEqual(
        interpolationTokens(marketingLandingWorkflowEn[key]),
      );
      expect(marketingLandingWorkflowFr[key], key).not.toBe(marketingLandingWorkflowEn[key]);
    }

    expect(getMarketingLandingWorkflowCopy('de-DE')['marketingLandingWorkflow.title']).toBe('How it works');
    expect(
      interpolateMarketingLandingWorkflowCopy(marketingLandingWorkflowFr['marketingLandingWorkflow.step.position'], {
        position: '1',
        total: '4',
      }),
    ).toBe('Étape 1 sur 4');
  });

  it('formats French numbers, step positions, and 0/1/n plurals professionally', () => {
    expect(formatMarketingLandingWorkflowNumber(12_345, 'fr')).toMatch(/^12[\s\u202f]345$/u);
    expect(formatMarketingLandingWorkflowSubtitle(0, 'fr')).toBe(
      'Passez de l’idée à la production en 0 étapes simples.',
    );
    expect(formatMarketingLandingWorkflowSubtitle(1, 'fr')).toBe('Passez de l’idée à la production en 1 étape simple.');
    expect(formatMarketingLandingWorkflowSubtitle(1_200, 'fr')).toMatch(
      /^Passez de l’idée à la production en 1[\s\u202f]200 étapes simples\.$/u,
    );
    expect(formatMarketingLandingWorkflowStepPosition(1, 4, 'fr')).toBe('Étape 1 sur 4');
  });

  it('renders the complete French workflow with semantic sequence labels', () => {
    language = 'fr';

    render(<LandingWorkflow />);

    const section = screen.getByTestId('section-workflow');
    const steps = screen.getAllByRole('listitem');

    expect(section.getAttribute('aria-labelledby')).toBe('landing-workflow-heading');
    expect(screen.getByRole('heading', { name: 'Comment cela fonctionne' })).toBeTruthy();
    expect(screen.getByText('Passez de l’idée à la production en 4 étapes simples.')).toBeTruthy();
    expect(steps).toHaveLength(4);
    expect(steps[0].getAttribute('aria-labelledby')).toContain('landing-workflow-describe-position');
    expect(steps[0].textContent).toContain('Étape 1 sur 4');
    expect(screen.getByRole('heading', { name: 'Décrivez votre application' })).toBeTruthy();
    expect(screen.getByText('Expliquez à notre IA, en langage naturel, ce que vous souhaitez créer.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'L’IA génère le code' })).toBeTruthy();
    expect(screen.getByText('Observez la création en temps réel d’un code prêt pour la production.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Déployez instantanément' })).toBeTruthy();
    expect(screen.getByText('Déployez en un clic sur un réseau edge mondial.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Adaptez automatiquement la capacité' })).toBeTruthy();
    expect(
      screen.getByText('L’infrastructure ajuste automatiquement sa capacité à tous les niveaux de trafic.'),
    ).toBeTruthy();
  });

  it('updates every visible string when switching from French to English', () => {
    language = 'fr';

    const { rerender } = render(<LandingWorkflow />);

    expect(screen.getByRole('heading', { name: 'Comment cela fonctionne' })).toBeTruthy();

    language = 'en';
    rerender(<LandingWorkflow />);

    expect(screen.getByRole('heading', { name: 'How it works' })).toBeTruthy();
    expect(screen.getByText('Go from idea to production in 4 simple steps.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Describe your app' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AI generates the code' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Deploy instantly' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Scale automatically' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Comment cela fonctionne');
    expect(document.body.textContent).not.toContain('Décrivez votre application');
  });

  it('has zero scanner findings and explicit responsive, theme, accessibility, and reduced-motion safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/landing/sections/LandingWorkflow.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    render(<LandingWorkflow />);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('sm:grid-cols-2');
    expect(source).toContain('lg:grid-cols-4');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('var(--ecode-surface-tertiary)');
    expect(source).toContain('var(--ecode-text)');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('<ol');
    expect(source).not.toContain('error.message');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
