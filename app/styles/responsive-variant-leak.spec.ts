import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * VARIANT-LEAK-001 — un sélecteur `[class*=X]` attrape aussi `sm:X`, `lg:X`…
 *
 * Une classe utilitaire responsive porte son point de rupture DANS SON NOM :
 * `sm:text-xs` n'applique `text-xs` qu'à partir de `sm`. Mais un sélecteur CSS
 * écrit `[class*=text-xs]` fait une recherche de SOUS-CHAÎNE : il matche
 * `sm:text-xs` à TOUTES les largeurs, y compris sur mobile où la variante ne
 * devait justement pas s'appliquer.
 *
 * Le style réservé au bureau est donc appliqué au mobile, en silence, et avec
 * `!important` il gagne même contre la valeur que l'auteur avait écrite pour le
 * mobile. C'est comme ça qu'un libellé se retrouve à une taille qu'aucun auteur
 * n'a demandée.
 *
 * LE GARDE-FOU EXISTE DÉJÀ, appliqué à 3 sélecteurs sur 58 :
 * `[class*=text-xs]:not([class*=":text-xs"])` — le `:not` exclut tout ce qui
 * porte un préfixe de point de rupture. Ce test généralise la règle : aucun
 * sélecteur non gardé ne doit matcher une classe qui EXISTE en variante
 * responsive dans le produit.
 *
 * Croisement, et non liste : on lit les sélecteurs depuis la feuille COMPILÉE
 * et les variantes réellement écrites depuis les composants. Un sélecteur non
 * gardé dont la cible n'a aucune variante n'est pas signalé — il ne peut rien
 * casser.
 */

const CSS = compile(join(join(__dirname), 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');
const RACINE = join(__dirname, '..');

/** Classes réellement utilisées avec un préfixe de point de rupture. */
function variantesResponsives(): Set<string> {
  const out = new Set<string>();

  const parcourir = (dir: string) => {
    for (const entree of readdirSync(dir)) {
      const chemin = join(dir, entree);

      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (/\.tsx?$/.test(entree) && !chemin.includes('.spec.')) {
        for (const m of readFileSync(chemin, 'utf8').matchAll(
          /\b(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg):([a-zA-Z0-9_[\]#()./-]+)/g,
        )) {
          out.add(m[1]);
        }
      }
    }
  };

  parcourir(RACINE);

  return out;
}

/** Sélecteurs `[class*=X]` SANS `:not([class*=":…"])`, dont X a une variante. */
function fuites() {
  const variantes = variantesResponsives();
  const out: Array<{ selecteur: string; cible: string; variante: string }> = [];

  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selecteur = m[1].trim().split('\n').pop()!.trim();

    if (/:not\(\[class\*=["']:/.test(selecteur)) {
      continue;
    }

    for (const a of selecteur.matchAll(/\[class\*=["']?([^\]"']+)["']?\]/g)) {
      const cible = a[1];

      if (cible.startsWith(':')) {
        continue;
      }

      const variante = [...variantes].find((v) => v === cible || v.startsWith(cible));

      if (variante) {
        out.push({ selecteur, cible, variante });
        break;
      }
    }
  }

  return out;
}

/**
 * Fuites CONNUES, laissées telles quelles — elles vivent dans le composeur et le
 * panneau Agent, tenus par une autre session. Elles lui ont été signalées avec
 * leur mesure ; les corriger ici entrerait en collision avec son travail.
 *
 * Elles sont listées pour que le cliquet reste HONNÊTE : on n'ajoute pas une
 * exemption large, on nomme exactement ce qu'on tolère et pourquoi.
 */
const FUITES_CONNUES = [
  /*
   * `sm:text-xs` (AgentPowerControls.tsx:251) rattrapé => 15px !important à 390,
   * alors que l'auteur avait écrit `text-[11px]` pour le mobile.
   */
  '.bolt-project-ide-shell .bolt-agent-power-popover :where(.text-xs, small, [class*=text-xs])',

  /* `sm:px-6` (BaseChat.tsx) rattrapé => padding du bureau appliqué à 390. */
  '.bolt-project-agent-panel [class*=px-6]',
];

describe('VARIANT-LEAK-001 — une variante réservée au bureau ne fuit pas en mobile', () => {
  it('la sonde lit bien les deux sources', () => {
    /*
     * Témoin : sans lui, un chemin cassé rendrait « 0 fuite » sans rien lire —
     * le faux vert le plus probable ici, puisque le résultat attendu EST une
     * liste vide.
     */
    expect(CSS.length, 'feuille compilée lue').toBeGreaterThan(100000);
    expect(variantesResponsives().size, 'variantes responsives trouvées dans les composants').toBeGreaterThan(50);
  });

  it('aucune fuite NOUVELLE', () => {
    const nouvelles = fuites()
      .filter((f) => !FUITES_CONNUES.includes(f.selecteur))
      .map((f) => `${f.selecteur}\n    attrape « ${f.variante} » via [class*=${f.cible}]`);

    expect(
      nouvelles,
      'Un sélecteur non gardé attrape une variante responsive : le style du bureau\n' +
        'sera appliqué en mobile. Ajouter `:not([class*=":<cible>"])` au sélecteur.\n' +
        nouvelles.join('\n'),
    ).toEqual([]);
  });

  it('la liste des fuites connues reste honnête', () => {
    /*
     * Si une fuite connue est corrigée, elle doit sortir de la liste — sinon
     * l'exemption survit à son motif et couvre un sélecteur neuf portant le
     * même nom.
     */
    const actuelles = fuites().map((f) => f.selecteur);
    const perimees = FUITES_CONNUES.filter((s) => !actuelles.includes(s));

    expect(perimees, 'ces fuites n’existent plus — les retirer de FUITES_CONNUES').toEqual([]);
  });
});
