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

    expect(metadata).toEqual([
      { title: 'System Status — E-Code' },
      { name: 'description', content: 'E-Code system status and uptime.' },
      { property: 'og:title', content: 'System Status — E-Code' },
      { property: 'og:description', content: 'E-Code system status and uptime.' },
      { property: 'og:image', content: 'https://e-code.ai/social_preview_index.jpg' },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'E-Code — build, ship and scale production applications with AI' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: 'https://e-code.ai/social_preview_index.jpg' },
      { name: 'twitter:image:alt', content: 'E-Code — build, ship and scale production applications with AI' },
    ]);
  });
});
