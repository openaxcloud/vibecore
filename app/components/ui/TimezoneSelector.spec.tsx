/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimezoneSelector } from './TimezoneSelector';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { isValidIanaTimeZone } from '~/lib/time-zones';

afterEach(cleanup);

function ControlledTimezoneSelector({ initialValue = '' }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);

  return <TimezoneSelector value={value} onChange={setValue} />;
}

function renderEnglish(node: ReactNode) {
  return render(<I18nextProvider i18n={createI18nInstance('en')}>{node}</I18nextProvider>);
}

describe('TimezoneSelector', () => {
  it('loads IANA suggestions without changing the server-stable initial value', async () => {
    renderEnglish(<ControlledTimezoneSelector initialValue="Europe/Paris" />);

    const input = screen.getByLabelText('Time zone') as HTMLInputElement;

    expect(input.value).toBe('Europe/Paris');
    await waitFor(() => expect(document.querySelector('option[value="America/New_York"]')).not.toBeNull());
    expect(input.className).toContain('h-[44px]');
  });

  it('surfaces an invalid free-form value before submission', () => {
    renderEnglish(<ControlledTimezoneSelector />);

    const input = screen.getByLabelText('Time zone') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Paris time' } });
    fireEvent.blur(input);

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Choose a valid IANA time zone.');
    expect(input.validationMessage).toBe('Choose a valid IANA time zone.');
  });

  it('applies the browser-detected time zone through an explicit action', async () => {
    const onChange = vi.fn();

    renderEnglish(<TimezoneSelector value="" onChange={onChange} />);

    const button = screen.getByRole('button', { name: 'Use detected time zone' }) as HTMLButtonElement;

    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    expect(onChange).toHaveBeenCalledOnce();
    expect(isValidIanaTimeZone(String(onChange.mock.calls[0][0]))).toBe(true);
  });

  it('localizes labels, validation, detection and browser validity in French', async () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <ControlledTimezoneSelector />
      </I18nextProvider>,
    );

    const input = screen.getByLabelText('Fuseau horaire') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBe('Rechercher un fuseau horaire');
    expect(screen.getByText(/Détection du fuseau horaire|Détecté/u)).toBeTruthy();

    fireEvent.change(input, { target: { value: 'heure de Paris' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert').textContent).toBe('Choisissez un fuseau horaire IANA valide.');
    expect(input.validationMessage).toBe('Choisissez un fuseau horaire IANA valide.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Utiliser le fuseau horaire détecté' })).toBeTruthy(),
    );
  });
});
