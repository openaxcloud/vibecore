import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_AGENT_ROUTING_CARD, routingLine } from './agent-routing.js';

/**
 * LA CARTE DIT OÙ VA LE REPLI ; L'APP DÉCIDE QUAND IL PART. RIEN NE LES LIAIT.
 *
 * `PROVIDER_FALLBACK_CHAIN` est une constante codée en dur dans
 * `app/lib/.server/llm/provider-fallback.ts`. Elle ne consulte pas la carte de
 * routage, et l'app n'importe pas `@vibecore/billing` : les deux mondes sont
 * séparés par conception.
 *
 * Conséquence mesurée le 2026-09-15, avant la v4 : un repli réussi vers Gemini
 * ne correspondait à AUCUNE ligne de routage — ni prix, ni journal, ni
 * télémétrie. La redondance existait sans jamais pouvoir être constatée, et
 * c'est pourquoi elle n'avait jamais été prouvée au niveau plateforme.
 *
 * La v4 lui donne sa ligne. Ce test tient les deux déclarations ensemble :
 * changer le modèle d'un côté sans l'autre rendrait de nouveau le repli
 * invisible à la facturation — ou, pire, facturerait une ligne qui n'est pas
 * celle qui a répondu.
 */
const CHAINE = join(process.cwd(), 'app', 'lib', '.server', 'llm', 'provider-fallback.ts');

describe('la ligne de redondance et la chaîne de repli', () => {
  const source = readFileSync(CHAINE, 'utf8');

  /** Les étapes de `PROVIDER_FALLBACK_CHAIN`, lues dans la source — jamais recopiées ici. */
  const etapes = (): { provider: string; model: string }[] => {
    const bloc = /PROVIDER_FALLBACK_CHAIN[^=]*=\s*\[([\s\S]*?)\];/u.exec(source);

    expect(bloc, 'la chaîne de repli a disparu de l’app').not.toBeNull();

    return [...bloc![1].matchAll(/\{\s*provider:\s*'([^']+)'\s*,\s*model:\s*'([^']+)'\s*\}/gu)].map((trouve) => ({
      provider: trouve[1],
      model: trouve[2],
    }));
  };

  it('mesure bien quelque chose : la chaîne a au moins deux étapes', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(etapes().length).toBeGreaterThanOrEqual(2);
  });

  it('le modèle Google de la chaîne est EXACTEMENT celui de la ligne de redondance', () => {
    const ligne = routingLine(BUILTIN_AGENT_ROUTING_CARD, 'fallback');

    expect(ligne, 'la carte n’a plus de ligne de redondance').toBeDefined();
    expect(ligne!.provider).toBe('google');

    const google = etapes().find((etape) => etape.provider.toLowerCase() === 'google');

    expect(google, 'la chaîne de repli ne passe plus par Google').toBeDefined();
    expect(
      google!.model,
      'la chaîne répondrait avec un modèle que la carte ne facture pas — repli invisible, ou facturé sur la mauvaise ligne',
    ).toBe(ligne!.model);
  });
});
