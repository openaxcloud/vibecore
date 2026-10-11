/*
 * Les coûts de la carte sont-ils ceux que les fournisseurs facturent VRAIMENT ?
 *
 * Le 2026-09-16, l'audit des sept lignes a trouvé UNE erreur : `turbo` portait
 * 500 / 3000 pour `gpt-5.6-sol`, qu'OpenAI facture 400 / 2000. Un coût de
 * revient surestimé ne fait pas perdre d'argent — il fait REFUSER des
 * configurations rentables (la porte de marge négative se déclenche trop tôt)
 * et ment à l'administrateur sur la marge affichée.
 *
 * ⚠️ Ce fichier tient une DEUXIÈME COPIE des tarifs. C'est assumé, et c'est sa
 * limite : il ne peut pas détecter qu'un fournisseur a changé son prix, seulement
 * qu'une des deux copies a bougé sans l'autre. Ce qu'il apporte, c'est que la
 * copie de référence est DATÉE et SOURCÉE — une divergence devient une décision
 * visible au lieu d'une dérive muette. La relève des prix reste un geste humain,
 * à refaire quand une grille change.
 *
 * Relevé le 2026-09-16 sur les grilles publiques :
 *   Anthropic — platform.claude.com/docs/en/docs/about-claude/pricing
 *   OpenAI    — developers.openai.com/api/docs/pricing
 *   Google    — ai.google.dev/gemini-api/docs/pricing
 */
import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENT_ROUTING_CARD, lineMargins } from './agent-routing.js';

/** Cents par million de jetons. Entrée, sortie. */
const TARIFS_RELEVES: Record<string, { entree: number; sortie: number; releve: string }> = {
  'claude-haiku-4-5': { entree: 100, sortie: 500, releve: '2026-09-16' },
  'claude-opus-5': { entree: 500, sortie: 2500, releve: '2026-09-16' },
  'gpt-5.6-sol': { entree: 400, sortie: 2000, releve: '2026-09-16' },
  'gemini-2.5-pro': { entree: 125, sortie: 1000, releve: '2026-09-16' },
};

describe('les coûts de la carte correspondent aux grilles des fournisseurs', () => {
  it('chaque modèle de la carte a un tarif relevé', () => {
    const inconnus = BUILTIN_AGENT_ROUTING_CARD.lines
      .map((ligne) => ligne.model)
      .filter((modele, rang, tous) => tous.indexOf(modele) === rang)
      .filter((modele) => !TARIFS_RELEVES[modele]);

    expect(inconnus, `modèles sans tarif relevé — ajouter la ligne au tableau daté : ${inconnus.join(', ')}`).toEqual(
      [],
    );
  });

  for (const ligne of BUILTIN_AGENT_ROUTING_CARD.lines) {
    it(`la ligne « ${ligne.key} » (${ligne.model}) porte le tarif relevé`, () => {
      const tarif = TARIFS_RELEVES[ligne.model];

      // Contrôle positif : sans tarif, l'assertion suivante ne prouverait rien.
      expect(tarif, `aucun tarif relevé pour ${ligne.model}`).toBeDefined();

      expect(
        { entree: ligne.costInCentsPerM, sortie: ligne.costOutCentsPerM },
        `la carte s'écarte de la grille relevée le ${tarif.releve}`,
      ).toEqual({ entree: tarif.entree, sortie: tarif.sortie });
    });
  }
});

describe('aucune ligne active ne se vend à perte', () => {
  /*
   * Celle-ci n'est PAS une copie : elle vérifie une propriété, pas une valeur.
   * Elle tient même si les deux copies de tarifs dérivent ensemble.
   */
  for (const ligne of BUILTIN_AGENT_ROUTING_CARD.lines.filter((l) => l.active && l.billedToUser)) {
    it(`la ligne « ${ligne.key} » dégage une marge positive`, () => {
      const marges = lineMargins(BUILTIN_AGENT_ROUTING_CARD, ligne);

      expect(marges.negative, `« ${ligne.key} » est vendue en dessous de son coût de revient`).toBe(false);
      expect(marges.inputMargin).not.toBeNull();
      expect(marges.inputMargin!).toBeGreaterThan(0);
      expect(marges.outputMargin!).toBeGreaterThan(0);
    });
  }
});
