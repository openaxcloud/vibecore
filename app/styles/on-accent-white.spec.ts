import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * ON-ACCENT-002 — l'encre posée sur un aplat d'accent PLEIN doit basculer avec
 * le thème.
 *
 * L'aplat s'inverse : en CLAIR il est foncé et porte du blanc, en SOMBRE il est
 * vif et le blanc n'y tient plus. Mesuré sur la feuille compilée :
 *
 *   aplat   | blanc clair | blanc sombre | encre sombre
 *   action  |    5,18     |   2,80 ✗     |    6,33
 *   erreur  |    4,83     |   3,35 ✗     |    5,29
 *
 * Un `text-white` en dur est donc juste dans un thème et faux dans l'autre.
 *
 * ⚠️ LE PIÈGE, et la raison pour laquelle ce test vise UNIQUEMENT les aplats
 * basculants : `--vc-action-primary-strong` vaut #c2410c dans TOUS les thèmes.
 * Le blanc y tient des deux côtés (5,18) et 34 endroits l'utilisent
 * légitimement. Y appliquer le jeton d'encre le CASSERAIT en sombre (3,43).
 * Élargir cette garde à « tout aplat d'accent » fabriquerait donc 34 défauts.
 */

const AA_BODY_TEXT = 4.5;
const RACINE = join(__dirname, '..');

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

const BLOCS = new Map<string, Map<string, string>>();

for (const [, selecteur, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const cle = selecteur.trim().split('\n').pop()!.trim();
  const decls = BLOCS.get(cle) ?? new Map<string, string>();

  for (const declaration of corps.split(';')) {
    const i = declaration.indexOf(':');

    if (i > 0) {
      decls.set(declaration.slice(0, i).trim(), declaration.slice(i + 1).trim());
    }
  }

  BLOCS.set(cle, decls);
}

function jeton(theme: 'light' | 'dark', nom: string, profondeur = 0): string | undefined {
  const brut = BLOCS.get(`:root[data-theme=${theme}]`)?.get(nom) ?? BLOCS.get(':root')?.get(nom);

  if (!brut || profondeur > 6) {
    return brut;
  }

  const alias = brut.match(/^var\(\s*(--[\w-]+)/);

  return alias ? jeton(theme, alias[1], profondeur + 1) : brut;
}

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

/** Aplats qui BASCULENT, avec le jeton d'encre qui leur est apparié. */
const BASCULANTS = [
  { aplat: '--vc-ide-accent-action', encre: '--vc-ide-on-accent-action' },
  { aplat: '--vc-ide-accent-error', encre: '--vc-ide-on-accent-error' },
] as const;

/**
 * Aplats FIGÉS trop clairs pour porter du blanc — dans les DEUX thèmes.
 * `--ecode-accent` (#f26207) rend 3,22:1 sous du blanc, en clair comme en
 * sombre : ce n'est pas un défaut de bascule, l'aplat lui-même est trop clair.
 * Une encre qui bascule ne le corrige donc PAS ; il faut la paire
 * aplat/encre sanctionnée (`--vc-action-primary` + son `-foreground`), qui rend
 * 5,18 en clair et 6,33 en sombre. Même constat que BUG-THEME-011, où le blanc
 * sur cette teinte plafonne à 2,62.
 */
const TROP_CLAIRS = ['--ecode-accent'] as const;

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);

    if (statSync(chemin).isDirectory()) {
      fichiers(chemin, acc);
    } else if (/\.tsx?$/.test(entree) && !chemin.includes('.spec.')) {
      acc.push(chemin);
    }
  }

  return acc;
}

describe('ON-ACCENT-002 — encre sur aplat d’accent plein', () => {
  it('la sonde lit bien la feuille et l’arborescence', () => {
    /* Témoin : sans lui, un chemin cassé rendrait « 0 défaut » sans rien mesurer. */
    expect(BLOCS.size, 'blocs CSS lus').toBeGreaterThan(100);
    expect(fichiers(RACINE).length, 'fichiers source lus').toBeGreaterThan(300);
  });

  it('MÉCANISME 1 — les jetons d’encre s’inversent et tiennent AA des deux côtés', () => {
    for (const { aplat, encre } of BASCULANTS) {
      const clair = jeton('light', aplat)!;
      const sombre = jeton('dark', aplat)!;
      const encreClaire = jeton('light', encre)!;
      const encreSombre = jeton('dark', encre)!;

      expect(encreClaire, `${encre} en clair`).toBe('#ffffff');
      expect(encreSombre, `${encre} en sombre`).toBe('#111827');

      expect(contraste(encreClaire, clair), `${encre} sur ${aplat} en clair`).toBeGreaterThanOrEqual(AA_BODY_TEXT);
      expect(contraste(encreSombre, sombre), `${encre} sur ${aplat} en sombre`).toBeGreaterThanOrEqual(AA_BODY_TEXT);
    }
  });

  it('MÉCANISME 2 — plus aucun `text-white` en dur sur un aplat basculant', () => {
    const fautifs: string[] = [];

    for (const chemin of fichiers(RACINE)) {
      for (const [index, ligne] of readFileSync(chemin, 'utf8').split('\n').entries()) {
        if (!/\btext-white\b/.test(ligne)) {
          continue;
        }

        for (const { aplat } of BASCULANTS) {
          if (new RegExp(String.raw`bg-\[var\(${aplat}[,)]`).test(ligne)) {
            fautifs.push(`${chemin.replace(RACINE, 'app')}:${index + 1}`);
          }
        }
      }
    }

    expect(fautifs, `blanc en dur sur un aplat qui bascule :\n${fautifs.join('\n')}`).toEqual([]);
  });

  it('aucun aplat trop clair ne porte du blanc, dans aucun thème', () => {
    const fautifs: string[] = [];

    for (const chemin of fichiers(RACINE)) {
      for (const [index, ligne] of readFileSync(chemin, 'utf8').split('\n').entries()) {
        if (!/\btext-white\b/.test(ligne)) {
          continue;
        }

        for (const aplat of TROP_CLAIRS) {
          if (new RegExp(String.raw`bg-\[var\(${aplat}[,)]`).test(ligne)) {
            fautifs.push(`${chemin.replace(RACINE, 'app')}:${index + 1}`);
          }
        }
      }
    }

    expect(fautifs, `blanc sur un aplat trop clair :\n${fautifs.join('\n')}`).toEqual([]);
  });

  it('la mesure qui justifie de les traiter à part', () => {
    for (const aplat of TROP_CLAIRS) {
      const clair = jeton('light', aplat)!;
      const sombre = jeton('dark', aplat)!;

      expect(sombre, `${aplat} ne bascule pas`).toBe(clair);
      expect(contraste('#ffffff', clair), `blanc sur ${aplat}`).toBeLessThan(AA_BODY_TEXT);
    }
  });

  it('un aplat qui NE bascule PAS garde son blanc — l’élargir fabriquerait des défauts', () => {
    /*
     * Contre-garde explicite. `--vc-action-primary-strong` est figé à #c2410c
     * dans les deux thèmes : le blanc y tient (5,18) et l'encre sombre le
     * casserait (3,43). 34 endroits en dépendent.
     */
    const clair = jeton('light', '--vc-action-primary-strong')!;
    const sombre = jeton('dark', '--vc-action-primary-strong')!;

    expect(sombre, 'cet aplat ne doit pas basculer').toBe(clair);
    expect(contraste('#ffffff', clair), 'le blanc y tient').toBeGreaterThanOrEqual(AA_BODY_TEXT);
    expect(contraste('#111827', sombre), 'l’encre sombre n’y tiendrait PAS').toBeLessThan(AA_BODY_TEXT);
  });
});
