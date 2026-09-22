import { describe, expect, it } from 'vitest';

import { empilementsSansPorteur, fermeturesSuspectes, fillesDe } from './propositions-empilees.mjs';

/*
 * Le cas RÉEL, reconstitué depuis l'API GitHub le 2026-09-16. Les horodatages
 * ne sont pas inventés : ce sont ceux de la perte.
 *
 *   #321 fusionnée   2026-09-02T03:12:52Z
 *   #326 fermée      2026-09-02T03:12:54Z
 *
 * Un jeu d'essai inventé prouverait que la fonction sait compter. Celui-ci
 * prouve qu'elle aurait attrapé CE défaut-là.
 */
const CHANTIER_AGENT = [
  {
    number: 316,
    state: 'CLOSED',
    headRefName: 'fix/agent-panel-empty-bodies',
    baseRefName: 'main',
    mergedAt: '2026-09-02T03:12:40Z',
    closedAt: '2026-09-02T03:12:40Z',
  },
  {
    number: 321,
    state: 'CLOSED',
    headRefName: 'feat/agent-message-detail',
    baseRefName: 'main',
    mergedAt: '2026-09-02T03:12:52Z',
    closedAt: '2026-09-02T03:12:52Z',
  },
  {
    number: 326,
    state: 'CLOSED',
    headRefName: 'fix/agent-composer-input-lost',
    baseRefName: 'feat/agent-message-detail',
    mergedAt: null,
    closedAt: '2026-09-02T03:12:54Z',
  },
];

describe('la fermeture automatique d’une proposition empilée', () => {
  it('#326 aurait été signalée AVANT la fusion de #321', () => {
    expect(
      fillesDe([...CHANTIER_AGENT.map((pr) => ({ ...pr, state: pr.number === 326 ? 'OPEN' : pr.state }))], 'feat/agent-message-detail'),
    ).toEqual([326]);
  });

  it('et APRÈS, sa fermeture se lit comme un automatisme — 2 secondes', () => {
    const suspectes = fermeturesSuspectes(CHANTIER_AGENT);

    expect(suspectes).toEqual([{ numero: 326, fermeeApres: 321, ecartSecondes: 2 }]);
  });

  it('une fermeture humaine, des heures après, n’est PAS signalée', () => {
    const humaine = CHANTIER_AGENT.map((pr) =>
      pr.number === 326 ? { ...pr, closedAt: '2026-09-02T09:30:00Z' } : pr,
    );

    expect(fermeturesSuspectes(humaine)).toEqual([]);
  });

  it('une fermeture rapide mais SANS lien de base n’est pas signalée non plus', () => {
    const sansLien = CHANTIER_AGENT.map((pr) => (pr.number === 326 ? { ...pr, baseRefName: 'autre-chose' } : pr));

    expect(fermeturesSuspectes(sansLien)).toEqual([]);
  });
});

describe('un empilement que plus rien ne porte vers main', () => {
  it('signale la proposition et la branche en cause', () => {
    // #335 est empilée sur `fix/agent-composer-input-lost`, que plus aucune
    // proposition ouverte ne porte : l'état terminal du piège.
    const ouvertes = [
      { number: 335, state: 'OPEN', headRefName: 'fix/agent-panel-states', baseRefName: 'fix/agent-composer-input-lost' },
      { number: 552, state: 'OPEN', headRefName: 'recup/frappe-pendant-le-chargement', baseRefName: 'main' },
    ];

    expect(empilementsSansPorteur(ouvertes)).toEqual([{ numero: 335, base: 'fix/agent-composer-input-lost' }]);
  });

  it('ne signale RIEN quand la base est elle-même portée', () => {
    const chaine = [
      { number: 403, state: 'OPEN', headRefName: 'fix/audx-021-upload-limits', baseRefName: 'sec/audx-022-storage-token-scopes' },
      { number: 419, state: 'OPEN', headRefName: 'sec/audx-022-storage-token-scopes', baseRefName: 'main' },
    ];

    expect(empilementsSansPorteur(chaine)).toEqual([]);
  });
});
