import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ON-ACCENT-001 — l'encre posée sur un aplat d'accent doit tenir AA dans LES
 * DEUX thèmes.
 *
 * Pourquoi ce fichier existe. `BUG-THEME-006` — « Commit changes » écrit en
 * BLEU sur l'orange, 1,07:1 — avait été corrigé en remplaçant le bleu par du
 * BLANC sur le MÊME orange. Remesuré ici : **3,22:1**, toujours sous AA. Le
 * correctif avait donc changé le symptôme sans franchir le seuil, et rien ne
 * l'avait vu parce que rien ne mesurait la paire.
 *
 * C'est le même constat que `BUG-THEME-011`, où le blanc sur cet orange
 * plafonne à 2,62:1 : sur la teinte de marque, le blanc n'est PAS rattrapable.
 *
 * La parade est structurelle : le fond et l'encre viennent d'une paire de
 * jetons déclarée ensemble, et la paire est mesurée dans chaque portée où elle
 * est déclarée — y compris les portées qui n'existent pas encore.
 */

const AA_BODY_TEXT = 4.5;

const SCSS = readFileSync(join(__dirname, 'index.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const canal = (v: number) => {
  const x = v / 255;

  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const pixels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c: number[]) => 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);

const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminance(pixels(a)), luminance(pixels(b))];

  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/**
 * Portées qui déclarent l'aplat ET son encre en littéral. Une portée qui les
 * ALIASE (`var(...)`) résout ailleurs et est mesurée là où elle atterrit ; on
 * ne devine pas une valeur pour la mesurer.
 */
function pairesDeclarees() {
  const out: { selecteur: string; fond: string; encre: string; ratio: number }[] = [];

  for (const [, selecteur, corps] of SCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const fond = corps.match(/--vc-action-primary:\s*(#[0-9a-f]{6})\s*;/i)?.[1];
    const encre = corps.match(/--vc-action-primary-foreground:\s*(#[0-9a-f]{6})\s*;/i)?.[1];

    if (!fond || !encre) {
      continue;
    }

    out.push({
      selecteur: selecteur.trim().split('\n').pop()!.trim(),
      fond,
      encre,
      ratio: contraste(encre, fond),
    });
  }

  return out;
}

describe('ON-ACCENT-001 — encre sur aplat d’accent', () => {
  it('la sonde a réellement trouvé des paires à mesurer', () => {
    /*
     * Une sonde qui rend « 0 défaut » parce qu'elle n'a rien su lire est le faux
     * négatif le plus coûteux. Le plancher est posé sous le nombre de portées
     * connues au moment de l'écriture (4 : les deux thèmes de la coque IDE et
     * les deux de la coque user area), pour que le renommage d'un jeton ou une
     * réécriture de la feuille tombe ici plutôt que de passer inaperçu.
     */
    expect(pairesDeclarees().length, 'portées déclarant la paire aplat/encre').toBeGreaterThanOrEqual(4);
  });

  it('chaque paire aplat/encre déclarée tient AA', () => {
    const fautifs = pairesDeclarees()
      .filter((p) => p.ratio < AA_BODY_TEXT)
      .map((p) => `${p.selecteur} → ${p.ratio.toFixed(2)} (${p.encre} sur ${p.fond})`);

    expect(fautifs, fautifs.join('\n')).toEqual([]);
  });

  /*
   * Ancré sur le CODE de la variante, pas sur son commentaire : c'est la classe
   * réellement émise qui décide de ce que l'utilisateur voit. Poser
   * `text-white` ici redonnerait 3,22:1 en clair.
   */
  it('le bouton d’action du panneau Git prend son encre dans la paire, pas en dur', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'git', 'GitTab.tsx'), 'utf8');

    const variante = source
      .split('\n')
      .filter((l) => /variant === 'accent'/.test(l) || /vc-action-primary/.test(l))
      .join('\n');

    expect(variante, 'la variante accent doit exister').toMatch(/variant === 'accent'/);
    expect(variante, 'fond pris dans le jeton d’aplat').toMatch(/bg-\[var\(--vc-action-primary\)\]/);
    expect(variante, 'encre prise dans le jeton apparié').toMatch(/text-\[var\(--vc-action-primary-foreground\)\]/);
  });
});
