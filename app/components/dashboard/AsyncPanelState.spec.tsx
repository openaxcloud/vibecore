/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncPanelError, AsyncPanelSkeleton } from './AsyncPanelState';

afterEach(cleanup);

describe('user-area async panel states', () => {
  it('announces a stable loading skeleton without exposing decorative rows', () => {
    render(<AsyncPanelSkeleton label="Loading project activity" rows={2} />);

    const status = screen.getByRole('status', { name: 'Loading project activity' });
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading project activity').className).toContain('sr-only');
  });

  it('explains a recoverable failure and runs the retry action', () => {
    const onRetry = vi.fn();
    render(
      <AsyncPanelError
        title="Projects could not load"
        description="Your projects are unchanged. Try loading them again."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('locks retry while a new request is running', () => {
    render(
      <AsyncPanelError
        title="Notifications unavailable"
        description="No notification was deleted."
        onRetry={() => undefined}
        retrying
      />,
    );

    const button = screen.getByRole('button', { name: 'Retrying…' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.className).toContain('min-h-[44px]');
  });

  it('keeps compact errors stacked inside narrow panels at desktop breakpoints', () => {
    render(
      <AsyncPanelError
        title="Notifications unavailable"
        description="Your notifications are unchanged."
        onRetry={() => undefined}
        compact
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.className).not.toContain('sm:flex-row');
  });
});
