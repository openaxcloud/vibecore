import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * COULEUR-002 — plus un seul bleu dans la famille d'accent d'ELEMENT.
 *
 * #254 a fixé une source unique pour l'action primaire, mais ne couvre que la
 * famille `--vc-*`. Deux jetons `--bolt-elements-item-*Accent` pointaient encore
 * sur l'échelle `accent`, qui vaut #0099FF : c'est le bleu résiduel visible sur
 * l'anneau de focus, les indicateurs de chargement, les barres de progression et
 * l'icône de l'élément sélectionné — 355 usages mesurés dans `app/`.
 *
 * Le test lit les VALEURS finales et refuse toute couleur dont le bleu domine le
 * rouge. Il ne fige aucun ton précis : la charte peut évoluer, elle ne peut plus
 * repartir vers le bleu en silence.
 *
 * Il lit `variables.scss` COMMENTAIRES RETIRÉS. Sans cela, la prose qui explique
 * le défaut — et qui cite `#0099FF` — le ferait passer pour une déclaration : le
 * test réussirait même après avoir remis le bleu.
 */

const VARIABLES = readFileSync(join(__dirname, 'variables.scss'), 'utf8');

/** Le fichier sans ses commentaires : seules les déclarations comptent. */
const CODE = VARIABLES.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ITEM_ACCENT_TOKENS = ['--bolt-elements-item-contentAccent', '--bolt-elements-item-backgroundAccent'];

/** Valeurs déclarées pour un jeton, hors renvois `var(...)`. */
function declaredValues(token: string): string[] {
  const re = new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g');
  const values: string[] = [];

  let match: RegExpExecArray | null;

  while ((match = re.exec(CODE)) !== null) {
    values.push(match[1].trim());
  }

  return values;
}

function isBlueDominant(hex: string): boolean {
  const h = hex.replace('#', '');

  return parseInt(h.slice(4, 6), 16) > parseInt(h.slice(0, 2), 16);
}

describe('COULEUR-002 — l’accent d’élément ne peint plus en bleu', () => {
  it('déclare les deux jetons dans les deux thèmes', () => {
    for (const token of ITEM_ACCENT_TOKENS) {
      // Un par thème : clair et sombre.
      expect(declaredValues(token)).toHaveLength(2);
    }
  });

  it('ne les fait plus dériver de l’échelle `accent`, qui est bleue', () => {
    for (const token of ITEM_ACCENT_TOKENS) {
      for (const value of declaredValues(token)) {
        expect(value).not.toMatch(/theme\('colors\.(alpha\.)?accent/);
      }
    }
  });

  it('n’emploie plus aucune couleur à dominante bleue', () => {
    const offenders: string[] = [];

    for (const token of ITEM_ACCENT_TOKENS) {
      for (const value of declaredValues(token)) {
        for (const hex of value.match(/#[0-9a-fA-F]{6}/g) ?? []) {
          if (isBlueDominant(hex)) {
            offenders.push(`${token}: ${hex}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('garde un contenu lisible sur la surface claire la plus défavorable', () => {
    /*
     * `--bolt-elements-item-contentAccent` sert de couleur de TEXTE et d'icône.
     * En clair, la surface la plus défavorable est `bg-depth-3` = #E5E5E5, où
     * l'orange d'aplat #c2410c tombe à 4,11:1 — sous AA. Le ton doit donc être
     * plus sombre que lui.
     */
    const relativeLuminance = (hex: string) => {
      const channels = [0, 2, 4].map((offset) => {
        const value = parseInt(hex.replace('#', '').slice(offset, offset + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (a: string, b: string) => {
      const [x, y] = [relativeLuminance(a), relativeLuminance(b)];

      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    const [light] = declaredValues('--bolt-elements-item-contentAccent');

    expect(light).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(contrast(light, '#E5E5E5')).toBeGreaterThanOrEqual(4.5);
  });

  it('garde un contenu lisible sur les trois profondeurs du thème sombre', () => {
    const relativeLuminance = (hex: string) => {
      const channels = [0, 2, 4].map((offset) => {
        const value = parseInt(hex.replace('#', '').slice(offset, offset + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (a: string, b: string) => {
      const [x, y] = [relativeLuminance(a), relativeLuminance(b)];

      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };

    const dark = declaredValues('--bolt-elements-item-contentAccent')[1];

    expect(dark).toMatch(/^#[0-9a-fA-F]{6}$/);

    for (const depth of ['#0A0A0A', '#171717', '#262626']) {
      expect(contrast(dark, depth)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
