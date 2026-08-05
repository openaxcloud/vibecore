import { describe, expect, it } from 'vitest';

import { socialMetaTags } from './social-meta';

describe('socialMetaTags', () => {
  it('uses the localized title as the default social image alternative', () => {
    const tags = socialMetaTags({
      title: 'Créez, déployez et faites évoluer vos applications avec E-Code',
      description: 'Une plateforme de développement complète.',
    });

    expect(tags).toContainEqual({
      property: 'og:image:alt',
      content: 'Créez, déployez et faites évoluer vos applications avec E-Code',
    });
    expect(tags).toContainEqual({
      name: 'twitter:image:alt',
      content: 'Créez, déployez et faites évoluer vos applications avec E-Code',
    });
  });

  it('accepts a specific localized alternative when the artwork needs more context', () => {
    const tags = socialMetaTags({
      title: 'Tarifs E-Code',
      description: 'Comparez les offres.',
      imageAlt: 'Aperçu des offres E-Code',
    });

    expect(tags).toContainEqual({ property: 'og:image:alt', content: 'Aperçu des offres E-Code' });
  });
});
