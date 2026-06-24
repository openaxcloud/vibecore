/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionTestIndicator } from './ConnectionTestIndicator';

afterEach(() => {
  cleanup();
});

describe('ConnectionTestIndicator', () => {
  it('renders nothing when there is no test result', () => {
    const { container } = render(<ConnectionTestIndicator testResult={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('announces a successful result via a polite status live region', () => {
    render(<ConnectionTestIndicator testResult={{ status: 'success', message: 'Connected to Vercel' }} />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toContain('Connected to Vercel');
  });

  it('announces an in-progress (testing) result politely so it is not interrupted', () => {
    render(<ConnectionTestIndicator testResult={{ status: 'testing', message: 'Testing connection...' }} />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('Testing connection...');
  });

  it('announces an error result assertively via an alert live region', () => {
    render(<ConnectionTestIndicator testResult={{ status: 'error', message: 'Invalid token' }} />);

    const region = screen.getByRole('alert');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toContain('Invalid token');

    // It must not also expose the (default) status role.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
