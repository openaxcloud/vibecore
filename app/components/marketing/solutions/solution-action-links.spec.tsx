/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppBuilderSolutionPage } from './AppBuilderSolutionPage';
import { SolutionSalesPage } from './SolutionSalesPage';
import { APP_BUILDER_COPY } from './app-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import type { SolutionCopy } from './solution-copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

vi.mock('~/components/marketing/ecode-exact/EcodeExactShell', () => ({
  EcodeExactPublicShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderInRouter(children: React.ReactNode) {
  return render(<MemoryRouter>{children}</MemoryRouter>);
}

describe('React 18 image priority compatibility', () => {
  it('does not emit the unsupported fetchPriority property warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderInRouter(<AppBuilderSolutionPage language="en" />);

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('fetchPriority');
  });
});

describe('Solutions CTA accessible names', () => {
  it('uses only the App Builder ariaLabel instead of duplicating the visible label', () => {
    const action = APP_BUILDER_COPY.en.hero.primaryCta;

    renderInRouter(<AppBuilderSolutionPage language="en" />);

    const hero = screen.getByTestId('app-builder-hero');
    const link = within(hero).getByRole('link', { name: action.ariaLabel, exact: true });

    expect(link.getAttribute('aria-label')).toBe(action.ariaLabel);
    expect(within(hero).queryByRole('link', { name: `${action.label}. ${action.ariaLabel}`, exact: true })).toBeNull();
  });

  it('uses only the shared Solutions ariaLabel instead of duplicating the visible label', () => {
    const copy = WEBSITE_BUILDER_COPY.en;
    const action = copy.hero.primaryCta;

    renderInRouter(<SolutionSalesPage copy={copy} language="en" solutionSlug="website-builder" />);

    const hero = screen.getByTestId('solution-hero');
    const link = within(hero).getByRole('link', { name: action.ariaLabel, exact: true });

    expect(link.getAttribute('aria-label')).toBe(action.ariaLabel);
    expect(within(hero).queryByRole('link', { name: `${action.label}. ${action.ariaLabel}`, exact: true })).toBeNull();
  });

  it('falls back to the visible label when the shared Solutions ariaLabel is empty', () => {
    const source = WEBSITE_BUILDER_COPY.en;
    const fallbackLabel = 'Visible fallback CTA';

    const copy: SolutionCopy = {
      ...source,
      hero: {
        ...source.hero,
        primaryCta: { label: fallbackLabel, ariaLabel: '' },
      },
    };

    renderInRouter(<SolutionSalesPage copy={copy} language="en" solutionSlug="website-builder" />);

    const link = screen.getByRole('link', { name: fallbackLabel, exact: true });

    expect(link.getAttribute('aria-label')).toBe(fallbackLabel);
  });

  it('preserves the frozen Enterprise CTA naming and visual override branch', () => {
    const copy = ENTERPRISE_COPY.en;

    renderInRouter(<SolutionSalesPage copy={copy} language="en" solutionSlug="enterprise" />);

    const page = screen.getByTestId('solution-page');
    const primaryName = `${copy.hero.primaryCta.label}. ${copy.hero.primaryCta.ariaLabel}`;
    const secondaryName = `${copy.hero.secondaryCta.label}. ${copy.hero.secondaryCta.ariaLabel}`;
    const proofName = `${copy.proofLink.cta.label}. ${copy.proofLink.cta.ariaLabel}`;

    expect(page.classList.contains('sol-sales--legacy')).toBe(true);
    expect(screen.getAllByRole('link', { name: primaryName, exact: true })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: secondaryName, exact: true })).toHaveLength(2);
    expect(screen.getByRole('link', { name: proofName, exact: true }).getAttribute('aria-label')).toBe(proofName);

    const css = readFileSync(resolve(process.cwd(), 'app/components/marketing/solutions/solution-sales.css'), 'utf8');

    expect(css).toContain('.sol-sales--legacy .sol-hero__grid');
    expect(css).toContain('.sol-sales--legacy .sol-final-cta__grid');
    expect(css).toContain('var(--ecode-shadow, #000) 20%');
    expect(css).toContain('.sol-demo__dot:first-child');
    expect(css).toContain('color: var(--ecode-accent-text);');
    expect(css).toContain('color: var(--ecode-accent-contrast);');
  });
});

describe('Solutions image network priority', () => {
  it('keeps App Builder hero eager/high and deferred visuals lazy/low with React 18-compatible attributes', () => {
    renderInRouter(<AppBuilderSolutionPage language="en" />);

    const heroImage = screen.getByTestId('app-builder-visual-hero').querySelector('img');
    const deferredImage = screen.getByTestId('app-builder-visual-booking').querySelector('img');

    expect(heroImage?.getAttribute('loading')).toBe('eager');
    expect(heroImage?.getAttribute('fetchpriority')).toBe('high');
    expect(deferredImage?.getAttribute('loading')).toBe('lazy');
    expect(deferredImage?.getAttribute('fetchpriority')).toBe('low');
  });

  it('keeps shared Solutions hero eager/high and deferred visuals lazy/low with React 18-compatible attributes', () => {
    renderInRouter(<SolutionSalesPage copy={WEBSITE_BUILDER_COPY.en} language="en" solutionSlug="website-builder" />);

    const heroImage = screen.getByTestId('solution-ide-prompt').querySelector('img');
    const deferredImage = screen.getByTestId('solution-ide-preview').querySelector('img');

    expect(heroImage?.getAttribute('loading')).toBe('eager');
    expect(heroImage?.getAttribute('fetchpriority')).toBe('high');
    expect(deferredImage?.getAttribute('loading')).toBe('lazy');
    expect(deferredImage?.getAttribute('fetchpriority')).toBe('low');
  });
});
