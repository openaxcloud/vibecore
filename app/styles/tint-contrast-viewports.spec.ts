import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * TINT-SWEEP-002 — le contraste tient aux QUATRE formats, et on le PROUVE.
 *
 * `tint-contrast-sweep.spec.ts` mesure les paires « texte sur une teinte de sa
 * propre couleur » depuis la feuille COMPILÉE, mais il résout les jetons dans
 * `:root` et les blocs de thème UNIQUEMENT : il est aveugle aux `@media`. Rien
 * ne disait donc si les ratios tenaient encore en 390 px.
 *
 * Ce fichier répond en deux temps, et le premier est le plus important :
 *
 *   1. INVARIANCE — aucun bloc `@media` ne redéfinit un jeton de COULEUR.
 *      Mesuré : 112 blocs `@media` dans la feuille, 13 redéfinissent un jeton,
 *      ZÉRO redéfinit une couleur (ce sont des tailles : base rem, largeur de
 *      rail…). Les ratios sont donc invariants par construction, et une mesure
 *      unique vaut pour les quatre formats. C'est plus fort que quatre
 *      échantillons : ça vaut pour TOUS les formats, pas seulement ceux qu'on
 *      a pensé à tester.
 *
 *   2. MESURE PAR FORMAT — on résout quand même les jetons format par format,
 *      en appliquant les `@media` actifs. Tant que (1) tient, les quatre
 *      donnent le même résultat ; si (1) cassait un jour, ce test mesurerait
 *      chaque format séparément au lieu de continuer à n'en mesurer qu'un.
 *
 * Les deux sont nécessaires : (1) seul n'attrape pas un défaut de couleur,
 * (2) seul ne dit pas que les formats non testés sont couverts.
 */

const AA_BODY_TEXT = 4.5;

/** Les formats du produit. 768 se traite comme 390 (décision d'Avi). */
const FORMATS = [390, 768, 1024, 1440] as const;

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

type Declarations = Map<string, string>;

/** Un bloc `@media`, sa condition et son corps. */
function blocsMedia(): Array<{ condition: string; corps: string }> {
  const out: Array<{ condition: string; corps: string }> = [];

  for (const m of CSS.matchAll(/@media([^{]+)\{([\s\S]*?)\n\}/g)) {
    out.push({ condition: m[1].trim(), corps: m[2] });
  }

  return out;
}

/** La condition s'applique-t-elle à cette largeur ? */
function actif(condition: string, largeur: number): boolean {
  for (const m of condition.matchAll(/\(max-width:\s*(\d+)px\)/g)) {
    if (largeur > Number(m[1])) {
      return false;
    }
  }

  for (const m of condition.matchAll(/\(min-width:\s*(\d+)px\)/g)) {
    if (largeur < Number(m[1])) {
      return false;
    }
  }

  return true;
}

/**
 * Déclarations d'un sélecteur pour une largeur donnée : la base, puis les
 * `@media` actifs dans l'ordre de la feuille (le dernier gagne, comme la
 * cascade).
 */
function declarations(prefixe: string, largeur: number): Declarations {
  const decls: Declarations = new Map();

  const absorber = (source: string) => {
    for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (m[1].trim().split('\n').pop()!.trim() !== prefixe) {
        continue;
      }

      for (const d of m[2].split(';')) {
        const i = d.indexOf(':');

        if (i > 0) {
          decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
        }
      }
    }
  };

  /* Hors media d'abord : on retire les blocs @media pour ne garder que la base. */
  absorber(CSS.replace(/@media[^{]+\{[\s\S]*?\n\}/g, ''));

  for (const bloc of blocsMedia()) {
    if (actif(bloc.condition, largeur)) {
      absorber(bloc.corps);
    }
  }

  return decls;
}

const canal = (v: number) => {
  const x = v / 255;

  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const pixels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const enHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const luminance = (c: number[]) => 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);

const contraste = (a: number[], b: number[]) => {
  const [l1, l2] = [luminance(a), luminance(b)];

  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Résout une valeur en `#rrggbb` pour un thème ET une largeur. */
function valeur(theme: string, largeur: number, brut: string, profondeur = 0): string | undefined {
  const v = brut.trim();

  if (profondeur > 8) {
    return undefined;
  }

  if (HEX.test(v)) {
    return v.toLowerCase();
  }

  if (v === 'white' || v === '#fff') {
    return '#ffffff';
  }

  if (v === 'black') {
    return '#000000';
  }

  const alias = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);

  if (alias) {
    const porte = declarations(theme, largeur).get(alias[1]) ?? declarations(':root', largeur).get(alias[1]);

    return porte !== undefined
      ? valeur(theme, largeur, porte, profondeur + 1)
      : alias[2]
        ? valeur(theme, largeur, alias[2], profondeur + 1)
        : undefined;
  }

  const melange = v.match(/^color-mix\(\s*in srgb\s*,\s*(.+)\)$/);

  if (!melange) {
    return undefined;
  }

  const corps = melange[1];

  let niveau = 0;
  let coupe = -1;

  for (let i = 0; i < corps.length; i += 1) {
    if (corps[i] === '(') {
      niveau += 1;
    } else if (corps[i] === ')') {
      niveau -= 1;
    } else if (corps[i] === ',' && niveau === 0) {
      coupe = i;
      break;
    }
  }

  if (coupe === -1) {
    return undefined;
  }

  const droite = corps.slice(coupe + 1).trim();
  const pct = droite.match(/(\d+(?:\.\d+)?)%\s*$/);
  const partB = droite.replace(/(\d+(?:\.\d+)?)%\s*$/, '').trim();
  const proportionB = pct ? Number(pct[1]) / 100 : 0.5;
  const a = valeur(theme, largeur, corps.slice(0, coupe).trim(), profondeur + 1);

  if (!a) {
    return undefined;
  }

  if (partB === 'transparent') {
    const fond =
      declarations(theme, largeur).get('--vc-ide-bg-panel') ?? (theme.includes('light') ? '#ffffff' : '#0e1525');

    const resolu = valeur(theme, largeur, fond, profondeur + 1);

    if (!resolu) {
      return undefined;
    }

    const alpha = 1 - proportionB;

    return enHex(pixels(a).map((v, i) => v * alpha + pixels(resolu)[i] * (1 - alpha)));
  }

  const b = valeur(theme, largeur, partB, profondeur + 1);

  return b ? enHex(pixels(a).map((v, i) => v * (1 - proportionB) + pixels(b)[i] * proportionB)) : undefined;
}

/** Paires « texte sur une teinte de sa propre couleur », pour un thème et une largeur. */
function paires(theme: string, largeur: number) {
  const out: Array<{ selecteur: string; ratio: number; texte: string; fond: string }> = [];

  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const corps = m[2];
    const brutTexte = corps.match(/(?<![-\w])color\s*:\s*([^;]+)/)?.[1];
    const brutFond = corps.match(/(?<![-\w])background(?:-color)?\s*:\s*([^;]+)/)?.[1];

    if (!brutTexte || !brutFond || !brutFond.includes('color-mix')) {
      continue;
    }

    const texte = valeur(theme, largeur, brutTexte.replace(/\s*!important$/, ''));
    const fond = valeur(theme, largeur, brutFond.replace(/\s*!important$/, ''));

    if (!texte || !fond) {
      continue;
    }

    out.push({
      selecteur: m[1].trim().split('\n').pop()!.trim(),
      texte,
      fond,
      ratio: contraste(pixels(texte), pixels(fond)),
    });
  }

  return out;
}

const THEMES = [
  { nom: 'clair', prefixe: ':root[data-theme=light]' },
  { nom: 'sombre', prefixe: ':root[data-theme=dark]' },
] as const;

describe('TINT-SWEEP-002 — le contraste tient aux quatre formats', () => {
  it('la sonde distingue bien les formats et les thèmes', () => {
    /*
     * Témoin : sans lui, une résolution cassée rendrait « 0 défaut » partout.
     * La base rem CHANGE à 1024px — c'est la preuve que les `@media` sont bien
     * appliqués format par format.
     */
    expect(declarations(':root', 390).get('--vc-type-interface-size'), 'base rem en 390').toBe('14px');
    expect(declarations(':root', 1440).get('--vc-type-interface-size'), 'base rem en 1440').toBe('12px');
    expect(declarations(':root[data-theme=light]', 390).get('--vc-ide-bg-panel'), 'fond clair').toBe('#ffffff');
  });

  it('MÉCANISME 1 — aucun `@media` ne redéfinit un jeton de COULEUR', () => {
    /*
     * C'est ce qui rend une mesure unique valable pour TOUS les formats. Si un
     * jour un `@media` portait une couleur, ce test tomberait et il faudrait
     * mesurer chaque format pour de bon.
     */
    const blocs = blocsMedia();

    expect(blocs.length, 'blocs @media lus').toBeGreaterThan(50);

    const fautifs: string[] = [];

    for (const bloc of blocs) {
      for (const m of bloc.corps.matchAll(/(--[\w-]+):\s*([^;]+)/g)) {
        if (/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|color-mix\(/i.test(m[2])) {
          fautifs.push(`@media ${bloc.condition} → ${m[1]}: ${m[2].trim().slice(0, 40)}`);
        }
      }
    }

    expect(fautifs, `un jeton de couleur dépend du format :\n${fautifs.join('\n')}`).toEqual([]);
  });

  it('la sonde mesure réellement quelque chose à chaque format', () => {
    for (const format of FORMATS) {
      for (const theme of THEMES) {
        expect(paires(theme.prefixe, format).length, `paires en ${format}px / ${theme.nom}`).toBeGreaterThan(20);
      }
    }
  });

  it.each(FORMATS.flatMap((f) => THEMES.map((t) => [f, t.nom, t.prefixe] as const)))(
    'MÉCANISME 2 — tient AA en %ipx, thème %s',
    (format, nom, prefixe) => {
      const fautifs = paires(prefixe, format)
        .filter((p) => p.ratio < AA_BODY_TEXT)
        .map((p) => `${p.selecteur} → ${p.ratio.toFixed(2)} (${p.texte} sur ${p.fond})`);

      expect(fautifs, `${format}px / ${nom} :\n${fautifs.join('\n')}`).toEqual([]);
    },
  );
});
