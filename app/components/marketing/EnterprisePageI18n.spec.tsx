import { describe, expect, it } from 'vitest';
import { localizeMarketingPage, makeMarketingMeta, solutionPages } from './EcodeMarketingPages';

/*
 * /enterprise French coverage. The page content + SEO/OG metadata come from
 * solutionPages.enterprise, localized by localizeMarketingPage()/makeMarketingMeta()
 * via the marketing catalog. This proves the strict "zero English" audit no longer
 * has residuals on /enterprise: every English string the audit flagged is gone in
 * FR, the French copy is present, and switching back to English is unchanged.
 */

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenStrings);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }

  return [];
}

// The exact English residuals the strict audit reported on /enterprise.
const ENGLISH_RESIDUALS = [
  'What you can build',
  'Production workflow',
  'Code review',
  'Runtime preview',
  'Deployment path',
  'Prompt to project',
  'SSO and SCIM',
  'Audit export',
  'Private rollout',
  'Premium support',
  'Roll out E-Code',
  'gives teams a faster path',
  'inspectable, testable',
  'Start building',
  'Contact sales',
];

const FRENCH_EXPECTED = [
  'Ce que vous pouvez créer',
  'Flux de production',
  'Revue du code',
  'Aperçu de l’environnement d’exécution',
  'Parcours de déploiement',
  'Du prompt au projet',
  'Déployez E-Code',
  'Commencer à créer',
  'Contacter l’équipe commerciale',
];

function countResiduals(haystack: string): number {
  return ENGLISH_RESIDUALS.filter((needle) => haystack.includes(needle)).length;
}

describe('/enterprise — French i18n coverage', () => {
  const page = solutionPages.enterprise;

  it('BEFORE: the English source page carries the audit residuals', () => {
    const source = flattenStrings({
      title: page.title,
      description: page.description,
      highlights: page.highlights,
      sections: page.sections,
      primaryAction: page.primaryAction,
      secondaryAction: page.secondaryAction,
    }).join('\n');

    // Every flagged English residual is present in the untranslated source.
    expect(countResiduals(source)).toBe(ENGLISH_RESIDUALS.length);
  });

  it('AFTER (fr): ZERO English residual, French copy present', () => {
    const fr = localizeMarketingPage(page, 'fr');

    const frText = flattenStrings({
      title: fr.title,
      description: fr.description,
      highlights: fr.highlights,
      sections: fr.sections,
      primaryAction: fr.primaryAction,
      secondaryAction: fr.secondaryAction,
    }).join('\n');

    /*
     * "Enterprise" (offer name) and "Solutions" (eyebrow) legitimately stay; every
     * OTHER English residual must be gone.
     */
    expect(countResiduals(frText)).toBe(0);

    for (const french of FRENCH_EXPECTED) {
      expect(frText, french).toContain(french);
    }

    // Offer name preserved, not mistranslated.
    expect(fr.title).toBe('Enterprise');
  });

  it('bascule EN↔FR: English is unchanged when switching back', () => {
    const en = localizeMarketingPage(page, 'en');
    const enText = flattenStrings(en.sections).join('\n');
    expect(enText).toContain('What you can build');
    expect(enText).toContain('Production workflow');

    // FR resolves to French for the same page.
    expect(flattenStrings(localizeMarketingPage(page, 'fr').sections).join('\n')).toContain('Flux de production');
  });

  it('SEO/OG metadata is localized to French', () => {
    const descriptors = makeMarketingMeta(page)({
      data: undefined,
      matches: [{ id: 'root', data: { language: 'fr' } }],
    } as never) as Array<Record<string, unknown>>;

    const meta = JSON.stringify(descriptors);
    expect(meta).toContain('Déployez E-Code'); // FR description in <meta> + OG
    expect(meta).not.toContain('Roll out E-Code'); // no English residual in metadata
    expect(descriptors).toEqual(expect.arrayContaining([{ title: 'Enterprise - E-Code' }]));
  });
});
