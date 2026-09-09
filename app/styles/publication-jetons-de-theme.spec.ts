import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/*
 * BUG-PUBLISH-THEME-001 — le panneau Déploiements ne peint plus en dur.
 *
 * Avi, 09/09 : « la police et les boutons sont trop gros ou pas comme le
 * thème ». Le panneau reprenait la palette de Replit LITTÉRALEMENT : son bleu
 * #0079f2 sur le bouton principal et sur « Réparer avec l'agent », et des
 * pastels clairs (#e6f4ea, #fbe4e4, #e6f0fb) dessinés pour un fond blanc —
 * alors que l'IDE est sombre par défaut et que notre action primaire est
 * orange. Un littéral ne bascule pas avec le thème : c'est la définition même
 * du « pas comme le thème ».
 *
 * Cette garde ne fige AUCUNE couleur. Elle interdit seulement qu'une valeur de
 * couleur soit écrite en dur dans ce bloc : la charte peut changer, elle
 * changera par les jetons.
 *
 * Elle lit la feuille COMMENTAIRES RETIRÉS (règle 5) : la prose ci-dessus cite
 * les hexadécimaux fautifs, et sans cela le test échouerait sur son propre
 * texte — ou pire, réussirait en croyant lire du code.
 */

const FEUILLE = readFileSync(join(__dirname, 'index.scss'), 'utf8');

/** La feuille sans commentaires : seules les déclarations comptent. */
const CODE = FEUILLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

interface Regle {
  selecteur: string;
  corps: string;
}

/**
 * Les règles dont le sélecteur nomme le panneau de publication.
 *
 * Découpage volontairement simple — un sélecteur, puis un corps sans accolade
 * imbriquée. Le bloc `.bolt-publication*` est écrit à plat dans la feuille ; si
 * un jour il ne l'est plus, le contrôle positif plus bas le dira.
 */
function reglesDePublication(): Regle[] {
  const regles: Regle[] = [];
  const motif = /([^{}]+)\{([^{}]*)\}/g;

  let trouve: RegExpExecArray | null;

  while ((trouve = motif.exec(CODE)) !== null) {
    const selecteur = trouve[1].trim();

    if (selecteur.includes('.bolt-publication')) {
      regles.push({ selecteur, corps: trouve[2] });
    }
  }

  return regles;
}

/** Une valeur de couleur écrite en dur, sous n'importe laquelle de ses formes. */
const COULEUR_EN_DUR = /(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/;

const REGLES = reglesDePublication();

describe('BUG-PUBLISH-THEME-001 — le panneau Déploiements suit les jetons de thème', () => {
  /*
   * CONTRÔLE POSITIF (règle 14). Un « zéro littéral » ne vaut que si
   * l'extraction a réellement lu le bloc. Ces deux assertions échouent si le
   * découpage cesse de trouver les règles — sans elles, supprimer tout le bloc
   * ferait passer le test au vert.
   */
  it('lit bien le bloc du panneau', () => {
    expect(REGLES.length).toBeGreaterThan(30);
    expect(REGLES.some((regle) => regle.selecteur.includes('.bolt-publication-republier'))).toBe(true);
    expect(REGLES.some((regle) => regle.selecteur.includes("[data-etat='encours']"))).toBe(true);
  });

  it('n’écrit plus aucune couleur en dur', () => {
    const fautives = REGLES.filter((regle) => COULEUR_EN_DUR.test(regle.corps)).map(
      (regle) => `${regle.selecteur} → ${regle.corps.trim().replace(/\s+/g, ' ')}`,
    );

    expect(fautives).toEqual([]);
  });

  it('peint le bouton principal avec l’accent du produit, pas celui d’un concurrent', () => {
    const republier = REGLES.find((regle) => regle.selecteur.trim() === '.bolt-publication-republier');

    expect(republier).toBeDefined();
    expect(republier!.corps).toContain('background: var(--vc-action-primary)');
    expect(republier!.corps).toContain('color: var(--vc-action-primary-foreground)');
  });

  it('donne aux états succès / échec les jetons qui basculent avec le thème', () => {
    const parSelecteur = (fin: string) => REGLES.find((regle) => regle.selecteur.trim().endsWith(fin));

    for (const [fin, jeton] of [
      ["[data-etat='fait']", '--status-success'],
      ["[data-etat='echec']", '--status-error'],
    ] as const) {
      const regle = parSelecteur(fin);

      expect(regle, fin).toBeDefined();
      expect(regle!.corps).toContain(`var(${jeton}-bg)`);
      expect(regle!.corps).toContain(`var(${jeton}-text)`);
    }
  });
});
