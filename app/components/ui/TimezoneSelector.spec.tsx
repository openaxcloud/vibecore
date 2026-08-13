/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimezoneSelector } from './TimezoneSelector';
import { isValidIanaTimeZone } from '~/lib/time-zones';

afterEach(cleanup);

function ControlledTimezoneSelector({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);

  return <TimezoneSelector value={value} onChange={setValue} />;
}

describe('TimezoneSelector', () => {
  it('loads IANA suggestions without changing the server-stable initial value', async () => {
    render(<ControlledTimezoneSelector initialValue="Europe/Paris" />);

    const input = screen.getByLabelText('Time zone') as HTMLInputElement;

    expect(input.value).toBe('Europe/Paris');
    await waitFor(() => expect(document.querySelector('option[value="America/New_York"]')).not.toBeNull());
    expect(input.className).toContain('h-[44px]');
  });

  it('surfaces an invalid free-form value before submission', () => {
    render(<ControlledTimezoneSelector />);

    const input = screen.getByLabelText('Time zone') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Paris time' } });
    fireEvent.blur(input);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Choose a valid IANA time zone.');
    expect(input.validationMessage).toBe('Choose a valid IANA time zone.');
  });

  it('applies the browser-detected time zone through an explicit action', async () => {
    const onChange = vi.fn();

    render(<TimezoneSelector value="" onChange={onChange} />);

    const button = screen.getByRole('button', { name: 'Use detected time zone' }) as HTMLButtonElement;

    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    expect(onChange).toHaveBeenCalledOnce();
    expect(isValidIanaTimeZone(String(onChange.mock.calls[0][0]))).toBe(true);
  });
});
