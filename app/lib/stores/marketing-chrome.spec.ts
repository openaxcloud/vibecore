/**
 * @vitest-environment jsdom
 *
 * Regression test for the SPA-navigation chrome leak: the inline boot script in
 * app/root.tsx applies data-ecode-public-chrome="homepage" + font-size:16px on
 * a marketing first paint, but never re-runs on client-side navigation. Without
 * reconcileMarketingChrome(), navigating into an app route (/dashboard,
 * /projects/:id/ide) leaves the 16px marketing root scale + homepage attribute
 * stuck, corrupting the IDE's intended 13px root type scale.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { reconcileMarketingChrome } from './marketing-chrome';

function root() {
  return document.documentElement;
}

afterEach(() => {
  root().removeAttribute('data-ecode-public-chrome');
  root().style.fontSize = '';
});

describe('reconcileMarketingChrome', () => {
  it('applies marketing chrome on a public marketing path', () => {
    reconcileMarketingChrome('/');

    expect(root().getAttribute('data-ecode-public-chrome')).toBe('homepage');
    expect(root().style.fontSize).toBe('16px');
  });

  it('applies marketing chrome on a prefixed marketing path', () => {
    reconcileMarketingChrome('/pricing');
    expect(root().getAttribute('data-ecode-public-chrome')).toBe('homepage');

    reconcileMarketingChrome('/blog/some-post');
    expect(root().getAttribute('data-ecode-public-chrome')).toBe('homepage');
    expect(root().style.fontSize).toBe('16px');
  });

  it('clears the leaked marketing chrome when navigating into an app route', () => {
    // Simulate the boot script having set marketing chrome on first paint.
    root().setAttribute('data-ecode-public-chrome', 'homepage');
    root().style.fontSize = '16px';

    // SPA navigation into the IDE.
    reconcileMarketingChrome('/projects/abc123/ide');

    expect(root().hasAttribute('data-ecode-public-chrome')).toBe(false);
    expect(root().style.fontSize).toBe('');
  });

  it('clears marketing chrome on a plain app route too', () => {
    root().setAttribute('data-ecode-public-chrome', 'homepage');
    root().style.fontSize = '16px';

    reconcileMarketingChrome('/dashboard');

    expect(root().hasAttribute('data-ecode-public-chrome')).toBe(false);
    expect(root().style.fontSize).toBe('');
  });

  it('is idempotent across repeated navigations', () => {
    reconcileMarketingChrome('/');
    reconcileMarketingChrome('/dashboard');
    reconcileMarketingChrome('/');

    expect(root().getAttribute('data-ecode-public-chrome')).toBe('homepage');
    expect(root().style.fontSize).toBe('16px');

    reconcileMarketingChrome('/dashboard');
    expect(root().hasAttribute('data-ecode-public-chrome')).toBe(false);
    expect(root().style.fontSize).toBe('');
  });
});
