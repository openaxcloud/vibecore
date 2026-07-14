/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { EcodeBootMark } from './EcodeBootMark';

afterEach(cleanup);

describe('EcodeBootMark', () => {
  it('ships both explicit theme layers as a self-contained inline SVG', () => {
    const { container } = render(<EcodeBootMark />);
    const mark = container.querySelector('svg[data-ecode-boot-mark]');

    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('data-theme-variant')).toBe('auto');
    expect(mark?.querySelector('[data-ecode-mark-variant="light"]')).not.toBeNull();
    expect(mark?.querySelector('[data-ecode-mark-variant="dark"]')).not.toBeNull();
    expect(mark?.querySelectorAll('linearGradient')).toHaveLength(2);
    expect(mark?.querySelectorAll('img, image, use, link')).toHaveLength(0);
    expect(mark?.querySelector('style')?.textContent).toContain('[data-theme="light"]');
    expect(mark?.querySelector('style')?.textContent).toContain('prefers-color-scheme: light');
  });

  it.each(['light', 'dark'] as const)('exposes the explicit %s variant through a stable selector', (theme) => {
    const { container } = render(<EcodeBootMark theme={theme} />);
    const mark = container.querySelector('svg[data-ecode-boot-mark]');

    expect(mark?.getAttribute('data-theme-variant')).toBe(theme);
    expect(mark?.querySelector(`[data-ecode-mark-variant="${theme}"]`)).not.toBeNull();
  });

  it('is decorative by default so a parent loading status is not announced twice', () => {
    const { container } = render(<EcodeBootMark />);
    const mark = container.querySelector('svg[data-ecode-boot-mark]');

    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.hasAttribute('role')).toBe(false);
    expect(mark?.querySelector('title')).toBeNull();
  });

  it('has an accessible name when rendered as a standalone brand image', () => {
    render(<EcodeBootMark label="E-Code" />);

    const mark = screen.getByRole('img', { name: 'E-Code' });
    const title = mark.querySelector('title');

    expect(title).not.toBeNull();
    expect(mark.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(mark.hasAttribute('aria-hidden')).toBe(false);
  });

  it('renders during SSR without an external asset reference', () => {
    const markup = renderToStaticMarkup(<EcodeBootMark theme="dark" label="E-Code" className="boot-logo" />);

    expect(markup).toContain('<svg');
    expect(markup).toContain('data-ecode-boot-mark=""');
    expect(markup).toContain('data-theme-variant="dark"');
    expect(markup).toContain('class="boot-logo"');
    expect(markup).not.toMatch(/<(?:img|image|use)\b/i);
    expect(markup).not.toMatch(/\b(?:href|src)=/i);
  });
});
