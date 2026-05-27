/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GitStatusBadge, GitStatusLegend } from './GitStatusBadge';

describe('<GitStatusBadge />', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows untracked Git porcelain status as U with an explicit tooltip', () => {
    render(<GitStatusBadge status="??" />);

    const badge = screen.getByLabelText(/Git status U = Untracked/i);

    expect(badge.textContent).toContain('U');
    expect(badge.textContent).not.toContain('??');
    expect(badge.getAttribute('title')).toContain('U = Untracked');
    expect(badge.getAttribute('title')).toContain('New file not added to Git yet');
  });

  it('renders a readable legend without exposing raw question-mark status codes', () => {
    render(<GitStatusLegend />);

    expect(screen.getByText('Status guide:')).toBeTruthy();
    expect(screen.getAllByText('Untracked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Modified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
    expect(screen.queryByText('??')).toBeNull();
  });
});
