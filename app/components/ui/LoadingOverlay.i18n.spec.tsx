/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingOverlay } from './LoadingOverlay';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('<LoadingOverlay /> i18n', () => {
  it('uses a localized default and switches language live', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <LoadingOverlay />
      </I18nextProvider>,
    );

    expect(screen.getByRole('status').textContent).toContain('Chargement…');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('status').textContent).toContain('Loading…');
  });

  it('preserves caller-provided progress copy and semantics', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <LoadingOverlay message="Synchronisation Git…" progress={42} progressText="42 %" />
      </I18nextProvider>,
    );

    expect(screen.getByText('Synchronisation Git…')).toBeTruthy();
    expect(screen.getByText(/42\s%/u)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
  });
});
