/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExamplePrompts } from './ExamplePrompts';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

describe('ExamplePrompts i18n', () => {
  it('switches suggestions live and submits the active localized prompt', async () => {
    const i18n = createI18nInstance('fr');
    const sendMessage = vi.fn();

    render(<I18nextProvider i18n={i18n}>{ExamplePrompts(sendMessage)}</I18nextProvider>);

    const frenchPrompt = screen.getByRole('button', {
      name: 'Créer une application mobile de suivi des entraînements',
    });
    fireEvent.click(frenchPrompt);
    expect(sendMessage.mock.calls[0][1]).toBe('Créer une application mobile de suivi des entraînements');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('button', { name: 'Create a mobile app for tracking workouts' })).toBeTruthy();
  });
});
