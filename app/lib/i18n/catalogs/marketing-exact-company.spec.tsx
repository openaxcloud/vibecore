import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactCompanyCopy,
  marketingExactCompanyEn,
  marketingExactCompanyFr,
} from './marketing-exact-company';

import Careers from '~/components/marketing/ecode-exact/pages/Careers';
import ContactSales, {
  buildContactSalesMailto,
  validateContactSalesField,
} from '~/components/marketing/ecode-exact/pages/ContactSales';
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

describe('exact company marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactCompanyFr)).toEqual(leafPaths(marketingExactCompanyEn));
  });

  it('falls back to English and exposes professional French validation copy', () => {
    expect(getMarketingExactCompanyCopy('de').exactCareers.hero.title).toBe('Build the future with us');

    const french = getMarketingExactCompanyCopy('fr').exactContactSales;

    expect(validateContactSalesField('email', '', french.validation)).toBe(
      'Saisissez votre adresse e-mail professionnelle.',
    );
    expect(validateContactSalesField('email', 'incorrect', french.validation)).toBe(
      'Saisissez une adresse e-mail valide.',
    );
  });

  it('builds a fully localized French sales mailto', () => {
    const french = getMarketingExactCompanyCopy('fr').exactContactSales;

    const decoded = decodeURIComponent(
      buildContactSalesMailto(
        {
          name: 'Camille Martin',
          email: 'camille@entreprise.fr',
          company: 'Entreprise SAS',
          teamSize: '51–200',
          message: 'Nous souhaitons une instance dédiée.',
          pagePath: '/contact-sales',
        },
        french.mailto,
      ),
    );

    expect(decoded).toContain('subject=Demande E-Code Enterprise — Entreprise SAS');
    expect(decoded).toContain('E-mail professionnel: camille@entreprise.fr');
    expect(decoded).toContain('Taille de l’équipe: 51–200');
    expect(decoded).not.toContain('Work email:');
  });

  it('renders Careers in French without its English headline', () => {
    const markup = renderInFrench(<Careers />);

    expect(markup).toContain('Construisez l’avenir avec nous');
    expect(markup).toContain('Pourquoi vous aimerez travailler ici');
    expect(markup).toContain('Ingénieur·e plateforme IA');
    expect(markup).not.toContain('Build the future with us');
  });

  it('renders Contact Sales in French without its English headline', () => {
    const markup = renderInFrench(<ContactSales />);

    expect(markup).toContain('Parlez à notre équipe commerciale');
    expect(markup).toContain('Conçu pour les entreprises');
    expect(markup).toContain('Sélectionnez la taille de l’équipe');
    expect(markup).not.toContain('Talk to our sales team');
  });

  it('preserves brands and technical identifiers', () => {
    const careers = renderInFrench(<Careers />);
    const contactSales = renderInFrench(<ContactSales />);

    expect(careers).toContain('Kubernetes');
    expect(contactSales).toContain('SSO');
    expect(contactSales).toContain('SAML');
    expect(contactSales).toContain('SCIM');
  });
});
