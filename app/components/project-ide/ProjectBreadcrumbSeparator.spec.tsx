/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectBreadcrumbSeparator } from './ProjectBreadcrumbSeparator';

describe('<ProjectBreadcrumbSeparator />', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses a compact chevron separator instead of an orphan slash', () => {
    render(<ProjectBreadcrumbSeparator />);

    const separator = screen.getByTestId('project-breadcrumb-separator');

    expect(separator.textContent).toBe('›');
    expect(separator.textContent).not.toBe('/');
    expect(separator.getAttribute('aria-hidden')).toBe('true');
  });
});
