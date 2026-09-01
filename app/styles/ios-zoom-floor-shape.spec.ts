import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * IOS-ZOOM — forme du plancher 16 px, mesurée sur la feuille COMPILÉE.
 *
 * Ce garde-fou porte sur la RÈGLE, pas sur un symptôme rendu : au moment où il
 * est écrit, aucun champ atteignable ne descend sous 16 px — la PR #319 a
 * corrigé la zone de saisie de l'agent, qui était le seul champ fautif observé.
 * Les deux faiblesses ci-dessous restent pourtant dans la feuille, simplement
 * MASQUÉES. Sans garde, la prochaine règle de classe posée sur un champ les
 * réveille en silence.
 *
 * Ce qui est vérifié, et pourquoi :
 *
 * 1. LA BORNE. Le bloc s'arrêtait à 639.98px : entre 640 et 1023px — grand
 *    téléphone en paysage, tablette 768 que le produit traite comme du mobile —
 *    aucun plancher ne s'appliquait. Safari iOS zoome pourtant sur toute cette
 *    plage.
 *
 * 2. LA SPÉCIFICITÉ, ASYMÉTRIQUE. La spécificité se calcule PAR SÉLECTEUR d'une
 *    liste. Écrite `input:not(…)×5, textarea, select`, la branche `input` pèse
 *    (0,5,1) et gagne, mais `textarea` et `select` pèsent (0,0,1) et perdent
 *    contre la moindre règle de classe — or la zone de saisie de l'agent est un
 *    `<textarea>`. Un plancher qui ne protège que deux tiers des types de champ
 *    n'est pas un plancher.
 */

const RACINE = join(__dirname, '..', '..');

/*
 * On compile LE PARTIEL SEUL, pas `index.scss`.
 *
 * Première version de ce garde-fou : elle cherchait la déclaration dans la
 * feuille complète et tombait sur une AUTRE règle qui la satisfaisait déjà.
 * Résultat : elle passait aussi bien avec le plancher corrigé qu'avec celui
 * d'avant — un test vert qui ne testait pas son sujet, exactement le défaut
 * qu'on traque. Compiler le fichier qui porte la règle supprime l'ambiguïté.
 */
const CSS = compile(join(RACINE, 'app', 'styles', '_ios-input-zoom.scss'), {
  loadPaths: [join(RACINE, 'app', 'styles')],
  style: 'expanded',
}).css;

/**
 * Découpe une liste de sélecteurs sur les virgules DE PREMIER NIVEAU.
 *
 * Un `split(',')` naïf brise `:is(input, textarea, select)` en fragments, et le
 * fragment `textarea` pèse alors 0 : la mesure conclurait que le plancher ne
 * protège pas les `textarea` alors qu'il le fait. Une sonde qui se trompe de
 * découpage accuse le code à sa place.
 */
function decouperSelecteurs(liste: string): string[] {
  const parties: string[] = [];

  let profondeur = 0;
  let courant = '';

  for (const caractere of liste) {
    if (caractere === '(') {
      profondeur += 1;
    }

    if (caractere === ')') {
      profondeur -= 1;
    }

    if (caractere === ',' && profondeur === 0) {
      parties.push(courant.trim());
      courant = '';
      continue;
    }

    courant += caractere;
  }

  parties.push(courant.trim());

  return parties.filter(Boolean);
}

/** Poids (classes + attributs + pseudo-classes) d'un sélecteur composé. */
function poidsDeClasse(selecteur: string): number {
  return (selecteur.match(/\.[\w-]+|\[[^\]]+\]|:not\(|:is\(|:where\(/g) ?? []).filter((t) => t !== ':where(').length;
}

/**
 * Le bloc du plancher : la règle qui pose `font-size: max(16px, 1em)` sur les
 * champs texte, avec sa condition `@media`.
 *
 * L'extraction remonte depuis la DÉCLARATION — le seul point d'ancrage sûr —
 * puis lit en arrière le sélecteur puis le `@media` englobant. Un `match()`
 * partant du `@media` attrapait un bloc voisin : quand une sonde peut viser à
 * côté, elle finit par le faire.
 */
function blocDuPlancher(): { media: string; selecteurs: string[] } {
  const iDecl = CSS.indexOf('font-size:');

  expect(iDecl, 'le plancher 16px est introuvable dans le partiel compilé').toBeGreaterThan(-1);

  const avant = CSS.slice(0, iDecl);

  // Le sélecteur est ce qui précède la dernière accolade ouvrante.
  const iAccolade = avant.lastIndexOf('{');
  const iAvantSelecteur = Math.max(avant.lastIndexOf('}', iAccolade), avant.lastIndexOf('{', iAccolade - 1));
  const selecteurs = decouperSelecteurs(avant.slice(iAvantSelecteur + 1, iAccolade));

  // Le `@media` englobant est le dernier ouvert avant ce sélecteur.
  const iMedia = avant.lastIndexOf('@media');
  const media = avant.slice(iMedia, avant.indexOf('{', iMedia)).trim();

  return { media, selecteurs };
}

describe('IOS-ZOOM — le plancher 16px couvre la plage tactile ET tous les types de champ', () => {
  it('couvre au-delà de 639.98px : le zoom touche toute la plage 640→1023', () => {
    const { media } = blocDuPlancher();

    expect(media).toContain('max-width: 1024px');
    expect(media, 'la borne s’arrête sous 1024px, la plage 640→1023 reste découverte').not.toMatch(/639\.98/);
  });

  it('couvre aussi la tablette au doigt au-delà de 1024px', () => {
    const { media } = blocDuPlancher();

    expect(media).toMatch(/any-pointer:\s*coarse/);
  });

  it('protège `textarea` et `select` avec le MÊME poids que `input`', () => {
    const { selecteurs } = blocDuPlancher();

    const pour = (type: string) => selecteurs.filter((s) => new RegExp(`(^|\\s|\\()${type}\\b`).test(s));

    for (const type of ['input', 'textarea', 'select']) {
      const branches = pour(type);
      expect(branches.length, `aucune branche du plancher ne vise \`${type}\``).toBeGreaterThan(0);
    }

    /*
     * Le minimum sur `textarea` doit égaler le minimum sur `input` : c'est
     * exactement l'asymétrie qui laissait la zone de saisie de l'agent sans
     * plancher pendant que les `<input>` étaient protégés.
     */
    const minPoids = (type: string) => Math.min(...pour(type).map(poidsDeClasse));

    expect(minPoids('textarea'), 'le plancher pèse moins sur `textarea` que sur `input`').toBeGreaterThanOrEqual(
      minPoids('input'),
    );
    expect(minPoids('select'), 'le plancher pèse moins sur `select` que sur `input`').toBeGreaterThanOrEqual(
      minPoids('input'),
    );
  });

  it('reste exprimé en PIXELS — la base rem du produit vaut 12/14px', () => {
    const { selecteurs } = blocDuPlancher();

    expect(selecteurs.length).toBeGreaterThan(0);
    expect(CSS).toMatch(/font-size:\s*max\(16px, 1em\)/);
    expect(CSS, 'le plancher doit être une GARANTIE, donc `!important`').toContain('!important');
    expect(CSS, 'une valeur en rem serait déformée par la base 12/14px').not.toMatch(/font-size:[^;]*rem/);
  });
});
