/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast: toastMocks }));

import { ScreenshotSelector } from './ScreenshotSelector';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderSelector(language: 'en' | 'fr' = 'fr') {
  const i18n = createI18nInstance(language);
  const container = document.createElement('section');
  const containerRef = { current: container } as RefObject<HTMLElement>;

  const setIsSelectionMode = vi.fn();

  render(
    <I18nextProvider i18n={i18n}>
      <ScreenshotSelector isSelectionMode setIsSelectionMode={setIsSelectionMode} containerRef={containerRef} />
    </I18nextProvider>,
  );

  return { i18n, setIsSelectionMode };
}

afterEach(() => {
  cleanup();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.restoreAllMocks();
});

describe('ScreenshotSelector i18n', () => {
  it('announces French selection instructions and switches them live', async () => {
    const { i18n } = renderSelector();

    expect(screen.getByRole('application', { name: 'Sélectionner une zone à capturer' })).toBeTruthy();
    expect(screen.getByText(/Appuyez sur Échap pour annuler/u)).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('application', { name: 'Select an area to capture' })).toBeTruthy();
    expect(screen.getByText(/Press Escape to cancel/u)).toBeTruthy();
  });

  it('cancels selection with Escape', () => {
    const { setIsSelectionMode } = renderSelector();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(setIsSelectionMode).toHaveBeenCalledWith(false);
  });

  it('shows a safe localized toast when browser screen capture cannot start', async () => {
    const captureError = new Error('Browser leaked a private screen-capture diagnostic.');
    const getDisplayMedia = vi.fn().mockRejectedValue(captureError);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderSelector();

    const overlay = screen.getByRole('application', { name: 'Sélectionner une zone à capturer' });

    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(overlay, { clientX: 80, clientY: 60 });
    fireEvent.pointerUp(overlay);

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Impossible de démarrer la capture d’écran. Vérifiez l’autorisation du navigateur, puis réessayez.',
      );
    });

    expect(JSON.stringify(toastMocks.error.mock.calls)).not.toContain('private screen-capture diagnostic');
  });
});
