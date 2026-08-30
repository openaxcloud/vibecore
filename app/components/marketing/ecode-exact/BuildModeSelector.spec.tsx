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

describe('BuildModeSelector — sortie et hiérarchie visuelle', () => {
  /*
   * TACTILE-002 — en 390 le bouton « Fermer » valait 309x44 : une LIGNE ENTIÈRE
   * de la modale, 87 % de sa largeur, dépensée pour la sortie. Le test fige la
   * forme corrigée (croix ancrée, pas de `w-full`) plutôt qu'une largeur en
   * pixels, que jsdom ne calcule pas.
   */
  it('ferme par une croix ancrée, jamais par un bouton pleine largeur', () => {
    const { onOpenChange } = renderSelector();

    const close = screen.getByRole('button', { name: /close|fermer/i });

    expect(close.className).not.toMatch(/\bw-full\b/);
    expect(close.className).toMatch(/\bshrink-0\b/);
    // La cible tactile reste au-dessus du plancher de 44px.
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).toMatch(/\bw-11\b/);

    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('garde un nom accessible sur la croix, qui n’a plus de texte visible', () => {
    renderSelector();

    const close = screen.getByRole('button', { name: /close|fermer/i });

    expect(close.getAttribute('aria-label')).toBeTruthy();
  });

  /*
   * COULEUR-001 — chaque option portait sa propre teinte décorative (orange /
   * emeraude) qui n'encodait ni état, ni gravité, ni catégorie : cinq couleurs
   * saturées mesurées pour deux choix. Seule l'option RECOMMANDÉE porte
   * désormais l'accent ; l'autre est neutre.
   */
  it('ne peint plus les options avec des teintes décoratives arbitraires', () => {
    renderSelector();

    const dialog = screen.getByTestId('build-mode-selector-dialog');

    expect(dialog.innerHTML).not.toMatch(/emerald-/);
    expect(dialog.innerHTML).not.toMatch(/orange-(?:50|100|200|400|500|600|800)/);
  });

  it('réserve l’accent de marque à l’option recommandée', () => {
    renderSelector();

    const recommended = screen.getByTestId('build-option-full-app');
    const alternative = screen.getByTestId('build-option-design-first');

    // L'anneau de FOCUS garde l'accent sur les deux cartes — c'est une
    // affordance d'accessibilité, pas une décoration. Ce qui doit différer est
    // la BORDURE au repos.
    expect(recommended.className).toMatch(/border-\[var\(--ecode-accent\)\]/);
    expect(alternative.className).not.toMatch(/border-\[var\(--ecode-accent\)\]/);
    expect(alternative.className).toMatch(/\bborder-border\b/);
  });
});
