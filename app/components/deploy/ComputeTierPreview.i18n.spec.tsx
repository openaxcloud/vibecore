/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { ComputeTierPreview } from './ComputeTierPreview';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

function renderInFrench(tier: 'autoscale' | 'reserved-vm' | 'scheduled') {
  const i18n = createI18nInstance('fr');

  return render(
    <I18nextProvider i18n={i18n}>
      <ComputeTierPreview tier={tier} />
    </I18nextProvider>,
  );
}

describe('ComputeTierPreview i18n', () => {
  it('renders and validates a scheduled tier entirely in French without changing cron values', () => {
    renderInFrench('scheduled');

    expect(screen.getByText(/Aperçu — ces commandes s’activeront/)).toBeTruthy();
    expect(screen.getByText('Planification (cron)')).toBeTruthy();
    expect(screen.getByTestId('cron-feedback').textContent).toMatch(/Planification valide/);

    const input = screen.getByTestId('cron-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99 * * * *' } });
    expect(screen.getByRole('alert').textContent).toBe('minute\u00a0: 99 est hors de la plage autorisée (0–59).');

    fireEvent.click(screen.getByRole('button', { name: 'Toutes les heures' }));
    expect(input.value).toBe('0 * * * *');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(document.body.textContent).not.toMatch(/Valid schedule|Every 15 minutes|No runs yet/);
  });

  it('localizes machine labels while preserving stable option identifiers and technical units', () => {
    renderInFrench('reserved-vm');

    const select = screen.getByTestId('reserved-size') as HTMLSelectElement;
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];

    expect(screen.getByText('Taille de la machine')).toBeTruthy();
    expect(options.map((option) => option.value)).toEqual(['shared', 'small', 'medium', 'large']);
    expect(options.map((option) => option.textContent)).toEqual([
      'Partagée · 0,5 vCPU / 1\u00a0Go',
      'Petite · 1 vCPU / 2\u00a0Go',
      'Moyenne · 2 vCPU / 4\u00a0Go',
      'Grande · 4 vCPU / 8\u00a0Go',
    ]);
    expect(select.value).toBe('small');
  });

  it('localizes lifecycle and autoscale errors with touch-sized controls', () => {
    renderInFrench('autoscale');

    const restart = screen.getByRole('button', { name: 'Redémarrer' });
    expect(restart.hasAttribute('disabled')).toBe(true);
    expect(restart.getAttribute('title')).toBe('Disponible après le provisionnement de cette offre');
    expect(restart.className).toContain('min-h-11');

    fireEvent.change(screen.getByTestId('autoscale-min'), { target: { value: '4' } });
    expect(screen.getByRole('alert').textContent).toMatch(/nombre maximal d’instances/);
    expect(document.body.textContent).not.toMatch(/Min instances|Lifecycle|No activity yet/);
  });
});
