/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import LandingCta from './LandingCTA';
import LandingLanguages from './LandingLanguages';
import LandingStats from './LandingStats';
import LandingTestimonials from './LandingTestimonials';
import {
  getMarketingLandingRemainingCopy,
  marketingLandingRemainingEn,
  marketingLandingRemainingFr,
} from '~/lib/i18n/catalogs/marketing-landing-remaining';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => cleanup());

function renderSections(language: 'en' | 'fr') {
  const i18n = createI18nInstance(language);

  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <LandingCta />
        <LandingStats />
        <LandingLanguages />
        <LandingTestimonials />
      </MemoryRouter>
    </I18nextProvider>,
  );

  return i18n;
}

describe('remaining homepage sections i18n', () => {
  it('renders professional French copy while preserving brands, people and technology names', () => {
    renderSections('fr');

    expect(screen.getByRole('heading', { name: 'Prêt à créer quelque chose d’exceptionnel ?' })).toBeTruthy();
    expect(screen.getByText('Développeurs actifs')).toBeTruthy();
    expect(screen.getByText('Applications déployées')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tous les langages, tous les frameworks' })).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText('Kubernetes')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'La confiance des leaders du secteur' })).toBeTruthy();
    expect(screen.getByText('Sarah Chen')).toBeTruthy();
    expect(screen.getByText('TechCorp Global')).toBeTruthy();
    expect(screen.getByText('CTO, entreprise technologique du Fortune 500')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: '5 étoiles sur 5' })).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Ready to build');
    expect(document.body.textContent).not.toContain('Active developers');
  });

  it('switches every section back to English live and keeps wrap-safe 44px calls to action', async () => {
    const i18n = renderSections('fr');
    const startButton = screen.getByRole('button', { name: 'Commencer à créer gratuitement' });

    expect(startButton.className).toContain('min-h-[44px]');
    expect(startButton.className).toContain('!whitespace-normal');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading', { name: 'Ready to build something amazing?' })).toBeTruthy();
    expect(screen.getByText('Active developers')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Every language, every framework' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Trusted by industry leaders' })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: '5 out of 5 stars' })).toHaveLength(3);
  });

  it('keeps catalog parity and uses English as the fallback', () => {
    expect(Object.keys(marketingLandingRemainingFr).sort()).toEqual(Object.keys(marketingLandingRemainingEn).sort());
    expect(getMarketingLandingRemainingCopy('de')['marketingLanding.cta.start']).toBe('Start building for free');
  });
});
