import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  getMarketingExactAboutContactCopy,
  marketingExactAboutContactEn,
  marketingExactAboutContactFr,
} from './marketing-exact-about-contact';
import {
  getMarketingExactPartnersBountiesCopy,
  marketingExactPartnersBountiesEn,
  marketingExactPartnersBountiesFr,
} from './marketing-exact-partners-bounties';

import About from '~/components/marketing/ecode-exact/pages/About';
import Bounties from '~/components/marketing/ecode-exact/pages/Bounties';
import Contact, { buildContactMailto, validateContactField } from '~/components/marketing/ecode-exact/pages/Contact';
import Partners from '~/components/marketing/ecode-exact/pages/Partners';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { meta as aboutMeta } from '~/routes/about';
import { meta as contactMeta } from '~/routes/contact';
import { meta as bountiesMeta } from '~/routes/marketing.bounties';
import { meta as partnersMeta } from '~/routes/partners';

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

describe('exact partners, bounties, contact and about catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactPartnersBountiesFr)).toEqual(leafPaths(marketingExactPartnersBountiesEn));
    expect(leafPaths(marketingExactAboutContactFr)).toEqual(leafPaths(marketingExactAboutContactEn));
  });

  it('falls back to English for unsupported locales', () => {
    expect(getMarketingExactPartnersBountiesCopy('de').exactPartners.hero.title).toBe('Partner with E-Code');
    expect(getMarketingExactAboutContactCopy('de').exactAbout.hero.badge).toBe('Our story');
  });

  it('localizes Contact validation and mailto copy without changing user content', () => {
    const copy = getMarketingExactAboutContactCopy('fr').exactContact;

    expect(validateContactField('email', '', copy.validation)).toBe('Saisissez votre adresse e-mail.');
    expect(validateContactField('email', 'incorrect', copy.validation)).toBe('Saisissez une adresse e-mail valide.');

    const decoded = decodeURIComponent(
      buildContactMailto(
        {
          name: 'Camille Martin',
          email: 'camille@exemple.fr',
          topic: 'Support',
          message: 'Mon espace de travail ne démarre pas.',
        },
        copy.mailto,
      ),
    );

    expect(decoded).toContain('subject=Message de Camille Martin');
    expect(decoded).toContain('Objet: Assistance');
    expect(decoded).toContain('Mon espace de travail ne démarre pas.');
    expect(decoded).not.toContain('Topic: Support');
  });

  it.each([
    [<Partners key="partners" />, 'Devenez partenaire E-Code', 'Pourquoi devenir partenaire', 'Partner with E-Code'],
    [
      <Bounties key="bounties" />,
      'missions rémunérées au résultat',
      'Un parcours maîtrisé, du cahier des charges à la prime',
      'outcome-based bounties',
    ],
    [<Contact key="contact" />, 'Contactez-nous', 'Envoyez-nous un message', 'Get in Touch'],
    [
      <About key="about" />,
      'Construire l’avenir de la création logicielle',
      'Ce qui fait la force d’E-Code',
      'Building the future of software creation',
    ],
  ])('renders every page in French without its English headline', (page, headline, supportingCopy, englishCopy) => {
    const markup = renderInFrench(page);

    expect(markup).toContain(headline);
    expect(markup).toContain(supportingCopy);
    expect(markup).not.toContain(englishCopy);
  });

  it('preserves brands, URLs and technical terminology', () => {
    const partners = renderInFrench(<Partners />);
    const bounties = renderInFrench(<Bounties />);
    const about = renderInFrench(<About />);

    expect(partners).toContain('GitHub');
    expect(partners).toContain('app.e-code.ai');
    expect(bounties).toContain('TypeScript');
    expect(about).toContain('GitLab');
    expect(about).toContain('commit');
  });

  it.each([
    [aboutMeta, 'À propos — E-Code'],
    [contactMeta, 'Contact — E-Code'],
    [partnersMeta, 'Partenaires — E-Code'],
    [bountiesMeta, 'Missions rémunérées — E-Code'],
  ])('serves localized French route metadata', (meta, title) => {
    const tags = meta({ data: { language: 'fr' } } as never);

    expect(tags).toEqual(expect.arrayContaining([{ title }]));
    expect(tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'description' })]));
  });
});
