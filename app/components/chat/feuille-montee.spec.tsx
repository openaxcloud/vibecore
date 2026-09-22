/**
 * @vitest-environment jsdom
 */

/*
 * La garde du MONTAGE.
 *
 * Défaut mesuré le 2026-09-22 : `FeuilleDesModes.tsx` était sur `main`, complet,
 * testé à 16 tests verts — et importé par RIEN. `grep -rn FeuilleDesModes app/`
 * ne rendait que le fichier lui-même. Le panneau existait sans être servi au
 * navigateur : tous ses tests passaient, et Avi voyait l'ancien panneau.
 *
 * Aucun test de composant n'attrape ça, par construction : un test de
 * `FeuilleDesModes` rend `FeuilleDesModes`. Il faut partir du composant que
 * l'application monte réellement — `AgentPowerControls` en variante compacte,
 * celle du téléphone — et vérifier que la feuille apparaît dedans.
 *
 * C'est la règle 15 : le correctif est juste, mais sans cette garde rien
 * n'empêche de le défaire.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentPowerControls, type AgentPowerControlsValue } from './AgentPowerControls';
import { CLE_CHOIX_DE_MODELE } from './choix-de-modele';

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

const VALEUR: AgentPowerControlsValue = {
  highEffort: false,
  highPowerModel: false,
  extendedThinking: false,
  turboMode: false,
  buildTier: 'max',
};

function poser(valeur: Partial<AgentPowerControlsValue> = {}) {
  const suivi: AgentPowerControlsValue[] = [];

  render(
    <AgentPowerControls
      value={{ ...VALEUR, ...valeur }}
      onChange={(next) => suivi.push(next)}
      variant="compact"
      estimatedCents={12}
    />,
  );

  fireEvent.click(screen.getByTestId('agent-mode-advanced'));

  return { suivi };
}

describe('la feuille des modes est montée dans le composeur du téléphone', () => {
  it('ouvrir le panneau compact montre les trois lignes de mode de la feuille', () => {
    poser();

    for (const mode of ['lite', 'power', 'max']) {
      expect(screen.getByTestId(`feuille-mode-${mode}`)).toBeTruthy();
    }
  });

  it('le second écran s’atteint, et le chevron de retour ramène au premier', () => {
    poser();

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));
    expect(screen.getByTestId('feuille-retour')).toBeTruthy();
    expect(screen.queryByTestId('feuille-mode-lite')).toBeNull();

    fireEvent.click(screen.getByTestId('feuille-retour'));
    expect(screen.getByTestId('feuille-mode-lite')).toBeTruthy();
  });

  it('en Lite, les deux entrées de réglage restent verrouillées', () => {
    poser({ buildTier: 'lite' });

    for (const sorte of ['modele', 'avance']) {
      const entree = screen.getByTestId(`feuille-entree-${sorte}`);
      expect(entree.getAttribute('data-verrouillee')).toBe('true');
      expect((entree as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('l’écran avancé porte les interrupteurs de l’appelant, pas une copie', () => {
    poser();

    fireEvent.click(screen.getByTestId('feuille-entree-avance'));

    expect(screen.getByTestId('agent-switch-high-effort')).toBeTruthy();
    expect(screen.getByTestId('agent-switch-turbo')).toBeTruthy();
  });

  it('choisir un modèle le PERSISTE — sinon le réglage serait décoratif', () => {
    poser();

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const ligne = screen.getAllByRole('radio').find((l) => l.getAttribute('data-etat') === 'inconnu');
    expect(ligne).toBeTruthy();
    fireEvent.click(ligne!);

    const brut = window.localStorage.getItem(CLE_CHOIX_DE_MODELE);
    expect(brut).toBeTruthy();
    expect(JSON.parse(brut!).max?.modele).toBeTruthy();
  });
});
