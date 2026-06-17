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
      { title: 'System Status — VibeCore' },
      { name: 'description', content: 'VibeCore system status and uptime.' },
    ]);
  });
});
