/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetProductTourServerCache, PRODUCT_TOUR_STEPS, ProductTour, readProductTourProgress } from './ProductTour';
import {
  formatProductTourStepCounter,
  getProductTourCopy,
  productTourEn,
  productTourFr,
} from '~/lib/i18n/catalogs/product-tour';

function renderWithLanguage(language: 'en' | 'fr' | 'es', node: ReactNode) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/gu)].map((match) => match[1]).sort();
}

beforeEach(() => {
  window.localStorage.clear();

  // The server-side tour verdict is memoized per page load; each case starts clean.
  __resetProductTourServerCache();
});

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-vc-tour-active]').forEach((element) => {
    element.removeAttribute('data-vc-tour-active');
  });
});

describe('ProductTour i18n', () => {
  it('keeps catalog parity, interpolation, identifiers, number formatting, and English fallback', () => {
    expect(Object.keys(productTourFr).sort()).toEqual(Object.keys(productTourEn).sort());

    for (const key of Object.keys(productTourEn) as Array<keyof typeof productTourEn>) {
      expect(productTourEn[key].trim().length, key).toBeGreaterThan(0);
      expect(productTourFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(productTourFr[key]), key).toEqual(interpolationTokens(productTourEn[key]));
    }

    expect(PRODUCT_TOUR_STEPS.map((step) => step.target)).toEqual(['navigation', 'create-project', 'tools', 'help']);
    expect(PRODUCT_TOUR_STEPS[1].fallbackTarget).toBe('navigation');
    expect(formatProductTourStepCounter('fr-FR', 1, 4)).toBe('Visite guidée — Étape 1 sur 4');
    expect(getProductTourCopy('es-MX')['productTour.action.next']).toBe('Next');
  });

  it('renders every step, control, and accessibility label in French', async () => {
    renderWithLanguage('fr', <ProductTour restartToken={0} />);

    const dialog = await screen.findByRole('dialog', { name: 'Parcourez votre espace de travail' });

    expect(screen.getByText('Visite guidée — Étape 1 sur 4')).toBeTruthy();
    expect(
      screen.getByText(
        'Projets, utilisation, facturation, gestion de l’équipe et paramètres du compte sont regroupés dans le menu principal.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Progression de la visite guidée' })).toBeTruthy();

    const closeButton = screen.getByRole('button', { name: 'Fermer la visite guidée' });
    const laterButton = screen.getByRole('button', { name: 'Plus tard' });
    const backButton = screen.getByRole('button', { name: 'Retour' });

    expect(closeButton.getAttribute('title')).toBe('Fermer la visite guidée');
    expect(closeButton.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(backButton.hasAttribute('disabled')).toBe(true);
    expect(dialog.className).toContain('overflow-x-hidden');
    expect(laterButton.parentElement?.className).toContain('flex-col');
    expect(laterButton.parentElement?.className).toContain('sm:flex-row');
    expect(backButton.parentElement?.className).toContain('grid-cols-2');
    expect(backButton.className).toContain('whitespace-normal');

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('heading', { name: 'Créez à partir d’un prompt' })).toBeTruthy();
    expect(
      screen.getByText(
        'Choisissez Nouveau projet, décrivez votre besoin, puis ajoutez les options avancées uniquement si elles sont utiles.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('heading', { name: 'Retrouvez votre travail et les nouveautés' })).toBeTruthy();
    expect(screen.getByText('Visite guidée — Étape 3 sur 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByRole('heading', { name: 'Revenez-y à tout moment' })).toBeTruthy();
    expect(
      screen.getByText(
        'Ouvrez l’aide pour reprendre cette visite, consulter la documentation ou contacter l’assistance.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readProductTourProgress(window.localStorage)).toEqual({ status: 'completed', step: 0 });
  });

  it('falls back to the complete English tour for an unsupported locale', async () => {
    renderWithLanguage('es', <ProductTour restartToken={0} />);

    expect(await screen.findByRole('dialog', { name: 'Navigate your workspace' })).toBeTruthy();
    expect(screen.getByText('Guided tour — Step 1 of 4')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close guided tour' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull();
  });
});
