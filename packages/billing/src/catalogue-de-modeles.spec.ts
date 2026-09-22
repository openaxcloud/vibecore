/*
 * Ce fichier tient trois promesses faites à Avi, et une seule d'entre elles
 * est cosmétique.
 *
 * 1. « Choisir automatiquement » = le modèle le moins cher de la liste du mode.
 * 2. Cette règle est une DONNÉE : la changer pour un mode ne doit pas être un
 *    chantier de code.
 * 3. Aucun modèle n'est vendu sous son prix d'achat. Trois modèles coûtent
 *    1000/5000 et ne dégagent une marge qu'au multiplicateur ×2 : les laisser
 *    atteignables en Power (×1) ou en Lite (×0,5) reviendrait à vendre 54 %
 *    sous le prix d'achat, et ça ne se verrait qu'à la facture.
 */
import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENT_ROUTING_CARD } from './agent-routing.js';
import {
  coutMelange,
  margesDuCatalogue,
  modeleAutomatique,
  modelesAPerte,
  type CatalogueDuMode,
} from './catalogue-de-modeles.js';
import { CATALOGUE_INTEGRE } from './catalogue-integre.js';

const parMode = (mode: string) => CATALOGUE_INTEGRE.find((c) => c.mode === mode)!;

describe('« Choisir automatiquement » retient le moins cher', () => {
  it('Lite → gpt-5.6-luna', () => {
    expect(modeleAutomatique(parMode('lite'))!.model).toBe('gpt-5.6-luna');
  });

  it('Power → gpt-5.6-luna en mode fast', () => {
    const retenu = modeleAutomatique(parMode('power'))!;

    expect(retenu.model).toBe('gpt-5.6-luna');
    expect(retenu.serviceTier, 'c’est bien l’entrée « fast », pas la standard').toBe('fast');
  });

  it('Max → kimi-k3', () => {
    expect(modeleAutomatique(parMode('max'))!.model).toBe('kimi-k3');
  });

  it('le retenu est vraiment le moins cher de sa liste, pas le premier écrit', () => {
    for (const catalogue of CATALOGUE_INTEGRE) {
      const retenu = modeleAutomatique(catalogue)!;
      const couts = catalogue.modeles.map((m) => coutMelange(m));

      expect(coutMelange(retenu), `mode ${catalogue.mode}`).toBe(Math.min(...couts));
    }
  });

  it('classe sur le coût MÉLANGÉ : à entrée égale, la sortie tranche', () => {
    /*
     * Opus 5 (500/2500) et Sol (400/2000) : un classement sur la seule entrée
     * placerait Sol devant, ce qui est vrai ici — mais le cas qui compte est
     * celui de deux entrées ÉGALES. On le fabrique pour épingler la règle.
     */
    const catalogue: CatalogueDuMode = {
      mode: 'max',
      automatique: { politique: 'moins-cher' },
      modeles: [
        { model: 'sortie-chere', provider: 'openai', costInCentsPerM: 500, costOutCentsPerM: 3000 },
        { model: 'sortie-douce', provider: 'openai', costInCentsPerM: 500, costOutCentsPerM: 2500 },
      ],
    };

    expect(modeleAutomatique(catalogue)!.model).toBe('sortie-douce');
  });
});

describe('la règle est une donnée, pas du code', () => {
  it('épingler un modèle change le retenu sans toucher au code', () => {
    const epingle: CatalogueDuMode = {
      ...parMode('max'),
      automatique: { politique: 'epingle', modeleEpingle: 'claude-opus-5' },
    };

    expect(modeleAutomatique(epingle)!.model).toBe('claude-opus-5');
  });

  it('le poids de la sortie est réglable, et il change le classement', () => {
    const catalogue: CatalogueDuMode = {
      mode: 'power',
      automatique: { politique: 'moins-cher', poidsSortie: 0 },
      modeles: [
        { model: 'entree-douce', provider: 'openai', costInCentsPerM: 100, costOutCentsPerM: 9000 },
        { model: 'entree-chere', provider: 'openai', costInCentsPerM: 200, costOutCentsPerM: 300 },
      ],
    };

    // À poids nul, seule l'entrée compte.
    expect(modeleAutomatique(catalogue)!.model).toBe('entree-douce');

    // Au poids réel, la sortie ruineuse disqualifie le même modèle.
    expect(modeleAutomatique({ ...catalogue, automatique: { politique: 'moins-cher' } })!.model).toBe('entree-chere');
  });

  it('un modèle épinglé absent de la liste ne rend rien, plutôt qu’un modèle au hasard', () => {
    const cassé: CatalogueDuMode = {
      ...parMode('lite'),
      automatique: { politique: 'epingle', modeleEpingle: 'modele-qui-nexiste-pas' },
    };

    expect(modeleAutomatique(cassé)).toBeUndefined();
  });
});

describe('aucun modèle n’est vendu sous son prix d’achat', () => {
  it('le catalogue intégré ne perd d’argent nulle part', () => {
    const pertes = modelesAPerte(BUILTIN_AGENT_ROUTING_CARD, CATALOGUE_INTEGRE);

    expect(
      pertes.map((p) => `${p.mode}/${p.model}`),
      `vendus sous le prix d’achat : ${pertes.map((p) => `${p.mode}/${p.model}`).join(', ')}`,
    ).toEqual([]);
  });

  it('contrôle positif : la garde SAIT rougir', () => {
    /*
     * Une garde qui ne rougit jamais ressemble à une garde qui passe. On
     * descend les trois modèles à 1000/5000 d'un cran, en Power (×1), et on
     * vérifie que les trois sont nommés.
     */
    const descendus: CatalogueDuMode[] = [
      {
        mode: 'power',
        automatique: { politique: 'moins-cher' },
        modeles: [
          { model: 'claude-fable-5-1', provider: 'anthropic', costInCentsPerM: 1000, costOutCentsPerM: 5000 },
          { model: 'gpt-6-astra', provider: 'openai', costInCentsPerM: 1000, costOutCentsPerM: 5000 },
          {
            model: 'claude-opus-5',
            provider: 'anthropic',
            costInCentsPerM: 1000,
            costOutCentsPerM: 5000,
            serviceTier: 'fast',
          },
        ],
      },
    ];

    const pertes = modelesAPerte(BUILTIN_AGENT_ROUTING_CARD, descendus);

    expect(pertes).toHaveLength(3);
    expect(pertes.every((p) => p.margeEntree < 0 && p.margeSortie < 0)).toBe(true);
  });

  it('les trois modèles à 1000/5000 ne vivent qu’en Max', () => {
    const chers = ['claude-fable-5-1', 'gpt-6-astra'];

    for (const catalogue of CATALOGUE_INTEGRE) {
      for (const modele of catalogue.modeles) {
        const estCher = modele.costInCentsPerM >= 1000 && modele.costOutCentsPerM >= 5000;

        if (estCher) {
          expect(catalogue.mode, `${modele.model} est proposé en ${catalogue.mode}`).toBe('max');
        }
      }
    }

    for (const cher of chers) {
      expect(
        parMode('max').modeles.some((m) => m.model === cher),
        `${cher} absent de Max`,
      ).toBe(true);
    }
  });

  it('la marge de chaque modèle est calculée au multiplicateur de SON mode', () => {
    const marges = margesDuCatalogue(BUILTIN_AGENT_ROUTING_CARD, CATALOGUE_INTEGRE);
    const attendus: Record<string, number> = { lite: 0.5, power: 1, max: 2 };

    expect(marges.length).toBeGreaterThan(0);

    for (const marge of marges) {
      expect(marge.multiplicateur, `mode ${marge.mode}`).toBe(attendus[marge.mode]);
    }
  });
});
