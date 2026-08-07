import { describe, expect, it } from 'vitest';

import { createProjectPreviewSurfacePage, getEcodeSurfacePage, makeEcodeSurfaceMetaTags } from './EcodeSurfacePages';
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

  it('localizes dynamic project metadata while preserving the project identifier', () => {
    const page = createProjectPreviewSurfacePage('project_customer_42');
    const french = getMarketingSurfaceDynamicPageCopy('fr', page.dynamicCopy!);
    const tags = makeEcodeSurfaceMetaTags(page, 'fr');

    expect(tags).toContainEqual({ title: `${french.title} - E-Code` });
    expect(tags).toContainEqual({ name: 'twitter:description', content: french.description });
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://e-code.ai/projects/project_customer_42/preview',
    });
    expect(JSON.stringify(tags)).toContain('project_customer_42');
  });

  it('falls back to the English catalog for unsupported locales', () => {
    const page = getEcodeSurfacePage('home')!;

    expect(makeEcodeSurfaceMetaTags(page, 'de')[0]).toEqual({ title: `${page.title} - E-Code` });
  });
});
