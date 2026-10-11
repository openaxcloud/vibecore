import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * Texte sur les fonds de couleur (orange, rouge) — décision d'Avi du 01/10 :
 * texte FONCÉ sur l'orange vif, l'orange lui-même ne bouge pas.
 *
 * Mesuré avant, à 1440 : boutons marketing blanc sur #f26207 à 3,22:1, boutons
 * d'action de l'IDE en sombre blanc sur #f97316 à 2,80:1, « Arrêter » blanc sur
 * #f85149 à 3,35:1. Et le piège inverse, attrapé à la mesure : du texte foncé
 * sur l'orange PROFOND #c2410c ne tient que 3,43:1 — là, c'est le blanc qui
 * passe (5,18:1). Le texte suit donc le FOND, par jetons jumeaux.
 *
 * Trois gardes :
 *  1. chaque paire fond/encre de jetons tient AA dans les deux thèmes, calculée
 *     depuis les valeurs réelles de la feuille compilée ;
 *  2. aucune règle ne pose un blanc écrit en dur sur un fond d'accent ;
 *  3. aucun composant n'écrit `text-white` sur un fond orange vif.
 */

const AA = 4.5;
const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Déclarations `--x: valeur` du PREMIER niveau d'un bloc dont le sélecteur est exactement `selecteur`. */
function jetons(selecteur: string): Map<string, string> {
  const out = new Map<string, string>();

  for (const m of CSS.matchAll(/(^|\n)([^{}\n][^{}]*?)\{([^{}]*)\}/g)) {
    if (m[2].trim() !== selecteur) {
      continue;
    }

    for (const d of m[3].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(d[1], d[2].trim());
    }
  }

  return out;
}

function resoudre(couches: Array<Map<string, string>>, nom: string, profondeur = 0): string {
  expect(profondeur, `boucle de var() sur ${nom}`).toBeLessThan(12);

  let valeur: string | undefined;

  for (const couche of couches) {
    valeur = couche.get(nom) ?? valeur;
  }

  expect(valeur, `jeton ${nom} introuvable`).toBeTruthy();

  const v = valeur!;
  const ref = v.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);

  return ref ? resoudre(couches, ref[1], profondeur + 1) : v;
}

function rgb(valeur: string): [number, number, number] {
  const hex = valeur.match(/^#([0-9a-f]{6})$/i);

  if (hex) {
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  }

  const hsl = valeur.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);

  if (hsl) {
    const [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const a = s * Math.min(l, 1 - l);

    const f = (n: number) => {
      const k = (n + h / 30) % 12;

      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };

    return [f(0), f(8), f(4)];
  }

  if (/^white$/i.test(valeur)) {
    return [255, 255, 255];
  }

  throw new Error(`couleur non lue : ${valeur}`);
}

function contraste(a: string, b: string): number {
  const lin = (c: number) => {
    const v = c / 255;

    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const L = ([r, g, bl]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  const [x, y] = [L(rgb(a)), L(rgb(b))].sort((p, q) => q - p);

  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

const RACINE = jetons(':root');
const CLAIR = jetons(':root[data-theme=light]');
const SOMBRE = jetons(':root[data-theme=dark]');
const ZONE = jetons('.vc-user-area-shell');
const ZONE_CLAIR = jetons(':root[data-theme=light] .vc-user-area-shell');

const CONTEXTES = {
  'IDE, sombre': [RACINE, SOMBRE],
  'IDE, clair': [RACINE, CLAIR],
  'zone utilisateur, sombre': [RACINE, SOMBRE, ZONE],
  'zone utilisateur, clair': [RACINE, CLAIR, ZONE, ZONE_CLAIR],
} as const;

const PAIRES: Array<[fond: string, encre: string]> = [
  ['--vc-ide-accent-action', '--vc-ide-on-accent-action'],
  ['--vc-ide-accent-error', '--vc-ide-on-accent-error'],
  ['--vc-run-stop-bg', '--vc-run-stop-fg'],
  ['--vc-cta-accent', '--vc-cta-accent-foreground'],
  ['--ecode-accent', '--ecode-accent-contrast'],
  ['--primary', '--primary-foreground'],
];

describe('texte sur fond de couleur — décision du 01/10', () => {
  it('la feuille compilée expose bien les blocs de thème lus par ce test', () => {
    expect(RACINE.size).toBeGreaterThan(50);
    expect(CLAIR.size).toBeGreaterThan(20);
    expect(SOMBRE.size).toBeGreaterThan(10);
    expect(ZONE.size).toBeGreaterThan(5);
  });

  for (const [contexte, couches] of Object.entries(CONTEXTES)) {
    it(`GARDE 1 — chaque paire fond/encre tient AA (${contexte})`, () => {
      const fautifs = PAIRES.map(([fond, encre]) => {
        const f = resoudre([...couches], fond);
        const e = resoudre([...couches], encre);

        return { paire: `${encre} sur ${fond}`, f, e, ratio: contraste(f, e) };
      }).filter((p) => p.ratio < AA);

      expect(fautifs.map((p) => `${p.paire} : ${p.e} sur ${p.f} = ${p.ratio}`)).toEqual([]);
    });
  }

  it('GARDE 2 — aucune règle ne pose un blanc écrit en dur sur un fond d’accent', () => {
    const fautifs: string[] = [];

    for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const corps = m[2];
      const fond = corps.match(/background(?:-color)?\s*:\s*([^;]+);/);

      if (
        !fond ||
        !/var\(--(vc-ide-accent-action|vc-ide-accent-error|vc-run-stop-bg|vc-cta-accent|ecode-accent)\b/.test(fond[1])
      ) {
        continue;
      }

      if (/(^|;|\n)\s*color\s*:\s*(#fff\b|#ffffff\b|white\b)/i.test(corps)) {
        fautifs.push(m[1].trim().split('\n').pop()!.slice(0, 80));
      }
    }

    expect(fautifs).toEqual([]);
  });

  it('GARDE 3 — aucun composant n’écrit `text-white` sur un fond orange vif', () => {
    const racine = join(__dirname, '..');
    const fichiers: string[] = [];

    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);

        if (statSync(chemin).isDirectory()) {
          parcourir(chemin);
        } else if (nom.endsWith('.tsx') && !nom.includes('.spec.')) {
          fichiers.push(chemin);
        }
      }
    };
    parcourir(racine);

    const VIF =
      /backgroundColor:\s*['"](?:var\(--ecode-accent\)|#f26207)['"]|bg-\[var\(--ecode-accent\)\]|bg-\[#f26207\]|\bbg-primary\b|\bfrom-primary\b/i;

    const fautifs: string[] = [];

    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8');

      for (const balise of source.matchAll(/<[A-Za-z][^<>]*?>/gs)) {
        if (/\btext-white\b/.test(balise[0]) && VIF.test(balise[0])) {
          fautifs.push(`${fichier.slice(racine.length + 1)}:${source.slice(0, balise.index).split('\n').length}`);
        }
      }
    }

    expect(fichiers.length, 'composants lus').toBeGreaterThan(200);
    expect(fautifs).toEqual([]);
  });
});
