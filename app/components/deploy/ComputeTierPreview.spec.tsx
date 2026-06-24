/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ComputeTierPreview } from './ComputeTierPreview';

afterEach(cleanup);

describe('ComputeTierPreview', () => {
  it('always shows the inactive-until-infra preview note (no fake deploy)', () => {
    render(<ComputeTierPreview tier="autoscale" />);
    expect(screen.getByText(/activate once managed compute is provisioned/i)).toBeTruthy();
  });

  it('disables every lifecycle control until the tier is provisioned', () => {
    render(<ComputeTierPreview tier="reserved-vm" />);

    for (const label of ['Start', 'Stop', 'Restart']) {
      // Exact string match so "Start" does not also match "Restart".
      expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('live-validates the Scheduled cron field', () => {
    render(<ComputeTierPreview tier="scheduled" />);

    const input = screen.getByTestId('cron-input') as HTMLInputElement;

    // Default seed is valid.
    expect(screen.getByTestId('cron-feedback').textContent).toMatch(/valid schedule/i);

    // Invalid expression surfaces an error and marks the field invalid.
    fireEvent.change(input, { target: { value: '99 * * * *' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByTestId('cron-feedback').textContent).toMatch(/minute/i);

    // A preset restores a valid schedule.
    fireEvent.click(screen.getByText('Hourly'));
    expect(input.value).toBe('0 * * * *');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('only renders the cron field for the scheduled tier', () => {
    render(<ComputeTierPreview tier="autoscale" />);
    expect(screen.queryByTestId('cron-input')).toBeNull();
    expect(screen.getByTestId('autoscale-min')).toBeTruthy();
  });
});
