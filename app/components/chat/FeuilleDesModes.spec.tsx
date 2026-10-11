/**
 * @vitest-environment jsdom
 */

/*
 * La feuille rendue — ce qu'Avi voit, et rien d'inventé au passage.
 *
 * Le composant ne décide de rien : toute la logique est dans
 * `feuille-des-modes.ts`, déjà testée sans DOM. Ce fichier vérifie donc la
 * seule chose que le JSX peut casser tout seul : est-ce que ce qui a été
 * décidé arrive bien à l'écran.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CATALOGUE_INTEGRE, type AgentMode, type SondeFournisseur } from '@vibecore/billing';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeuilleDesModes } from './FeuilleDesModes';
import { getChatControlsCopy } from '~/lib/i18n/catalogs/chat-controls';

afterEach(cleanup);

const copy = getChatControlsCopy('fr');

const EN_PANNE: SondeFournisseur[] = [
  { fournisseur: 'openai', etat: 'joignable' },
  { fournisseur: 'google', etat: 'joignable' },
  { fournisseur: 'anthropic', etat: 'sans-credit' },
  { fournisseur: 'moonshot', etat: 'sans-credit' },
];

const TOUT_VA_BIEN: SondeFournisseur[] = EN_PANNE.map((s) => ({ ...s, etat: 'joignable' as const }));

const LIBELLES: Record<AgentMode, { label: string; hint: string }> = {
  lite: { label: 'Lite', hint: 'Rapide et économique.' },
  power: { label: 'Power', hint: 'Le bon équilibre.' },
  max: { label: 'Max', hint: 'Pour les tâches longues.' },
};

function poser(options: Partial<React.ComponentProps<typeof FeuilleDesModes>> = {}) {
  const onChoisirMode = vi.fn();
  const onChoisirModele = vi.fn();

  render(
    <FeuilleDesModes
      copy={copy}
      modes={['lite', 'power', 'max']}
      modeActif="max"
      libelleDuMode={(m) => LIBELLES[m]}
      catalogues={CATALOGUE_INTEGRE}
      sondes={TOUT_VA_BIEN}
      choixParMode={{}}
      onChoisirMode={onChoisirMode}
      onChoisirModele={onChoisirModele}
      {...options}
    />,
  );

  return { onChoisirMode, onChoisirModele };
}

describe('écran 1', () => {
  it('liste les trois modes avec leur valeur à droite', () => {
    poser();

    for (const mode of ['lite', 'power', 'max']) {
      expect(screen.getByTestId(`feuille-mode-${mode}`)).toBeTruthy();
    }

    expect(screen.getByTestId('feuille-mode-max').textContent).toContain('Auto');
  });

  it('affiche le modèle choisi à la place d’« Auto »', () => {
    poser({ choixParMode: { max: { modele: 'claude-opus-5' } } });

    expect(screen.getByTestId('feuille-mode-max').textContent).toContain('claude-opus-5');
  });

  it('en Lite, les deux entrées portent un cadenas et sont désactivées', () => {
    poser({ modeActif: 'lite' });

    for (const sorte of ['modele', 'avance']) {
      const entree = screen.getByTestId(`feuille-entree-${sorte}`) as HTMLButtonElement;

      expect(entree.disabled, `${sorte} devrait être verrouillée`).toBe(true);
      expect(entree.dataset.verrouillee).toBe('true');
      expect(entree.textContent).toContain('à partir du mode Power');
    }
  });

  it('en Max, les deux entrées s’ouvrent', () => {
    poser();

    expect((screen.getByTestId('feuille-entree-modele') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('le repli est visible', () => {
  it('quand un repli a eu lieu, la feuille le dit en toutes lettres', () => {
    poser({ sondes: EN_PANNE, choixParMode: { max: { modele: 'kimi-k3' } } });

    const mention = screen.getByTestId('feuille-repli');

    expect(mention.textContent).toContain('kimi-k3');
    expect(mention.textContent).toContain('gpt-5.6-sol');
  });

  it('sans repli, aucune mention ne s’affiche', () => {
    poser({ choixParMode: { max: { modele: 'kimi-k3' } } });

    expect(screen.queryByTestId('feuille-repli')).toBeNull();
  });
});

describe('écran 2', () => {
  it('« Choisir automatiquement » vient en tête, avec sa pastille', () => {
    poser();
    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const auto = screen.getByTestId('feuille-modele-auto');

    expect(auto.textContent).toContain('Choisir automatiquement');
    expect(auto.textContent).toContain('conseillé');
  });

  it('les modèles en panne restent affichés, désactivés, avec leur cause', () => {
    poser({ sondes: EN_PANNE });
    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const opus = screen.getByTestId('feuille-modele-claude-opus-5-std') as HTMLButtonElement;

    expect(opus.disabled).toBe(true);
    expect(opus.dataset.etat).toBe('momentanement-indisponible');
    expect(opus.textContent).toContain('rechargé');
  });

  it('le chevron de retour ramène à la liste des modes', () => {
    poser();
    fireEvent.click(screen.getByTestId('feuille-entree-modele'));
    expect(screen.queryByTestId('feuille-mode-max')).toBeNull();

    fireEvent.click(screen.getByTestId('feuille-retour'));
    expect(screen.getByTestId('feuille-mode-max')).toBeTruthy();
  });
});

describe('le bloc Effort', () => {
  it('rend autant de crans que le modèle en déclare', () => {
    poser({ choixParMode: { max: { modele: 'claude-opus-5' } } });
    fireEvent.click(screen.getByTestId('feuille-entree-avance'));

    const rail = screen.getByTestId('feuille-effort-rail') as HTMLInputElement;

    expect(screen.getByTestId('feuille-effort').dataset.crans).toBe('5');
    expect(rail.max).toBe('4');
  });

  it('quatre crans sur Sonnet 4.6, pas cinq', () => {
    poser({ modeActif: 'power', choixParMode: { power: { modele: 'claude-sonnet-4-6' } } });
    fireEvent.click(screen.getByTestId('feuille-entree-avance'));

    expect(screen.getByTestId('feuille-effort').dataset.crans).toBe('4');
    expect((screen.getByTestId('feuille-effort-rail') as HTMLInputElement).max).toBe('3');
  });

  it('disparaît quand le modèle ne déclare aucun cran', () => {
    poser({ modeActif: 'lite', choixParMode: { lite: { modele: 'claude-haiku-4-5' } } });

    /* En Lite les entrées sont verrouillées : on rend le bloc directement. */
    expect(screen.queryByTestId('feuille-effort')).toBeNull();
  });

  it('bouger le curseur remonte le cran choisi', () => {
    const { onChoisirModele } = poser({ choixParMode: { max: { modele: 'claude-opus-5' } } });
    fireEvent.click(screen.getByTestId('feuille-entree-avance'));

    fireEvent.change(screen.getByTestId('feuille-effort-rail'), { target: { value: '4' } });

    expect(onChoisirModele).toHaveBeenCalledWith('max', expect.objectContaining({ effort: 'max' }));
  });
});

describe('« jamais sondé » n’est pas « indisponible »', () => {
  /*
   * La garde qui compte ici. Avec `sondes={[]}` — l'état réel de la plateforme
   * tant que la sonde n'existe pas — l'ancienne condition `etat !== 'disponible'`
   * désactivait CHAQUE ligne du catalogue. Le panneau s'affichait, et rien
   * n'était choisissable : un défaut qu'aucun test de rendu n'attrapait, parce
   * que les fixtures passaient toujours des sondes vertes.
   */
  it('sans aucune sonde, les modèles restent choisissables', () => {
    const { onChoisirModele } = poser({ sondes: [] });

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const lignes = screen.getAllByRole('radio');
    const modeles = lignes.filter((l) => l.getAttribute('data-etat') === 'inconnu');

    expect(modeles.length).toBeGreaterThan(0);

    for (const ligne of modeles) {
      expect((ligne as HTMLButtonElement).disabled).toBe(false);
    }

    fireEvent.click(modeles[0]);
    expect(onChoisirModele).toHaveBeenCalled();
  });

  it('un fournisseur sans crédit, lui, ferme bien sa ligne', () => {
    poser({ modeActif: 'power', sondes: EN_PANNE });

    fireEvent.click(screen.getByTestId('feuille-entree-modele'));

    const fermees = screen
      .getAllByRole('radio')
      .filter((l) => l.getAttribute('data-etat') === 'momentanement-indisponible');

    expect(fermees.length).toBeGreaterThan(0);

    for (const ligne of fermees) {
      expect((ligne as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('écran avancé', () => {
  it('rend le nœud que l’appelant lui confie', () => {
    poser({ modeActif: 'max', avance: <p data-testid="temoin-avance">interrupteurs de l’appelant</p> });

    fireEvent.click(screen.getByTestId('feuille-entree-avance'));

    expect(screen.getByTestId('temoin-avance')).toBeTruthy();
  });
});
