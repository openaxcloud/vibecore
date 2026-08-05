import { describe, expect, it } from 'vitest';

import {
  buildRemainingRouteMeta,
  getRemainingRouteShellsCopy,
  remainingRouteShellsEn,
  remainingRouteShellsFr,
} from './remaining-route-shells';

describe('remaining route shell catalog', () => {
  it('keeps exact English and French key parity with an English fallback', () => {
    expect(Object.keys(remainingRouteShellsFr).sort()).toEqual(Object.keys(remainingRouteShellsEn).sort());
    expect(getRemainingRouteShellsCopy('fr')['remainingRoutes.settings.title']).toBe('Paramètres - E-Code');
    expect(getRemainingRouteShellsCopy('de')['remainingRoutes.settings.title']).toBe('Settings - E-Code');
  });

  it('builds complete French SEO with canonical and alternate-language URLs', () => {
    const tags = buildRemainingRouteMeta({
      title: 'Paramètres - E-Code',
      description: 'Description française.',
      path: '/settings',
      language: 'fr',
      noindex: true,
    });

    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({ name: 'twitter:title', content: 'Paramètres - E-Code' });
    expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/settings' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/settings?lang=fr',
    });
    expect(tags).toContainEqual({ name: 'robots', content: 'noindex, nofollow' });
  });
});
