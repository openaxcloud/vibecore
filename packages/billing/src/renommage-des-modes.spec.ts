/*
 * Le renommage des modes ne doit pas re-tarifer les cartes déjà publiées.
 *
 * Ancien vocabulaire : lite | economy | power   (power = le SOMMET)
 * Nouveau            : lite | power   | max     (power = le MILIEU)
 *
 * `power` existe des deux côtés et CHANGE DE SENS. Une substitution en place
 * écraserait l'ancien sommet avec l'ancien milieu : qui avait choisi le mode le
 * plus cher se verrait facturer le tarif du mode médian, sans qu'aucun test
 * fonctionnel ne s'en aperçoive. Ce fichier existe pour cette faute-là.
 */
import { describe, expect, it } from 'vitest';

import {
  AGENT_MODES,
  BUILTIN_AGENT_ROUTING_CARD,
  RENOMMAGE_DES_MODES,
  migrerVocabulaireDesCles,
  vocabulaireAncien,
} from './agent-routing.js';

/** Une carte de l'ancien monde, avec des tarifs DISTINCTS par ligne pour que l'écrasement se voie. */
function carteAncienne() {
  return {
    version: 3,
    effectiveFrom: '2026-08-20T00:00:00.000Z',
    sourceDate: '2026-08-20',
    currency: 'usd',
    baseUserInCentsPerM: 650,
    baseUserOutCentsPerM: 3250,
    lines: [
      { key: 'lite', costInCentsPerM: 100, multiplier: 0.5 },
      { key: 'economy', costInCentsPerM: 500, multiplier: 1 },
      { key: 'power', costInCentsPerM: 1500, multiplier: 2 },
      { key: 'turbo', costInCentsPerM: 400, multiplier: 2 },
    ],
  };
}

describe('la traduction du vocabulaire', () => {
  it('reconnaît une carte ancienne à sa clé « economy »', () => {
    expect(vocabulaireAncien(carteAncienne())).toBe(true);
    expect(vocabulaireAncien(BUILTIN_AGENT_ROUTING_CARD)).toBe(false);
  });

  it('economy devient power, et l’ancien power devient max', () => {
    const migree = migrerVocabulaireDesCles(carteAncienne());

    expect(migree.lines.map((l) => l.key)).toEqual(['lite', 'power', 'max', 'turbo']);
  });

  it('LE PIÈGE : le tarif du sommet suit le sommet, il n’est pas écrasé', () => {
    const migree = migrerVocabulaireDesCles(carteAncienne());
    const parCle = Object.fromEntries(migree.lines.map((l) => [l.key, l]));

    // L'ancien `power` coûtait 1500 et se facturait ×2 : c'est le nouveau `max`.
    expect(parCle.max.costInCentsPerM, 'le sommet a perdu son tarif').toBe(1500);
    expect(parCle.max.multiplier).toBe(2);

    // L'ancien `economy` coûtait 500 et se facturait ×1 : c'est le nouveau `power`.
    expect(parCle.power.costInCentsPerM, 'le milieu a hérité du tarif du sommet').toBe(500);
    expect(parCle.power.multiplier).toBe(1);
  });

  it('ne touche pas aux lignes qui ne sont pas des modes', () => {
    const migree = migrerVocabulaireDesCles(carteAncienne());

    expect(migree.lines.find((l) => l.key === 'turbo')!.costInCentsPerM).toBe(400);
  });

  it('est idempotente — elle s’applique à CHAQUE lecture, y compris sur une carte neuve', () => {
    const une = migrerVocabulaireDesCles(carteAncienne());
    const deux = migrerVocabulaireDesCles(une);

    expect(deux).toEqual(une);
    expect(migrerVocabulaireDesCles(BUILTIN_AGENT_ROUTING_CARD)).toEqual(BUILTIN_AGENT_ROUTING_CARD);
  });

  it('n’écrit jamais dans la donnée qu’elle lit', () => {
    const origine = carteAncienne();
    migrerVocabulaireDesCles(origine);

    expect(origine.lines.map((l) => l.key), 'la source a été modifiée en place').toEqual([
      'lite',
      'economy',
      'power',
      'turbo',
    ]);
  });
});

describe('le vocabulaire courant', () => {
  it('les trois modes sont lite, power, max', () => {
    expect(AGENT_MODES).toEqual(['lite', 'power', 'max']);
  });

  it('la carte intégrée porte une ligne pour chacun', () => {
    for (const mode of AGENT_MODES) {
      expect(
        BUILTIN_AGENT_ROUTING_CARD.lines.some((ligne) => ligne.key === mode),
        `aucune ligne pour le mode ${mode}`,
      ).toBe(true);
    }
  });

  it('« economy » n’existe plus nulle part dans la carte intégrée', () => {
    expect(BUILTIN_AGENT_ROUTING_CARD.lines.map((l) => l.key)).not.toContain('economy');
  });

  it('la table de renommage ne renomme que ce qui change de nom', () => {
    expect(Object.keys(RENOMMAGE_DES_MODES).sort()).toEqual(['economy', 'power']);
    expect(RENOMMAGE_DES_MODES.economy).toBe('power');
    expect(RENOMMAGE_DES_MODES.power).toBe('max');
  });
});
