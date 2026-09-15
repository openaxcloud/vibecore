/*
 * CVE-2026-59873 — le `tar` vulnérable venait du npm EMBARQUÉ dans l'image de
 * base, pas de nos dépendances. Aucun `override` pnpm ne peut l'atteindre.
 *
 * Garde de SOURCE (espèce annoncée) : elle vérifie la déclaration, pas l'image
 * construite. La preuve reste le scan de vulnérabilités sur les digests réels,
 * qui est justement la porte qui a bloqué 7 images sur 7 le 2026-09-03.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** Les images qui SERVENT du trafic. Le screenshotter a sa propre base. */
const IMAGES = ['Dockerfile', join('infra', 'docker', 'node-service.Dockerfile')];

function sansCommentaires(texte) {
  return texte
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('npm ne doit pas rester dans une image d’exécution', () => {
  it('1. chaque image de service supprime npm et corepack', () => {
    // Témoin : sans fichier, l'assertion suivante passerait à vide.
    expect(IMAGES.length).toBeGreaterThan(1);

    for (const image of IMAGES) {
      const src = sansCommentaires(readFileSync(join(RACINE, image), 'utf8'));

      expect(src, `${image} ne supprime pas npm`).toMatch(/rm -rf[^\n]*node_modules\/npm/);
      expect(src, `${image} ne supprime pas corepack`).toMatch(/corepack/);
    }
  });

  it('2. la suppression précède le passage en utilisateur non-root', () => {
    /*
     * `rm` dans /usr/local exige root. Placé après `USER node`, il échouerait —
     * et l'image repartirait avec sa vulnérabilité, sans que rien ne le dise.
     */
    for (const image of IMAGES) {
      const src = sansCommentaires(readFileSync(join(RACINE, image), 'utf8'));
      const suppression = src.search(/rm -rf[^\n]*node_modules\/npm/);
      const nonRoot = src.search(/^USER node$/m);

      expect(suppression, `${image} : suppression introuvable`).toBeGreaterThanOrEqual(0);
      expect(nonRoot, `${image} : USER node introuvable`).toBeGreaterThanOrEqual(0);
      expect(suppression, `${image} : la suppression doit précéder USER node`).toBeLessThan(nonRoot);
    }
  });
});
