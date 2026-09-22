/*
 * La feuille des modes occupe la place disponible, pas une fraction de l'écran.
 *
 * Défaut mesuré en production le 2026-09-22, à 390×844, sur `8845fb9965` :
 *
 *     max-height calculée : 472.64px   (0.56 × 844 = 472.64)
 *     scrollHeight : 558   clientHeight : 471   overflow-y : auto
 *     ancre basse : bottom 72px (la barre de navigation), aucun chevauchement
 *
 * Le contenu n'était donc ni COUPÉ ni FIGÉ : il défilait dans une feuille deux
 * fois trop courte. À l'écran ça se lit comme une troncature, et c'est ce
 * qu'Avi a signalé.
 *
 * Le plafond fractionnaire avait été posé pour un vrai défaut — un panneau plus
 * haut que la place libre se faisait trancher EN HAUT. Mais la borne qui
 * protège de ça, c'est la place libre elle-même :
 *
 *     espace utile − hauteur de la barre − zone sûre − marge haute
 *
 * Avec une ancre basse, cette expression ne peut PAS déborder par le haut. Les
 * fractions (`0.56 *`, `0.64 *`) et le plafond fixe `520px` ne protégeaient
 * rien de plus et bornaient la feuille bien en deçà de la place libre.
 *
 * Cette garde lit la FEUILLE DE STYLES du produit, jamais une copie : une
 * garde qui embarque sa propre copie du CSS passe au vert pendant que le
 * produit régresse.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const FEUILLE = join(process.cwd(), 'app', 'styles', 'index.scss');

/** Les blocs dont le sélecteur vise la feuille des modes sur mobile. */
function blocsDeLaFeuille(): Array<{ selecteur: string; corps: string }> {
  const source = readFileSync(FEUILLE, 'utf8');
  const lignes = source.split('\n');
  const blocs: Array<{ selecteur: string; corps: string }> = [];

  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i].trim();

    /*
     * La FEUILLE MOBILE, et elle seule : c'est là qu'une fraction de l'écran
     * bornait la hauteur. Le panneau flottant de bureau, porté à `body`, se
     * borne à la fenêtre et n'a ni barre de navigation ni zone sûre à déduire —
     * l'y soumettre ferait rougir la garde sur une règle qui n'a jamais eu le
     * défaut.
     */
    if (!ligne.endsWith('{') || !ligne.includes('.bolt-agent-power-popover')) {
      continue;
    }

    if (!ligne.includes('bolt-responsive-ide-mobile')) {
      continue;
    }

    const corps: string[] = [];

    for (let j = i + 1; j < lignes.length && lignes[j].trim() !== '}'; j += 1) {
      corps.push(lignes[j]);
    }

    blocs.push({ selecteur: ligne.slice(0, -1).trim(), corps: corps.join('\n') });
  }

  return blocs;
}

describe('la feuille des modes peut occuper toute la hauteur utile', () => {
  const blocs = blocsDeLaFeuille();

  /*
   * Contrôle positif : sans ce compte, une recherche qui ne trouve rien rendrait
   * vert sans avoir rien vérifié.
   */
  it('les blocs de la feuille sont bien trouvés dans la feuille de styles', () => {
    expect(blocs.length).toBeGreaterThanOrEqual(2);
  });

  const avecHauteur = blocs.filter((b) => /max-height:/.test(b.corps));

  it('au moins deux blocs bornent la hauteur', () => {
    expect(avecHauteur.length).toBeGreaterThanOrEqual(2);
  });

  it('aucun ne borne la feuille à une FRACTION de l’espace utile', () => {
    const fautifs = avecHauteur
      .filter((b) => /max-height:[^;]*[0-9]*\.?[0-9]+\s*\*\s*var\(--vc-mobile-espace-utile\)/s.test(b.corps))
      .map((b) => b.selecteur);

    expect(fautifs, `plafond fractionnaire sur : ${fautifs.join(' | ')}`).toEqual([]);
  });

  /*
   * Pas de `min(...)` : c'est la forme que prend un plafond CONCURRENT. Les
   * soustractions à l'intérieur du `calc` (la marge haute, la barre) sont la
   * borne elle-même et restent légitimes — ce qu'on refuse, c'est une seconde
   * borne qui gagne sur la place libre.
   */
  it('aucune borne concurrente ne vient plafonner la place libre', () => {
    const fautifs = avecHauteur.filter((b) => /max-height:\s*min\(/s.test(b.corps)).map((b) => b.selecteur);

    expect(fautifs, `borne concurrente sur : ${fautifs.join(' | ')}`).toEqual([]);
  });

  /*
   * L'autre moitié du couple (règle 6) : retirer les plafonds ne doit pas faire
   * disparaître la protection. La borne DOIT rester exprimée à partir de la
   * place libre, barre de navigation et zone sûre déduites — sinon la feuille
   * repasserait sous la barre ou se ferait trancher en haut.
   */
  it('chaque borne se déduit de la place libre, barre et zone sûre comprises', () => {
    for (const bloc of avecHauteur) {
      const m = /max-height:\s*([^;]+);/s.exec(bloc.corps);
      expect(m, `pas de max-height lisible sur ${bloc.selecteur}`).not.toBeNull();

      const expression = m![1];
      expect(expression, `${bloc.selecteur} : l’espace utile manque`).toContain('--vc-mobile-espace-utile');
      expect(expression, `${bloc.selecteur} : la barre du bas manque`).toContain('--mobile-nav-height');
      expect(expression, `${bloc.selecteur} : la zone sûre manque`).toContain('safe-area-inset-bottom');
    }
  });

  it('la feuille reste défilante — une feuille plus haute que l’écran doit glisser', () => {
    for (const bloc of avecHauteur) {
      expect(bloc.corps, `${bloc.selecteur} : overflow-y manquant`).toMatch(/overflow-y:\s*auto/);
    }
  });
});
