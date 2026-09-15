/*
 * SURF-02 — garde de SOURCE, pas test discriminant de comportement.
 *
 * Espèce assumée (cf. règle de méthode) : une feuille de style ne s'exécute pas
 * ici, donc cette garde ne prouve PAS le rendu. Elle empêche seulement la
 * régression silencieuse consistant à retirer la borne. **La preuve reste la
 * vérification live sur 390 / 768 / 1440, menu ouvert avec assez d'entrées pour
 * déborder** — un menu court ne prouve rien, le défaut n'apparaît qu'au
 * débordement.
 *
 * Les commentaires sont retirés avant analyse : une garde qui matche sa propre
 * prose ne garde rien.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const FEUILLE = join(fileURLToPath(new URL('.', import.meta.url)), 'terminal.scss');

function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Bloc de déclarations d'une règle, repérée par sa LISTE DE SÉLECTEURS exacte.
 *
 * Ancré en début de ligne et sur la liste complète : chercher un simple
 * `indexOf('.x {')` attrapait la règle GROUPÉE `.x, .y {` et faisait porter
 * l'assertion sur le mauvais bloc — constaté en écrivant cette garde.
 */
function bloc(scss: string, selecteurs: string): string {
  const motif = new RegExp(
    `^${selecteurs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\n')}\\s*\\{([^}]*)\\}`,
    'm',
  );

  const trouve = scss.match(motif);

  expect(trouve, `règle « ${selecteurs} » introuvable`).not.toBeNull();

  return trouve![1];
}

describe('SURF-02 — menus du terminal bornés en hauteur', () => {
  it('borne la hauteur en unité liée à l’écran ET fait défiler', () => {
    const scss = sansCommentaires(readFileSync(FEUILLE, 'utf8'));
    const declarations = bloc(scss, '.bolt-terminal-session-menu,\n.bolt-terminal-more-menu');

    /*
     * `dvh` et non `vh` : `vh` ignore la barre d'outils mobile rétractable,
     * c'est ce qui faisait passer le panneau SOUS la barre.
     */
    expect(declarations).toMatch(/max-height:\s*min\([^)]*dvh/);

    // Borner sans défiler couperait le contenu au lieu de le rendre atteignable.
    expect(declarations).toMatch(/overflow:\s*auto/);
  });

  it('conserve la largeur déjà bornée — on n’échange pas un axe contre l’autre', () => {
    /*
     * Le correctif ajoute la hauteur ; il ne doit pas faire disparaître la
     * largeur, qui elle était déjà juste. Garde de source, comme la précédente.
     */
    const scss = sansCommentaires(readFileSync(FEUILLE, 'utf8'));

    expect(scss).toMatch(/\.bolt-terminal-session-menu\s*\{[^}]*width:\s*min\(320px,\s*calc\(100vw/);
    expect(scss).toMatch(/\.bolt-terminal-more-menu\s*\{[^}]*width:\s*min\(300px,\s*calc\(100vw/);
  });
});
