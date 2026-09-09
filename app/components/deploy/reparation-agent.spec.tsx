/**
 * @vitest-environment jsdom
 */

/*
 * BUG-PUBLISH-REPARER-CIBLE-001 — cette garde CLIQUE les deux entrées du menu
 * « Réparer avec l'agent » et compare ce qui en sort.
 *
 * Pourquoi cliquer, et non relire la source : le défaut ne se voyait NULLE PART
 * dans le code. Le menu passait sa cible, l'hôte l'ignorait, et TypeScript
 * acceptait l'écart (bivariance des paramètres). Les deux entrées se lisaient
 * comme deux gestes différents et n'en étaient qu'un seul à l'exécution. Seule
 * l'exécution le montre.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublicationReplit, type DemandeDeReparation } from './PublicationReplit';
import { detailDeTacheDeReparation, gesteDeLancementDeLAgent } from './reparation-agent';

const DEPLOIEMENTS = [
  {
    id: 'dep-1',
    provider: 'static',
    environment: 'production',
    status: 'FAILED' as const,
    createdAt: '2026-09-09T08:00:00.000Z',
    completedAt: '2026-09-09T08:02:00.000Z',
    logs: ['npm ERR! build failed'],
  },
];

function monter(onReparerAvecAgent: (demande: DemandeDeReparation) => void) {
  return render(
    <PublicationReplit
      deployments={DEPLOIEMENTS}
      language="fr"
      ilYA={() => 'il y a 2 minutes'}
      onReparerAvecAgent={onReparerAvecAgent}
    />,
  );
}

describe('menu « Réparer avec l’agent »', () => {
  afterEach(() => cleanup());

  it('l’entrée « dans la conversation » vise la conversation courante', () => {
    const recu = vi.fn();
    monter(recu);

    fireEvent.click(screen.getByTestId('publication-reparer'));

    expect(recu).toHaveBeenCalledTimes(1);
    expect(recu.mock.calls[0][0].cible).toBe('conversation');
    expect(String(recu.mock.calls[0][0].invite)).not.toHaveLength(0);
  });

  it('l’entrée « dans une nouvelle tâche » vise un fil neuf — et pas la conversation', () => {
    const recu = vi.fn();
    monter(recu);

    // Choisir referme le menu : chaque entrée se clique sur un menu rouvert.
    const choisir = (rang: number) => {
      fireEvent.click(screen.getByTestId('publication-reparer-menu'));

      const options = screen.getByTestId('publication-reparer-options').querySelectorAll('button');
      expect(options).toHaveLength(2);

      fireEvent.click(options[rang]);
    };

    choisir(0);
    choisir(1);

    expect(recu).toHaveBeenCalledTimes(2);

    const cibles = recu.mock.calls.map((appel) => appel[0].cible);

    expect(cibles).toEqual(['conversation', 'tache']);

    // C'est ICI que le défaut vivait : les deux entrées rendaient la même chose.
    expect(cibles[0]).not.toBe(cibles[1]);
  });

  it('la cible survit au passage par l’événement `vibecore:agent-task`', () => {
    const recu = vi.fn();
    monter(recu);

    fireEvent.click(screen.getByTestId('publication-reparer-menu'));
    fireEvent.click(screen.getByTestId('publication-reparer-options').querySelectorAll('button')[1]);

    const detail = detailDeTacheDeReparation(recu.mock.calls[0][0]);

    expect(detail.kind).toBe('fix-publication');
    expect(detail.cible).toBe('tache');
    expect(detail.prompt).toBe(recu.mock.calls[0][0].invite);
  });
});

describe('ce que l’hôte fait de la cible', () => {
  const base = { peutEnvoyer: true, tourEnCours: false, peutOuvrirUnFilNeuf: true };

  it('« tache » ouvre un fil neuf, « conversation » envoie dans le fil courant', () => {
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'tache' })).toBe('fil-neuf');
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'conversation' })).toBe('envoyer');
  });

  it('sans cible, on reste dans la conversation courante', () => {
    expect(gesteDeLancementDeLAgent({ ...base, cible: undefined })).toBe('envoyer');
    expect(gesteDeLancementDeLAgent({ ...base, cible: null })).toBe('envoyer');
  });

  it('un tour DÉJÀ en vol n’est jamais doublé — même pour une nouvelle tâche', () => {
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'tache', tourEnCours: true })).toBe('composeur');
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'conversation', tourEnCours: true })).toBe('composeur');
  });

  it('sans envoi disponible, l’invite est déposée dans le composeur', () => {
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'tache', peutEnvoyer: false })).toBe('composeur');
  });

  it('sans moyen d’ouvrir un fil neuf, on ne prétend pas en avoir ouvert un', () => {
    expect(gesteDeLancementDeLAgent({ ...base, cible: 'tache', peutOuvrirUnFilNeuf: false })).toBe('envoyer');
  });
});
