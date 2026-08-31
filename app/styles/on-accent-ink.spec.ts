import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ON-ACCENT-001 — l'encre posée sur un aplat d'accent doit BASCULER avec le thème.
 *
 * Mesuré en production le 2026-08-31, session authentifiée, pixels rendus, les
 * deux thèmes : « Economy », « Next », « Go to Manage » à **2,80:1** et « Stop »
 * à **3,35:1** en thème sombre.
 *
 * La cause est structurelle, pas ponctuelle. Les aplats s'inversent avec le
 * thème — en CLAIR ils sont foncés (`#c2410c`, `#dc2626`), en SOMBRE ils sont
 * vifs (`#f97316`, `#f85149`) — donc l'encre correcte s'inverse aussi :
 *
 *   | aplat   | clair            | sombre           |
 *   |---------|------------------|------------------|
 *   | action  | blanc **5,18**   | encre **6,33**   |
 *   | erreur  | blanc **4,83**   | encre **5,29**   |
 *
 * Un `text-white` en dur est donc juste dans un thème et faux dans l'autre. Ce
 * test interdit la combinaison « aplat d'accent + blanc en dur », dans le CSS
 * comme dans les composants.
 *
 * Hors périmètre, à traiter séparément : les aplats de la palette Tailwind
 * (`bg-red-500`, `bg-orange-500`) sont INVARIANTS au thème — même défaut de
 * contraste, mais une autre correction. Ils sont consignés en BUG-THEME-014.
 */

const RACINE = join(__dirname, '..');

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);

    if (entree === 'node_modules' || entree.startsWith('.')) {
      continue;
    }

    if (statSync(chemin).isDirectory()) {
      fichiers(chemin, acc);
    } else if (/\.(tsx?|scss)$/.test(entree) && !chemin.includes('.spec.')) {
      acc.push(chemin);
    }
  }

  return acc;
}

/*
 * ATTENTION — seuls les aplats qui BASCULENT sont concernés. `--vc-action-primary-strong`
 * vaut `#c2410c` dans TOUS les blocs de thème : il ne bascule pas, donc le blanc y est
 * correct des deux côtés (5,18:1) et lui appliquer le jeton le casserait en sombre
 * (3,43:1). C'est l'erreur que trois tests existants ont attrapée pendant ce correctif ;
 * la règle est donc écrite ici pour qu'elle ne se reperde pas.
 */
const APLAT = /bg-\[var\(--vc-(?:ide-accent-action|ide-accent-error|action-primary)\b(?!-)[^\]]*\]/;

/*
 * `--vc-cta-accent` est HORS PÉRIMÈTRE, volontairement. Il vaut
 * `--vc-ide-accent-action` par défaut — qui bascule — mais le ton renforcé FIGÉ
 * dans la coque user area. Le même littéral de classe sert donc deux contextes
 * dont les bonnes réponses s'opposent : l'encre doit suivre l'APLAT, pas le
 * thème. Le corriger demande un jeton d'encre défini à côté de chaque
 * définition de `--vc-cta-accent`, ce qui est un chantier à part. Consigné en
 * BUG-THEME-015 plutôt que traité à moitié ici.
 */

describe('ON-ACCENT-001 — pas de blanc en dur sur un aplat d’accent', () => {
  it('aucun littéral de classe ne combine un aplat d’accent et `text-white`', () => {
    const fautifs: string[] = [];

    for (const chemin of fichiers(RACINE)) {
      const source = readFileSync(chemin, 'utf8');

      for (const litteral of source.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? []) {
        if (APLAT.test(litteral) && /\btext-white\b/.test(litteral)) {
          fautifs.push(`${chemin.replace(RACINE, 'app')} → ${litteral.slice(0, 90)}`);
        }
      }
    }

    expect(fautifs, fautifs.join('\n')).toEqual([]);
  });

  it('aucun aplat Tailwind trop clair ne porte du texte blanc', () => {
    /*
     * BUG-THEME-014 — famille voisine mais DISTINCTE : ces aplats viennent de la
     * palette Tailwind et sont INVARIANTS au thème, donc le jeton qui bascule ne
     * les corrige pas. Le blanc y donnait 3,76:1 sur `red-500` (#ef4444) et
     * 2,80:1 sur `orange-500` (#f97316). Les nuances retenues sont les premières
     * qui passent : `red-600` (4,83) et `orange-700` (5,18).
     */
    const fautifs: string[] = [];

    for (const chemin of fichiers(RACINE)) {
      for (const [index, ligne] of readFileSync(chemin, 'utf8').split('\n').entries()) {
        if (!/\btext-white\b/.test(ligne)) {
          continue;
        }

        if (/\bbg-(?:red|orange)-500\b/.test(ligne) || /\bbg-orange-600\b/.test(ligne)) {
          fautifs.push(`${chemin.replace(RACINE, 'app')}:${index + 1}`);
        }
      }
    }

    expect(fautifs, fautifs.join('\n')).toEqual([]);
  });

  it('les jetons d’encre existent et s’inversent entre les deux thèmes', () => {
    const scss = readFileSync(join(__dirname, 'index.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocs = [...scss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

    const valeur = (theme: 'light' | 'dark', jeton: string) =>
      blocs
        .find(
          ([, selecteur, corps]) => selecteur.includes(`[data-theme='${theme}']`) && corps.includes(`${jeton}:`),
        )?.[2]
        .match(new RegExp(`${jeton}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];

    for (const jeton of ['--vc-ide-on-accent-action', '--vc-ide-on-accent-error']) {
      const clair = valeur('light', jeton);
      const sombre = valeur('dark', jeton);

      expect(clair, `${jeton} en clair`).toBe('#ffffff');
      expect(sombre, `${jeton} en sombre`).toBe('#111827');
    }

    /* La teinte de mélange s'inverse elle aussi : noir en clair, blanc en sombre. */
    expect(valeur('light', '--vc-ide-on-accent-tint')).toBe('#000000');
    expect(valeur('dark', '--vc-ide-on-accent-tint')).toBe('#ffffff');
  });

  it('le dégradé du bouton Run reste sous le plafond de luminosité', () => {
    const scss = readFileSync(join(__dirname, 'index.scss'), 'utf8');

    const regle = scss.slice(
      scss.indexOf('.bolt-project-run-button {'),
      scss.indexOf('.bolt-project-run-button:hover'),
    );

    /*
     * La déclaration `background` SEULEMENT : la même règle porte un
     * `box-shadow` à 50 %, qui est un halo et non un fond de texte. Le mesurer
     * ferait échouer le test sur une valeur qui ne porte aucun libellé.
     */
    const fond = regle.match(/background:\s*linear-gradient\([^;]*\);/)?.[0] ?? '';
    const stops = [...fond.matchAll(/hsl\(142deg 72% (\d+)%\)/g)].map((m) => Number(m[1]));

    expect(stops.length, 'bornes du dégradé').toBeGreaterThanOrEqual(2);

    /*
     * Le blanc tient AA sur `hsl(142deg 72% L%)` tant que L <= 30 (4,77:1). À 34
     * on tombe à 3,87 et à 43 — la valeur d'origine — à 2,48.
     */
    expect(Math.max(...stops), 'borne la plus claire du dégradé').toBeLessThanOrEqual(30);
  });
});
