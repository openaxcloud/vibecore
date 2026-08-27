/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildModeSelector } from './EcodeExactLandingControls';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

function renderSelector(overrides: Partial<Parameters<typeof BuildModeSelector>[0]> = {}, language = 'en') {
  const onOpenChange = vi.fn();
  const onSelectMode = vi.fn();

  render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <BuildModeSelector open onOpenChange={onOpenChange} onSelectMode={onSelectMode} {...overrides} />
    </I18nextProvider>,
  );

  return { onOpenChange, onSelectMode };
}

describe('BuildModeSelector dismissal', () => {
  it('dismisses when pressing Escape', () => {
    const { onOpenChange } = renderSelector();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss on unrelated keys', () => {
    const { onOpenChange } = renderSelector();

    fireEvent.keyDown(document, { key: 'a' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('dismisses when clicking the backdrop overlay itself', () => {
    const { onOpenChange } = renderSelector();

    const overlay = screen.getByTestId('build-mode-selector-dialog');
    fireEvent.click(overlay);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not dismiss when clicking inside the dialog panel', () => {
    const { onOpenChange } = renderSelector();

    const option = screen.getByTestId('build-option-design-first');
    fireEvent.click(option);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not register an Escape listener while closed', () => {
    const { onOpenChange } = renderSelector({ open: false });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders every mode, plural and control in professional French while preserving the project name', () => {
    renderSelector({ featureList: ['auth', 'billing'], projectName: 'Atlas API' }, 'fr');

    expect(screen.getByRole('heading', { name: 'Comment souhaitez-vous continuer ?' })).toBeTruthy();
    expect(screen.getByText('Atlas API:')).toBeTruthy();
    expect(screen.getByText('Liste de fonctionnalités créée')).toBeTruthy();
    expect(screen.getByText('2 fonctionnalités')).toBeTruthy();
    expect(screen.getByText('Commencer par le design')).toBeTruthy();
    expect(screen.getByText('Créer l’application complète')).toBeTruthy();
    expect(screen.getByText('Environ 3 minutes')).toBeTruthy();
    expect(screen.getByText('Continuer à préciser le prompt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
    expect(screen.queryByText('How would you like to continue?')).toBeNull();
  });
});
