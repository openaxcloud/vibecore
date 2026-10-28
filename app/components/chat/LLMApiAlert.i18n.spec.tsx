/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LlmErrorAlert from './LLMApiAlert';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('<LlmErrorAlert /> i18n', () => {
  it('renders safe French authentication copy and preserves provider/model names', () => {
    const clearAlert = vi.fn();

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <LlmErrorAlert
          alert={{
            type: 'error',
            title: 'Raw server title',
            description: 'Raw upstream English stack trace',
            provider: 'OpenAI',
            errorType: 'authentication',
          }}
          clearAlert={clearAlert}
          alternativeModels={[{ name: 'gpt-5', label: 'GPT-5', provider: 'OpenAI' }]}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading').textContent).toBe('Erreur d’authentification');
    expect(screen.getByText('L’authentification auprès de OpenAI a échoué. Vérifiez votre clé API.')).toBeTruthy();
    expect(screen.queryByText('Raw server title')).toBeNull();
    expect(screen.queryByText('Raw upstream English stack trace')).toBeNull();
    expect(screen.getByRole('option', { name: 'GPT-5' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ouvrir les paramètres' }).getAttribute('href')).toBe('/settings');

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(clearAlert).toHaveBeenCalledTimes(1);
  });

  it('switches live to English and keeps quota actions non-retryable', async () => {
    const i18n = createI18nInstance('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <LlmErrorAlert
          alert={{
            type: 'error',
            title: '',
            description: '',
            errorType: 'quota',
          }}
          clearAlert={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(screen.getByRole('heading').textContent).toBe('Limite d’utilisation atteinte');
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voir le forfait et les limites' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('heading').textContent).toBe('Usage limit reached');
    expect(screen.getByRole('link', { name: 'View plan and limits' })).toBeTruthy();
  });
});
