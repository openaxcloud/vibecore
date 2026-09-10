import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUDGET_PAR_SEGMENT_MS, MAX_RESPONSE_SEGMENTS } from '~/lib/.server/llm/constants';

const RACINE = join(__dirname, '..', '..');
const SOURCE_ROUTE = readFileSync(join(__dirname, 'api.chat.ts'), 'utf8');
const SOURCE_WRAPPER = readFileSync(join(RACINE, 'app/lib/.server/llm/stream-text.ts'), 'utf8');
const TYPES_SDK = readFileSync(join(RACINE, 'node_modules/ai/dist/index.d.ts'), 'utf8');

function compter(source: string, aiguille: string): number {
  return source.split(aiguille).length - 1;
}

/**
 * CE QUE CES TESTS TIENNENT.
 *
 * Le SDK fabrique un identifiant de message NEUF à chaque appel `streamText`
 * et à chaque frontière d'étape outil, et le pousse au client dans la part
 * `start_step`. Le client réécrit alors `message.id` en plein flux. Deux
 * dégâts, tous deux mesurés sur le code :
 *
 *   - `StreamingMessageParser` indexe son état par identifiant de message :
 *     identifiant neuf = état neuf = position 0 = re-parse de tout le texte
 *     déjà reçu (réponse dupliquée, second artefact, actions `shell` du
 *     segment précédent RELANCÉES) ;
 *   - la transcription est upsertée sur `sha256(conversationId:message.id)` :
 *     identifiant neuf = nouvelle ligne au lieu d'une mise à jour.
 *
 * Le correctif tient en un identifiant fixe par tour, passé aux DEUX appels et
 * converti par l'enveloppe en `experimental_generateMessageId`. Chacune de ces
 * trois moitiés est épinglée séparément ci-dessous : en retirer une seule
 * suffit à rendre le correctif inopérant, donc chacune doit rougir seule.
 */
describe('un seul identifiant de message pour tout le tour', () => {
  it('témoin positif : les deux appels au générateur sont bien dans le fichier lu', () => {
    /*
     * Sans ce témoin, tous les comptages qui suivent pourraient valoir 0 dans
     * un fichier vide, mal résolu ou renommé — et un 0 se lirait comme un
     * succès. On exige d'abord que la cible existe.
     */
    expect(SOURCE_ROUTE.length).toBeGreaterThan(50_000);
    expect(compter(SOURCE_ROUTE, 'await streamText({')).toBe(2);
  });

  it("l'identifiant est généré UNE fois pour le tour, pas par appel", () => {
    expect(compter(SOURCE_ROUTE, 'const identifiantDuMessageDeReponse = generateId();')).toBe(1);
  });

  it('les DEUX appels au générateur le reçoivent — initial ET continuation', () => {
    expect(compter(SOURCE_ROUTE, 'identifiantDeMessageStable: identifiantDuMessageDeReponse,')).toBe(2);

    /*
     * Viser la RÈGLE et pas l'occurrence : on vérifie appel par appel, sinon
     * deux occurrences dans le MÊME corps passeraient le compte ci-dessus.
     */
    const corps = SOURCE_ROUTE.split('await streamText({').slice(1);
    expect(corps).toHaveLength(2);

    for (const [index, corpsDAppel] of corps.entries()) {
      expect(
        corpsDAppel.slice(0, 3000).includes('identifiantDeMessageStable: identifiantDuMessageDeReponse,'),
        `appel ${index + 1} sans identifiant stable`,
      ).toBe(true);
    }
  });

  it("l'enveloppe convertit la prop en l'option que le SDK comprend", () => {
    expect(compter(SOURCE_WRAPPER, 'identifiantDeMessageStable?: string;')).toBe(1);
    expect(
      SOURCE_WRAPPER.includes(
        '...(identifiantDeMessageStable ? { experimental_generateMessageId: () => identifiantDeMessageStable } : {}),',
      ),
    ).toBe(true);
  });

  it("l'option existe réellement dans le SDK installé, sous ce nom exact", () => {
    /*
     * La moitié la plus fragile : une prop bien câblée vers une option que le
     * SDK ne connaît pas est un correctif qui ne corrige rien, et RIEN dans le
     * typage ne le dirait (les options inconnues sont ignorées). Ce test
     * rougit le jour où une montée de version renomme l'option.
     */
    expect(TYPES_SDK.includes('experimental_generateMessageId?: IDGenerator;')).toBe(true);
    expect(TYPES_SDK.includes('declare function streamText<')).toBe(true);
  });
});

describe('la borne de la chaîne couvre TOUS les segments', () => {
  it('elle est dérivée du nombre de segments, pas écrite en dur', () => {
    expect(SOURCE_ROUTE.includes('creerSuiviDeChaine((MAX_RESPONSE_SEGMENTS + 1) * BUDGET_PAR_SEGMENT_MS)')).toBe(true);
    expect(compter(SOURCE_ROUTE, 'creerSuiviDeChaine(')).toBe(1);
  });

  it('elle couvre la plus longue génération saine mesurée, fois le nombre de segments', () => {
    /*
     * 215 s : la plus longue génération SAINE observée en production pour un
     * segment. Neuf appels fournisseur peuvent légitimement s'enchaîner
     * (MAX_RESPONSE_SEGMENTS continuations + l'appel initial), et la garde
     * arme son délai une seule fois avant le premier : la borne doit couvrir
     * le produit. Elle valait 12 minutes, soit 2,4 fois trop peu.
     */
    const PLUS_LONGUE_GENERATION_SAINE_MS = 215_000;
    const borne = (MAX_RESPONSE_SEGMENTS + 1) * BUDGET_PAR_SEGMENT_MS;

    expect(borne).toBeGreaterThanOrEqual((MAX_RESPONSE_SEGMENTS + 1) * PLUS_LONGUE_GENERATION_SAINE_MS);

    /* Contrôle dans l'autre sens : la borne reste une borne, pas une absence de borne. */
    expect(borne).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});
