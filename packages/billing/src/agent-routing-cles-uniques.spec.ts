import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENT_MODES, AGENT_ROUTING_LINE_KEYS } from './agent-routing.js';

/**
 * LES CLÉS DE ROUTAGE SONT RECOPIÉES À LA MAIN DANS SEPT ENDROITS.
 *
 * Source de vérité : `AGENT_ROUTING_LINE_KEYS` (6 lignes) et `AGENT_MODES`
 * (3 modes), dans ce paquet. Ailleurs, elles sont RÉÉCRITES :
 *
 *   services/api/src/agent-routing-service.ts   z.enum des 6 lignes
 *   services/api/src/app.ts                     z.enum des 6 lignes  (×2)
 *   services/api/src/app.ts                     z.enum des 3 modes   (×3)
 *   app/components/chat/AgentPowerControls.tsx  BUILD_TIER_IDS
 *
 * Chacune est un point de rupture SILENCIEUX. Mesuré le 2026-09-15 en
 * préparant la 7e ligne (la redondance Google) :
 *
 *   - ajoutée au billing seul, la carte stockée est rejetée à la lecture et
 *     retombe sur la carte intégrée — la tarification servie change sans
 *     qu'aucun journal ne le dise ;
 *   - ajoutée au schéma de lecture seul, la ligne passe la validation mais
 *     n'existe pour aucun calcul de prix ;
 *   - ajoutée partout SAUF dans `app.ts`, un appel qui déclare cette ligne est
 *     REJETÉ par la validation de la requête — le repli fonctionnerait mais ne
 *     pourrait jamais être rapporté.
 *
 * Ce test lit les sources et exige que toutes disent la MÊME chose. Il ne
 * recopie aucune clé : il les extrait.
 */
const RACINE = process.cwd();

const FICHIERS = [
  join('services', 'api', 'src', 'agent-routing-service.ts'),
  join('services', 'api', 'src', 'app.ts'),
  join('app', 'components', 'chat', 'AgentPowerControls.tsx'),
];

/** Toutes les listes littérales de clés d'un fichier, quelle que soit leur forme. */
function listesDeCles(source: string): string[][] {
  const listes: string[][] = [];
  const motif = /\[\s*((?:'[a-z][a-z-]*'\s*,\s*)+'[a-z][a-z-]*'\s*)\]/gu;

  let trouve: RegExpExecArray | null;

  while ((trouve = motif.exec(source))) {
    const cles = trouve[1]
      .split(',')
      .map((brut) => brut.trim().replace(/^'|'$/gu, ''))
      .filter(Boolean);

    // On ne retient que les listes qui PARLENT de routage : elles contiennent 'lite'.
    if (cles.includes('lite')) {
      listes.push(cles);
    }
  }

  return listes;
}

describe('les clés de routage recopiées hors du billing', () => {
  const sources = FICHIERS.map((chemin) => ({ chemin, texte: readFileSync(join(RACINE, chemin), 'utf8') }));

  it('mesure bien quelque chose : chaque fichier existe et porte des listes de routage', () => {
    for (const { chemin, texte } of sources) {
      expect(texte.length, chemin).toBeGreaterThan(500);
      expect(listesDeCles(texte).length, `${chemin} ne porte plus aucune liste de routage`).toBeGreaterThanOrEqual(1);
    }

    expect(AGENT_ROUTING_LINE_KEYS.length).toBeGreaterThanOrEqual(6);
    expect(AGENT_MODES).toHaveLength(3);
  });

  it('chaque liste recopiée est EXACTEMENT celle des modes ou celle des lignes', () => {
    const modes = [...AGENT_MODES].sort().join(',');
    const lignes = [...AGENT_ROUTING_LINE_KEYS].sort().join(',');
    const divergentes: string[] = [];

    for (const { chemin, texte } of sources) {
      for (const liste of listesDeCles(texte)) {
        const signature = [...liste].sort().join(',');

        if (signature !== modes && signature !== lignes) {
          divergentes.push(`${chemin} : [${liste.join(', ')}]`);
        }
      }
    }

    expect(
      divergentes,
      'une liste recopiée ne dit plus ce que le billing déclare — la clé absente sera rejetée en silence',
    ).toEqual([]);
  });
});
