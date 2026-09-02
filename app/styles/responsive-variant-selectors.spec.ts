import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Un sélecteur de sous-chaîne ne doit pas attraper une variante réservée à un
 * écran plus large.
 *
 * Le défaut d'origine, mesuré le 2026-09-02 : `[class*='text-xs']` attrapait
 * `sm:text-xs` — une classe qui ne s'applique qu'à partir de 640px. En mobile,
 * l'élément n'a PAS `text-xs`, mais le sélecteur le croyait ; il héritait donc
 * de `--vc-type-label-size`, soit 9px. « Léger », « Économique » et
 * « Puissance » étaient rendus illisibles dans le détail « Avancé ».
 *
 * Le critère est précis, et il a fallu deux passes pour l'écrire juste : le
 * sélecteur ne ment que si sa règle peut s'appliquer SOUS le seuil de la
 * variante. `.bolt-project-agent-panel [class*='px-6']` attrape bien
 * `sm:px-6`, mais sa règle est bornée à `min-width: 900px`, où `sm:` est déjà
 * actif — ce n'est donc pas un défaut, et l'écarter à tort aurait fait passer
 * ce garde-fou pour une chasse aux fantômes.
 */

const SEUILS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };

const scss = readFileSync('app/styles/index.scss', 'utf-8');

/** Parcours récursif : le paquet `glob` n'est pas une dépendance de ce dépôt. */
function fichiersTsx(racine: string): string[] {
  const trouves: string[] = [];

  for (const entree of readdirSync(racine, { withFileTypes: true })) {
    const chemin = join(racine, entree.name);

    if (entree.isDirectory()) {
      trouves.push(...fichiersTsx(chemin));
    } else if (entree.name.endsWith('.tsx') && !entree.name.endsWith('.spec.tsx')) {
      trouves.push(chemin);
    }
  }

  return trouves;
}

const sourceDuProduit = fichiersTsx('app')
  .map((chemin) => readFileSync(chemin, 'utf-8'))
  .join('\n');

/** Contexte `@media` de chaque ligne de la feuille, reconstruit par comptage d'accolades. */
function contextesParLigne(feuille: string): string[] {
  const lignes = feuille.split('\n');
  const contextes: string[] = [];
  let pile: Array<{ condition: string; profondeur: number }> = [];
  let profondeur = 0;

  for (const ligne of lignes) {
    const ouverture = /^\s*@media ([^{]+)\{/.exec(ligne);

    if (ouverture) {
      pile.push({ condition: ouverture[1].trim(), profondeur });
    }

    profondeur += (ligne.match(/\{/g) ?? []).length - (ligne.match(/\}/g) ?? []).length;
    pile = pile.filter((entree) => entree.profondeur < profondeur);
    contextes.push(pile.map((entree) => entree.condition).join(' AND '));
  }

  return contextes;
}

describe('sélecteurs de sous-chaîne et variantes responsives', () => {
  it('aucun sélecteur n’attrape une variante réservée à un écran plus large', () => {
    const lignes = scss.split('\n');
    const contextes = contextesParLigne(scss);
    const fautes: string[] = [];

    lignes.forEach((ligne, index) => {
      for (const [, sousChaine] of ligne.matchAll(/\[class\*=['"]([^'"]+)['"]\]/g)) {
        for (const [prefixe, seuil] of Object.entries(SEUILS)) {
          const varianteUtilisee = new RegExp(`\\b${prefixe}:${sousChaine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

          if (!varianteUtilisee.test(sourceDuProduit)) {
            continue;
          }

          /*
           * L'exclusion des variantes vaut protection : `[class*='text-xs']`
           * suivi de `:not([class*=':text-xs'])` ne peut plus attraper
           * `sm:text-xs`, puisque toute variante porte un deux-points.
           */
          if (ligne.includes(`:not([class*=':${sousChaine}'])`) || ligne.includes(`:not([class*=":${sousChaine}"])`)) {
            continue;
          }

          const contexte = contextes[index];
          const plancher = Number(/min-width:\s*(\d+)px/.exec(contexte)?.[1] ?? 0);

          if (plancher < seuil) {
            fautes.push(
              `l.${index + 1} [class*='${sousChaine}'] attrape « ${prefixe}:${sousChaine} » (actif seulement à partir de ${seuil}px) ` +
                `alors que la règle s'applique dès ${plancher}px${contexte ? ` (${contexte})` : ' (aucune requête media)'}`,
            );
          }
        }
      }
    });

    expect(fautes, `\n${fautes.join('\n')}\n`).toEqual([]);
  });
});
