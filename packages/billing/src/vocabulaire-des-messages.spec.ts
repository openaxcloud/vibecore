import { describe, expect, it } from 'vitest';

import { AGENT_ROUTING_LINE_KEYS, BUILTIN_AGENT_ROUTING_CARD } from './agent-routing';
import { agentRoutingValidationMessage, type AgentRoutingValidationCopyKey } from './agent-routing-i18n';

/**
 * UN MESSAGE NE DOIT PAS NOMMER UNE LIGNE QUI N'EXISTE PLUS.
 *
 * Mesuré le 2026-09-28. Le renommage `economy → power` était en place dans la
 * carte depuis longtemps, mais le message de refus disait encore « economy est
 * le mode par défaut ». Un administrateur dont la publication était refusée
 * lisait donc le nom d'une ligne absente de la carte qu'il venait d'écrire —
 * et cherchait un problème là où il n'y en avait pas.
 *
 * Ce cas ne vise pas l'occurrence, il vise la RÈGLE : aucun message de
 * validation ne peut contenir un mot du vocabulaire retiré, et tout nom de
 * ligne cité doit exister dans la carte.
 */

/* Les noms retirés du produit. Un message qui en contient un est un message périmé. */
const VOCABULAIRE_RETIRE = ['economy'];

const CLES_DE_MESSAGE: AgentRoutingValidationCopyKey[] = [
  'baseInput',
  'baseOutput',
  'missingLine',
  'duplicateLine',
  'providerModelRequired',
  'inputCost',
  'outputCost',
  'multiplier',
  'unknownLine',
  'defaultModeInvariant',
];

describe('le vocabulaire des messages de validation', () => {
  it('la sonde lit bien des messages — sinon les cas suivants ne mesurent rien', () => {
    for (const cle of CLES_DE_MESSAGE) {
      for (const locale of ['en', 'fr'] as const) {
        expect(agentRoutingValidationMessage(cle, locale).length, `${cle}/${locale} vide`).toBeGreaterThan(5);
      }
    }
  });

  it('aucun message ne nomme une ligne retirée du produit', () => {
    const fautifs: string[] = [];

    for (const cle of CLES_DE_MESSAGE) {
      for (const locale of ['en', 'fr'] as const) {
        const texte = agentRoutingValidationMessage(cle, locale).toLowerCase();

        for (const mot of VOCABULAIRE_RETIRE) {
          if (texte.includes(mot)) {
            fautifs.push(`${cle}/${locale} : « ${texte} »`);
          }
        }
      }
    }

    expect(fautifs, `messages nommant un mode retiré :\n${fautifs.join('\n')}`).toEqual([]);
  });

  it('CONTRE-ÉPREUVE — la sonde attrape bien un message périmé qu’on lui donne', () => {
    /*
     * Sans ce cas, le précédent passerait au vert même si la recherche était
     * cassée. On lui donne un texte volontairement fautif et on vérifie qu'il
     * le voit.
     */
    const faux = 'economy est le mode par défaut';
    expect(VOCABULAIRE_RETIRE.some((mot) => faux.toLowerCase().includes(mot))).toBe(true);
  });

  it('le vocabulaire retiré n’est plus une ligne de la carte — c’est ce qui rend la règle vraie', () => {
    const cles = BUILTIN_AGENT_ROUTING_CARD.lines.map((ligne) => ligne.key);

    for (const mot of VOCABULAIRE_RETIRE) {
      expect(cles, `« ${mot} » est redevenue une ligne : la règle ci-dessus est à revoir`).not.toContain(mot);
    }

    /* Contrôle positif : la carte porte bien les lignes courantes. */
    expect(cles).toContain('power');
    expect(cles).toContain('fallback');
    expect(AGENT_ROUTING_LINE_KEYS).toContain('fallback');
  });
});
