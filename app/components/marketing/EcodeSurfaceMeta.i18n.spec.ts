import { describe, expect, it } from 'vitest';

import { createProjectImportSurfacePage, getEcodeSurfacePage, makeEcodeSurfaceMetaTags } from './EcodeSurfacePages';
import { getMarketingSurfaceDynamicPageCopy } from '~/lib/i18n/catalogs/marketing-surface-dynamic';
import { getMarketingSurfacePageCopy } from '~/lib/i18n/catalogs/marketing-surface-pages';

describe('E-Code surface metadata i18n', () => {
  it('uses the localized static-page catalog with canonical and hreflang tags', () => {
    const page = getEcodeSurfacePage('home');

    expect(page).toBeTruthy();

    const tags = makeEcodeSurfaceMetaTags(page!, 'fr');
    const french = getMarketingSurfacePageCopy('fr', 'home');

    expect(tags).toContainEqual({ title: `${french?.title} - E-Code` });
    expect(tags).toContainEqual({ name: 'description', content: french?.description });
    expect(tags).toContainEqual({ property: 'og:locale', content: 'fr_FR' });
    expect(tags).toContainEqual({ tagName: 'link', rel: 'canonical', href: 'https://e-code.ai/home' });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: 'https://e-code.ai/home?lang=fr',
    });
  });

  /*
   * Ce test garde la MÉTADONNÉE DYNAMIQUE : traduite, et conservant
   * l'identifiant du projet dans l'URL canonique comme dans les balises.
   *
   * Il passait par la fabrique « preview », retirée avec la brochure que
   * `/projects/:id/preview` servait. Le véhicule change, la garde ne change
   * pas : `createProjectImportSurfacePage` est la fabrique dynamique qui
   * SURVIT — elle décrit une source d'import réelle et validée (elle lève un
   * 404 sur une source inconnue), là où les autres décrivaient des entités
   * inexistantes.
   */
  it('localizes dynamic project metadata while preserving the project identifier', () => {
    const page = createProjectImportSurfacePage('project_customer_42', 'bolt');
    const french = getMarketingSurfaceDynamicPageCopy('fr', page.dynamicCopy!);
    const tags = makeEcodeSurfaceMetaTags(page, 'fr');

    expect(tags).toContainEqual({ title: `${french.title} - E-Code` });
    expect(tags).toContainEqual({ name: 'twitter:description', content: french.description });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/projects/project_customer_42/import/bolt',
    });
    expect(JSON.stringify(tags)).toContain('project_customer_42');
  });

  it('falls back to the English catalog for unsupported locales', () => {
    const page = getEcodeSurfacePage('home')!;

    expect(makeEcodeSurfaceMetaTags(page, 'de')[0]).toEqual({ title: `${page.title} - E-Code` });
  });
});
