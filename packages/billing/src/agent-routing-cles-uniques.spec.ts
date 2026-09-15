import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENT_ROUTING_LINE_KEYS } from './agent-routing.js';

/**
 * LES CLÉS DE LIGNE SONT DÉCLARÉES DEUX FOIS, ET RIEN NE LES RELIAIT.
 *
 *   packages/billing/src/agent-routing.ts        `AGENT_ROUTING_LINE_KEYS`
 *   services/api/src/agent-routing-service.ts    `z.enum([...])`, recopié
 *
 * Le second est le schéma qui VALIDE la carte lue en base. Une clé ajoutée
 * d'un seul côté donne deux comportements, tous deux silencieux :
 *
 *   - ajoutée au billing seul : la carte stockée est REJETÉE à la lecture et
 *     retombe sur la carte intégrée — la tarification change sans que rien
 *     ne le dise ;
 *   - ajoutée au schéma seul : la ligne passe la validation mais n'existe
 *     pour aucun calcul de prix.
 *
 * C'est la même classe de défaut que les trois tables d'alias de panneaux :
 * deux vocabulaires pour une seule vérité. Ce test les tient ensemble.
 *
 * Il lit le fichier du service par CHEMIN plutôt que par import : `services/`
 * est exclu de la suite vitest racine, un test posé là-bas ne s'exécuterait
 * jamais — et une garde qui ne tourne pas ne garde rien.
 */
const SERVICE = join(process.cwd(), 'services', 'api', 'src', 'agent-routing-service.ts');

describe('les clés de ligne de la carte de routage', () => {
  const source = readFileSync(SERVICE, 'utf8');

  /** Les clés du `z.enum` du schéma, lues dans la source — jamais recopiées ici. */
  const clesDuSchema = (): string[] => {
    const trouve = /key:\s*z\.enum\(\[([^\]]+)\]\)/.exec(source);

    expect(trouve, 'le z.enum des clés de ligne a disparu du service').not.toBeNull();

    return trouve![1]
      .split(',')
      .map((brut) => brut.trim().replace(/^['"]|['"]$/gu, ''))
      .filter(Boolean);
  };

  it('mesure bien quelque chose : les deux listes sont non vides', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(AGENT_ROUTING_LINE_KEYS.length).toBeGreaterThanOrEqual(6);
    expect(clesDuSchema().length).toBeGreaterThanOrEqual(6);
  });

  it('le schéma de lecture dit EXACTEMENT ce que le billing déclare', () => {
    const billing = [...AGENT_ROUTING_LINE_KEYS].sort();
    const schema = clesDuSchema().sort();

    expect(
      billing.filter((cle) => !schema.includes(cle)),
      'déclarées au billing mais rejetées à la lecture — la carte stockée retombera en silence sur la carte intégrée',
    ).toEqual([]);

    expect(
      schema.filter((cle) => !billing.includes(cle as (typeof billing)[number])),
      'acceptées à la lecture mais inconnues du billing — aucun prix ne leur correspond',
    ).toEqual([]);

    expect(schema).toEqual(billing);
  });
});
