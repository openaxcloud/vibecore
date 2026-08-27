import { describe, expect, it } from 'vitest';

import {
  MARKETING_SHELL_COPY,
  MARKETING_SHELL_FOOTER_COLUMN_IDS,
  MARKETING_SHELL_FOOTER_SECTIONS,
  MARKETING_SHELL_LINKS,
  MARKETING_SHELL_NAV_SECTIONS,
  MARKETING_SHELL_SOCIAL_LINKS,
  interpolateMarketingShellCopy,
  type MarketingShellInterpolationValue,
} from './marketing-shell.copy';
import { SUPPORTED_LANGUAGES } from '~/lib/i18n/language';

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

describe('marketing shell copy contract', () => {
  const navIds = Object.values(MARKETING_SHELL_NAV_SECTIONS).flat();
  const footerIds = Object.values(MARKETING_SHELL_FOOTER_SECTIONS).flat();

  it('covers every supported language with a complete strict dictionary', () => {
    expect(Object.keys(MARKETING_SHELL_COPY)).toEqual([...SUPPORTED_LANGUAGES]);

    for (const language of SUPPORTED_LANGUAGES) {
      const copy = MARKETING_SHELL_COPY[language];

      expect(sorted(Object.keys(copy.navigation.items))).toEqual(sorted(navIds));
      expect(sorted(Object.keys(copy.navigation.sectionLabels))).toEqual(
        sorted(Object.keys(MARKETING_SHELL_NAV_SECTIONS)),
      );
      expect(sorted(Object.keys(copy.footer.linkLabels))).toEqual(sorted(footerIds));
      expect(sorted(Object.keys(copy.footer.columnLabels))).toEqual(sorted(MARKETING_SHELL_FOOTER_COLUMN_IDS));
      expect(copy.footer.assurances).toHaveLength(3);

      for (const text of collectStrings(copy)) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the four navigation groups at 38 unique entries', () => {
    expect(MARKETING_SHELL_NAV_SECTIONS.product).toHaveLength(12);
    expect(MARKETING_SHELL_NAV_SECTIONS.solutions).toHaveLength(9);
    expect(MARKETING_SHELL_NAV_SECTIONS.resources).toHaveLength(11);
    expect(MARKETING_SHELL_NAV_SECTIONS.company).toHaveLength(6);
    expect(navIds).toHaveLength(38);
    expect(new Set(navIds).size).toBe(38);
  });

  it('keeps the footer at 46 unique links with the expected column sizes', () => {
    expect(MARKETING_SHELL_FOOTER_SECTIONS.product).toHaveLength(13);
    expect(MARKETING_SHELL_FOOTER_SECTIONS.resources).toHaveLength(8);
    expect(MARKETING_SHELL_FOOTER_SECTIONS.company).toHaveLength(5);
    expect(MARKETING_SHELL_FOOTER_SECTIONS.legal).toHaveLength(15);
    expect(MARKETING_SHELL_FOOTER_SECTIONS.compare).toHaveLength(5);
    expect(footerIds).toHaveLength(46);
    expect(new Set(footerIds).size).toBe(46);
  });

  it('keeps route and social destinations separate from translated labels', () => {
    for (const destination of Object.values(MARKETING_SHELL_LINKS)) {
      expect(destination.href).toMatch(/^\/[A-Za-z0-9#/_-]*$/);
      expect(destination.href).toBe(destination.href.trim());
    }

    for (const social of Object.values(MARKETING_SHELL_SOCIAL_LINKS)) {
      expect(social.href).toMatch(/^https:\/\//);
      expect(social.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('provides natural localized chrome instead of falling back to English', () => {
    expect(MARKETING_SHELL_COPY.fr.navigation.items.appBuilder.title).toBe('Créateur d’applications');
    expect(MARKETING_SHELL_COPY.es.navigation.items.dashboardBuilder.title).toBe('Creador de paneles');
    expect(MARKETING_SHELL_COPY.ar.navigation.items.internalAiBuilder.title).toBe('منشئ الذكاء الاصطناعي الداخلي');
    expect(MARKETING_SHELL_COPY.fr.newsletter.subscribe).toBe('S’inscrire');
    expect(MARKETING_SHELL_COPY.es.theme.switchToDark).toBe('Cambiar al tema oscuro');
    expect(MARKETING_SHELL_COPY.ar.a11y.skipToContent).toBe('الانتقال إلى المحتوى');
  });

  it('uses the approved French product terminology consistently', () => {
    const frenchCopy = MARKETING_SHELL_COPY.fr;

    expect(frenchCopy.navigation.items.polyglotBackends).toEqual({
      title: 'Services applicatifs polyglottes',
      description:
        'Générez et exécutez des services applicatifs dans les langages courants avec des journaux en direct.',
    });
    expect(frenchCopy.navigation.items.deployments.description).toContain('journaux');
    expect(frenchCopy.navigation.items.appBuilder.description).toBe(
      'Transformez un processus métier en application complète et opérationnelle.',
    );
    expect(frenchCopy.navigation.items.marketplace.title).toBe('Place de marché');
    expect(frenchCopy.footer.linkLabels.polyglotBackends).toBe('Services applicatifs polyglottes');
    expect(frenchCopy.footer.linkLabels.marketplace).toBe('Place de marché');
    expect(collectStrings(frenchCopy).join('\n')).not.toMatch(/\b(?:backends?|logs?|marketplace|full-stack)\b/i);
  });

  it('keeps each announcement accessible name aligned with its visible label', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const { ctaAriaLabel, ctaLabel } = MARKETING_SHELL_COPY[language].announcement;

      expect(ctaAriaLabel).toContain(ctaLabel);
    }
  });

  it('avoids speculative specification tone and fabricated proof', () => {
    const allCopy = collectStrings(MARKETING_SHELL_COPY).join('\n');

    expect(allCopy).not.toMatch(/\bshould be\b|\bcan be\b|\bis designed to\b/i);
    expect(allCopy).not.toMatch(/\b\d{1,3}(?:[,.]\d{3})+\s+(?:companies|customers|teams)\b/i);
  });
});

describe('interpolateMarketingShellCopy', () => {
  it('interpolates repeated plain-text tokens without evaluating replacement syntax', () => {
    expect(interpolateMarketingShellCopy('{network} / {network}', { network: '$&<GitHub>' })).toBe(
      '$&<GitHub> / $&<GitHub>',
    );
    expect(interpolateMarketingShellCopy('© {year} E-Code', { year: 2026 })).toBe('© 2026 E-Code');
  });

  it('formats every localized social and copyright template', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const copy = MARKETING_SHELL_COPY[language];

      expect(
        interpolateMarketingShellCopy(copy.a11y.socialLinkTemplate, {
          network: MARKETING_SHELL_SOCIAL_LINKS.github.name,
        }),
      ).toContain('GitHub');
      expect(interpolateMarketingShellCopy(copy.footer.copyrightTemplate, { year: 2026 })).toContain('2026');
    }
  });

  it('rejects missing, unused, malformed, empty, inherited, and non-finite values', () => {
    expect(() => interpolateMarketingShellCopy('Hello {name}', {})).toThrow(/Missing/);
    expect(() => interpolateMarketingShellCopy('Hello', { name: 'Avi' })).toThrow(/Unused/);
    expect(() => interpolateMarketingShellCopy('Hello {name', { name: 'Avi' })).toThrow(/Malformed/);
    expect(() => interpolateMarketingShellCopy('Hello {name}', { name: '   ' })).toThrow(/Empty/);
    expect(() => interpolateMarketingShellCopy('Year {year}', { year: Number.NaN })).toThrow(/Invalid/);

    const inherited = Object.create({ name: 'Avi' }) as Readonly<Record<string, MarketingShellInterpolationValue>>;

    expect(() => interpolateMarketingShellCopy('Hello {name}', inherited)).toThrow(/Missing/);
  });
});
