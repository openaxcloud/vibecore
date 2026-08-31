import { join } from 'node:path';
import { compile } from 'sass-embedded';
import { describe, expect, it } from 'vitest';

/**
 * TINT-SWEEP-001 — le contraste « texte sur teinte de sa propre couleur » est
 * vérifié PAR DÉRIVATION, pas par une liste tenue à la main.
 *
 * Pourquoi ce test existe. `BUG-THEME-008` avait un garde-fou : un test de
 * parité vérifiait que les jetons `--status-*` tenaient AA sur leur fond teinté.
 * Il passait. Mais les pastilles réellement affichées dans la barre d'état
 * utilisent une AUTRE famille (`--vc-ide-accent-error` / `-warning` / `-action`),
 * que rien ne gardait — 3,76:1, 3,88:1 et 4,21:1 en thème clair, mesurés en
 * production le 2026-08-31. **Le garde-fou existait et protégeait la mauvaise
 * famille, ce qui est pire que pas de garde-fou : il rassurait.**
 *
 * La parade n'est pas d'ajouter la famille manquante à une liste — la prochaine
 * y échapperait pareil. C'est d'ÉNUMÉRER depuis la feuille compilée : toute
 * règle qui pose une couleur de texte sur un fond dérivé de la même couleur est
 * mesurée, quelle que soit la famille, y compris celles qui n'existent pas
 * encore.
 *
 * MÉTHODE — la sonde échoue bruyamment si elle n'a rien mesuré (voir le test de
 * couverture) : une sonde qui rend « 0 défaut » parce qu'elle n'a pas su lire
 * est le faux négatif le plus coûteux, et il faut qu'il soit impossible plutôt
 * que signalé dans un champ qu'il faut penser à consulter.
 */

const AA_BODY_TEXT = 4.5;

const CSS = compile(join(__dirname, 'index.scss'), { style: 'expanded' }).css.replace(/\/\*[\s\S]*?\*\//g, '');

type Declarations = Map<string, string>;

const BLOCKS = new Map<string, Declarations>();

for (const [, selecteur, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const cle = selecteur.trim().split('\n').pop()!.trim();
  const decls = BLOCKS.get(cle) ?? new Map<string, string>();

  for (const declaration of corps.split(';')) {
    const i = declaration.indexOf(':');

    if (i > 0) {
      decls.set(declaration.slice(0, i).trim(), declaration.slice(i + 1).trim());
    }
  }

  BLOCKS.set(cle, decls);
}

/*
 * ATTENTION — la feuille COMPILÉE écrit `:root[data-theme=light]`, SANS
 * guillemets, là où la source SCSS en met. Un préfixe cité ne matche donc
 * aucun bloc, tout retombe sur `:root`, et la sonde mesure le thème SOMBRE en
 * croyant mesurer le clair : elle rend un résultat, plausible et faux.
 *
 * C'est exactement le mode de panne que ce fichier existe pour empêcher, alors
 * il est vérifié explicitement par « la résolution distingue bien les deux
 * thèmes » ci-dessous.
 */
const THEMES = [
  { nom: 'clair', prefixe: ':root[data-theme=light]' },
  { nom: 'sombre', prefixe: ':root[data-theme=dark]' },
] as const;

/** Résout un jeton dans un thème, en retombant sur `:root` comme la cascade. */
function jeton(prefixe: string, nom: string, profondeur = 0): string | undefined {
  const brut = BLOCKS.get(prefixe)?.get(nom) ?? BLOCKS.get(':root')?.get(nom);

  if (brut === undefined || profondeur > 8) {
    return brut;
  }

  return valeur(prefixe, brut, profondeur + 1);
}

const HEX = /^#[0-9a-f]{6}$/i;

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

/**
 * Réduit une valeur CSS à un `#rrggbb`, ou rend `undefined` si elle sort du
 * périmètre (dégradé, `currentColor`, mot-clé). On ne devine JAMAIS : mieux vaut
 * ignorer une règle que la mesurer sur une valeur inventée.
 */
function valeur(prefixe: string, brut: string, profondeur = 0): string | undefined {
  const v = brut.trim();

  if (profondeur > 8) {
    return undefined;
  }

  if (HEX.test(v)) {
    return v.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toLowerCase();
  }

  if (v === 'white' || v === '#fff') {
    return '#ffffff';
  }

  if (v === 'black') {
    return '#000000';
  }

  const alias = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/);

  if (alias) {
    return (
      jeton(prefixe, alias[1], profondeur + 1) ?? (alias[2] ? valeur(prefixe, alias[2], profondeur + 1) : undefined)
    );
  }

  const melange = v.match(/^color-mix\(\s*in srgb\s*,\s*(.+)\)$/);

  if (melange) {
    return composer(prefixe, melange[1], profondeur + 1);
  }

  return undefined;
}

/** `color-mix(in srgb, A, B P%)` — sépare au premier virgule de premier niveau. */
function composer(prefixe: string, corps: string, profondeur: number): string | undefined {
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

  const gauche = corps.slice(0, coupe).trim();
  const droite = corps.slice(coupe + 1).trim();
  const pct = droite.match(/(\d+(?:\.\d+)?)%\s*$/);
  const partB = droite.replace(/(\d+(?:\.\d+)?)%\s*$/, '').trim();
  const proportionB = pct ? Number(pct[1]) / 100 : 0.5;

  const a = valeur(prefixe, gauche, profondeur);

  if (!a) {
    return undefined;
  }

  /* `transparent` : la teinte se compose sur le fond de page du thème. */
  if (partB === 'transparent') {
    const fond = jeton(prefixe, '--vc-ide-bg-panel') ?? (prefixe.includes('light') ? '#ffffff' : '#0e1525');

    if (!HEX.test(fond)) {
      return undefined;
    }

    const alpha = 1 - proportionB;

    return enHex(pixels(a).map((v, i) => v * alpha + pixels(fond)[i] * (1 - alpha)));
  }

  const b = valeur(prefixe, partB, profondeur);

  if (!b) {
    return undefined;
  }

  return enHex(pixels(a).map((v, i) => v * (1 - proportionB) + pixels(b)[i] * proportionB));
}

/** Règles qui posent une couleur de texte ET un fond, toutes deux résolubles. */
function paires(prefixe: string) {
  const out: { selecteur: string; texte: string; fond: string; ratio: number }[] = [];

  for (const [, selecteur, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map<string, string>();

    for (const d of corps.split(';')) {
      const i = d.indexOf(':');

      if (i > 0) {
        decls.set(
          d.slice(0, i).trim(),
          d
            .slice(i + 1)
            .trim()
            .replace(/\s*!important$/, ''),
        );
      }
    }

    const brutTexte = decls.get('color');
    const brutFond = decls.get('background') ?? decls.get('background-color');

    if (!brutTexte || !brutFond) {
      continue;
    }

    /*
     * Le motif visé : le fond est DÉRIVÉ d'une couleur (un `color-mix`), donc la
     * vérification jeton-contre-jeton ne le voit pas. Les fonds opaques posés en
     * dur sont couverts ailleurs.
     */
    if (!brutFond.includes('color-mix')) {
      continue;
    }

    const texte = valeur(prefixe, brutTexte);
    const fond = valeur(prefixe, brutFond);

    if (!texte || !fond) {
      continue;
    }

    out.push({
      selecteur: selecteur.trim().split('\n').pop()!.trim(),
      texte,
      fond,
      ratio: contraste(pixels(texte), pixels(fond)),
    });
  }

  return out;
}

describe('TINT-SWEEP-001 — texte sur une teinte de sa propre couleur', () => {
  it('la résolution distingue bien les deux thèmes', () => {
    /*
     * Sans cette vérification, un préfixe qui ne matche aucun bloc ferait
     * silencieusement mesurer `:root` pour les deux thèmes. La sonde rendrait
     * alors deux fois le même résultat — vert, et faux.
     */
    const clair = jeton(':root[data-theme=light]', '--vc-ide-bg-panel');
    const sombre = jeton(':root[data-theme=dark]', '--vc-ide-bg-panel');

    expect(clair, 'fond de panneau en clair').toBe('#ffffff');
    expect(sombre, 'fond de panneau en sombre').not.toBe(clair);
  });

  it('la sonde a réellement mesuré quelque chose', () => {
    /*
     * Sans ce test, toute panne de résolution (feuille renommée, `color-mix`
     * écrit autrement, sélecteurs réorganisés) rendrait « 0 défaut » — le faux
     * négatif silencieux. Il doit être impossible, pas signalé.
     */
    for (const theme of THEMES) {
      expect(paires(theme.prefixe).length, `aucune paire résolue en thème ${theme.nom}`).toBeGreaterThan(20);
    }
  });

  it.each(THEMES.map((t) => [t.nom, t.prefixe] as const))('tient AA en thème %s', (nom, prefixe) => {
    const fautifs = paires(prefixe)
      .filter((p) => p.ratio < AA_BODY_TEXT)
      .map((p) => `${p.selecteur} → ${p.ratio.toFixed(2)} (${p.texte} sur ${p.fond})`);

    expect(fautifs, `thème ${nom} :\n${fautifs.join('\n')}`).toEqual([]);
  });
});
