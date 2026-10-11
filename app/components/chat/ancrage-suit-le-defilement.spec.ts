/*
 * Les deux panneaux suivent leur point d'attache quand la page défile.
 *
 * Défaut signalé par Avi : « quand je scroll le mur de la conversation, le
 * contenu part à gauche », sur bureau seulement. Le second panneau est porté à
 * `document.body` et positionné en `fixed` sur des coordonnées mesurées à
 * l'ouverture ; sans écoute du défilement, il reste immobile pendant que son
 * ancre s'en va.
 *
 * Le PREMIER panneau écoutait déjà `resize` ET `scroll` en capture ; le second
 * n'écoutait que `resize`. La garde lit les deux sources et exige la même règle
 * des deux côtés — une asymétrie entre deux ancrages du même panneau est
 * précisément ce qui a produit le défaut.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCES = {
  'FeuilleDesModes.tsx (second panneau)': 'FeuilleDesModes.tsx',
  'AgentPowerControls.tsx (panneau des modes)': 'AgentPowerControls.tsx',
} as const;

function source(fichier: string): string {
  return readFileSync(join(process.cwd(), 'app', 'components', 'chat', fichier), 'utf8');
}

describe('l’ancrage d’un panneau flottant', () => {
  for (const [nom, fichier] of Object.entries(SOURCES)) {
    it(`${nom} — écoute le redimensionnement`, () => {
      expect(source(fichier)).toMatch(/addEventListener\('resize',\s*mesurer\)/);
    });

    /*
     * La capture est l'autre moitié : le fil défile dans un conteneur interne,
     * donc un écouteur posé sur la fenêtre sans `capture` ne verrait jamais son
     * événement, et la garde passerait au vert sur un ancrage qui ne suit rien.
     */
    it(`${nom} — écoute le défilement, en capture`, () => {
      expect(source(fichier)).toMatch(/addEventListener\('scroll',\s*mesurer,\s*true\)/);
    });

    it(`${nom} — retire ce qu’il a posé`, () => {
      const s = source(fichier);

      expect(s).toMatch(/removeEventListener\('resize',\s*mesurer\)/);
      expect(s).toMatch(/removeEventListener\('scroll',\s*mesurer,\s*true\)/);
    });
  }
});
