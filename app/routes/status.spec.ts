import { describe, expect, it } from 'vitest';

import StatusRoute, { meta } from './status';
import StatusPage from '~/components/marketing/ecode-exact/pages/StatusPage';

describe('status public route', () => {
  it('renders the public status page component', () => {
    const element = StatusRoute();

    expect(element.type).toBe(StatusPage);
  });

  it('keeps status metadata public and specific', () => {
    const metadata = meta({} as Parameters<typeof meta>[0]);

    /*
     * Sans données de loader, la langue retombe sur l'anglais : ce cas fige la
     * sortie EN. `og:description` reprend la description du catalogue (et non
     * une variante figée à part) — c'est ce que consomme `socialMetaTags`.
     */
    expect(metadata).toEqual([
      { title: 'System Status — E-Code' },
      { name: 'description', content: 'Check the live status, uptime and recent incidents for E-Code services.' },
      { property: 'og:title', content: 'System Status — E-Code' },
      {
        property: 'og:description',
        content: 'Check the live status, uptime and recent incidents for E-Code services.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'E-Code' },
      { property: 'og:image', content: 'https://e-code.ai/social_preview_index.jpg' },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'E-Code system status and service availability' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'System Status — E-Code' },
      {
        name: 'twitter:description',
        content: 'Check the live status, uptime and recent incidents for E-Code services.',
      },
      { name: 'twitter:image', content: 'https://e-code.ai/social_preview_index.jpg' },
      { name: 'twitter:image:alt', content: 'E-Code system status and service availability' },
    ]);

    /*
     * This list used to end with a SECOND `twitter:title` and `twitter:description`
     * — the route re-declared what it already spread from `socialMetaTags()`, and
     * this assertion froze that duplication as expected behaviour. Every public
     * page shipped both tags twice, which is what kept the "French i18n live
     * audit" workflow red on every pull request.
     */
    expect(metadata.filter((tag) => 'name' in tag && tag.name === 'twitter:title')).toHaveLength(1);
    expect(metadata.filter((tag) => 'name' in tag && tag.name === 'twitter:description')).toHaveLength(1);
    expect(metadata.filter((tag) => 'property' in tag && tag.property === 'og:type')).toHaveLength(1);
  });
});
