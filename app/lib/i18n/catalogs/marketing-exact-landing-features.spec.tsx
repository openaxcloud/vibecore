/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatMarketingExactLandingFeaturesInteger,
  formatMarketingExactLandingFeaturesPercent,
  getMarketingExactLandingFeaturesCopy,
  interpolateMarketingExactLandingFeaturesCopy,
  marketingExactLandingFeaturesEn,
  marketingExactLandingFeaturesFr,
} from './marketing-exact-landing-features';
import LandingFeatures from '~/components/marketing/ecode-exact/landing/sections/LandingFeatures';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
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

describe('exact landing features marketing catalog and surface', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps complete EN/FR parity and falls back to English', () => {
    expect(leafPaths(marketingExactLandingFeaturesFr)).toEqual(leafPaths(marketingExactLandingFeaturesEn));
    expect(marketingExactLandingFeaturesFr.exactLandingFeatures.features.map(({ id }) => id)).toEqual(
      marketingExactLandingFeaturesEn.exactLandingFeatures.features.map(({ id }) => id),
    );
    expect(getMarketingExactLandingFeaturesCopy('fr-CA').exactLandingFeatures.heading).toBe(
      'Des fonctionnalités de niveau entreprise, avec l’agilité d’une start-up',
    );
    expect(getMarketingExactLandingFeaturesCopy('de-DE').exactLandingFeatures.heading).toBe(
      'Enterprise Features, Startup Speed',
    );
  });

  it('formats and interpolates percentages and integers for each locale', () => {
    expect(formatMarketingExactLandingFeaturesPercent(0.9999, 'fr-FR')).toBe('99,99 %');
    expect(formatMarketingExactLandingFeaturesPercent(0.9999, 'en-US')).toBe('99.99%');
    expect(formatMarketingExactLandingFeaturesInteger(12_345, 'fr-FR')).toBe('12 345');
    expect(formatMarketingExactLandingFeaturesInteger(12_345, 'en-US')).toBe('12,345');
    expect(
      interpolateMarketingExactLandingFeaturesCopy('SLA : {uptime} — {locations} sites', {
        uptime: '99,99 %',
        locations: '200',
      }),
    ).toBe('SLA : 99,99 % — 200 sites');
    expect(interpolateMarketingExactLandingFeaturesCopy('{known} {missing}', { known: 'value' })).toBe(
      'value {missing}',
    );
  });

  it('renders the complete feature section in professional French', () => {
    language = 'fr';

    render(<LandingFeatures />);

    expect(
      screen.getByRole('region', {
        name: 'Des fonctionnalités de niveau entreprise, avec l’agilité d’une start-up',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Tout ce qu’il vous faut pour créer, déployer/u)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Infrastructure de niveau entreprise' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Développement optimisé par l’IA' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Sécurité de niveau bancaire' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Collaboration en temps réel' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Développement 10 fois plus rapide' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Déploiement mondial sur le réseau edge' })).toBeTruthy();
    expect(screen.getByTestId('text-feature-description-0').textContent).toContain('SLA de disponibilité de 99,99 %');
    expect(screen.getByText(/plus de 200 points de présence edge/u)).toBeTruthy();
    expect(screen.getAllByTestId(/^card-feature-/u)).toHaveLength(6);
    expect(screen.getAllByTestId(/^icon-feature-/u)).toHaveLength(6);
    expect(screen.getAllByTestId(/^icon-feature-/u).every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('preserves brands and technical terms while removing the original English copy in French', () => {
    language = 'fr';

    render(<LandingFeatures />);

    expect(document.body.textContent).toContain('Fortune 500');
    expect(document.body.textContent).toContain('CDN');
    expect(document.body.textContent).toContain('SOC 2 Type II');
    expect(document.body.textContent).toContain('RBAC');
    expect(document.body.textContent).toContain('SSL');
    expect(document.body.textContent).toContain('DDoS');
    expect(document.body.textContent).not.toContain('Enterprise Features, Startup Speed');
    expect(document.body.textContent).not.toContain('AI-Powered Development');
    expect(document.body.textContent).not.toContain('Bank-Level Security');
    expect(document.body.textContent).not.toContain('Real-Time Collaboration');
    expect(document.body.textContent).not.toContain('Global Edge Deployment');
  });

  it('renders the English fallback with English number formatting', () => {
    language = 'de-DE';

    render(<LandingFeatures />);

    expect(screen.getByRole('heading', { level: 2, name: 'Enterprise Features, Startup Speed' })).toBeTruthy();
    expect(screen.getByText(/99\.99% uptime SLA/u)).toBeTruthy();
    expect(screen.getByText(/Deploy to 200\+ edge locations/u)).toBeTruthy();
  });

  it('has zero scanner findings and explicit responsive, theme and accessibility safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/landing/sections/LandingFeatures.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('grid-cols-1');
    expect(source).toContain('md:grid-cols-2');
    expect(source).toContain('lg:grid-cols-3');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('bg-[var(--ecode-surface)]');
    expect(source).toContain('text-[var(--ecode-text)]');
    expect(source).toContain('border-[var(--ecode-border)]');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('motion-reduce:transform-none');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('aria-hidden');
    expect(source).not.toContain('truncate');
    expect(source).not.toContain('line-clamp');
    expect(source).not.toContain('whitespace-nowrap');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(source).not.toMatch(/rgba?\(/iu);
  });
});
