/*
 * Garde de densite des panneaux IDE (DENSITE-001..004).
 *
 * Le defaut repete : une grille de paires « etiquette + valeur » ecrasee sur UNE
 * colonne alors que la largeur disponible en portait plusieurs. La cause n'est
 * presque jamais l'absence de grille — c'est une `@container (max-width: …)`
 * dont le seuil est trop haut pour le panneau lateral de l'IDE (~735px), qui
 * s'applique donc meme sur un ecran de 1440.
 *
 * Cette garde relit la feuille de style et refuse tout retour a une colonne
 * unique pour ces grilles a des largeurs ou plusieurs colonnes tiennent.
 */

/** Largeur de PANNEAU (`@container`) en dessous de laquelle une colonne unique est legitime. */
export const SINGLE_COLUMN_FLOOR_PX = 600;

/**
 * Largeur de VIEWPORT (`@media`) jusqu'a laquelle l'empilement est voulu.
 * La tablette 768 se traite comme le mobile 390 — decision du proprietaire du
 * produit — et la feuille bascule deja tout le theme a 1024px.
 */
export const MOBILE_TABLET_MAX_PX = 1024;

/**
 * Grilles qui ne portent que des paires « etiquette + valeur » (ou des cartes
 * courtes) et qui doivent donc se reduire progressivement, jamais d'un coup.
 */
export const DENSITY_SENSITIVE_SELECTORS = [
  '.bolt-project-metric-grid',
  '.bolt-project-package-stat-grid',
  '.bolt-project-extension-catalog',
  '.bolt-project-security-scope',
  '.bolt-project-security-comparison-grid',
  '.bolt-project-integrations-grid',
  '.bolt-project-deploy-summary',
  '.bolt-project-env-row',
  '.bolt-project-secret-row',
] as const;

/**
 * Retire les commentaires CSS/SCSS AVANT toute recherche.
 *
 * Sans cela une garde peut passer — ou tomber — a cause de la PROSE d'un
 * commentaire qui cite un selecteur ou une declaration. Le piege s'est produit
 * plusieurs fois : il est traite ici une bonne fois, et teste.
 */
export function stripCssComments(css: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'block' | 'line' | 'sq' | 'dq' = 'code';

  while (i < css.length) {
    const c = css[i];
    const n = css[i + 1];

    if (mode === 'code') {
      if (c === '/' && n === '*') {
        mode = 'block';
        i += 2;
        continue;
      }

      if (c === '/' && n === '/') {
        mode = 'line';
        i += 2;
        continue;
      }

      if (c === "'") {
        mode = 'sq';
      } else if (c === '"') {
        mode = 'dq';
      }

      out += c;
      i += 1;
      continue;
    }

    if (mode === 'block') {
      if (c === '*' && n === '/') {
        mode = 'code';
        i += 2;
      } else {
        // Preserve newlines so reported line numbers stay usable.
        if (c === '\n') {
          out += c;
        }

        i += 1;
      }

      continue;
    }

    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }

      i += 1;
      continue;
    }

    if (c === '\\') {
      out += c + (n ?? '');
      i += 2;
      continue;
    }

    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')) {
      mode = 'code';
    }

    out += c;
    i += 1;
  }

  return out;
}

export interface DensityRule {
  /** Selecteur brut, espaces normalises. */
  selector: string;

  /** Corps de la regle (declarations seules). */
  body: string;

  /** Preludes des at-rules englobantes, du plus externe au plus interne. */
  atRules: string[];
}

/** Decoupe la feuille en regles en suivant la pile d'at-rules englobantes. */
export function parseRules(css: string): DensityRule[] {
  const rules: DensityRule[] = [];
  const stack: string[] = [];

  let buffer = '';
  let i = 0;

  while (i < css.length) {
    const c = css[i];

    if (c === '{') {
      const prelude = buffer.replace(/\s+/g, ' ').trim();
      buffer = '';

      if (prelude.startsWith('@')) {
        stack.push(prelude);
        i += 1;
        continue;
      }

      // A style rule: capture its body up to the matching brace.
      let depth = 1;
      let j = i + 1;
      let body = '';

      while (j < css.length && depth > 0) {
        const d = css[j];

        if (d === '{') {
          depth += 1;
        } else if (d === '}') {
          depth -= 1;

          if (depth === 0) {
            break;
          }
        }

        body += d;
        j += 1;
      }

      rules.push({ selector: prelude, body, atRules: [...stack] });
      i = j + 1;
      continue;
    }

    if (c === '}') {
      stack.pop();
      buffer = '';
      i += 1;
      continue;
    }

    buffer += c;
    i += 1;
  }

  return rules;
}

const SINGLE_COLUMN = /grid-template-columns:\s*(?:minmax\(\s*0\s*,\s*1fr\s*\)|1fr)\s*(?:!important)?\s*(?:;|$)/;

/**
 * Plus petit `max-width` des at-rules englobantes du type demande, ou Infinity
 * s'il n'y en a pas. `@container` mesure le PANNEAU, `@media` le VIEWPORT : les
 * deux n'ont pas le meme seuil de legitimite, les confondre rendait la sonde
 * bruyante sur des empilements mobiles parfaitement voulus.
 */
export function narrowestMaxWidth(atRules: string[], kind: 'container' | 'media'): number {
  let narrowest = Number.POSITIVE_INFINITY;

  for (const rule of atRules) {
    if (!rule.startsWith(`@${kind}`)) {
      continue;
    }

    const match = rule.match(/max-width:\s*(\d+)px/);

    if (match) {
      narrowest = Math.min(narrowest, Number(match[1]));
    }
  }

  return narrowest;
}

/**
 * Le selecteur sensible est-il le SUJET de la regle ?
 *
 * `.bolt-project-integrations-grid article footer` cible le pied d'une carte,
 * pas la grille : l'empiler est correct. Ne comparer que le dernier maillon de
 * chaque branche evite ce faux positif.
 */
export function isRuleSubject(ruleSelector: string, sensitive: string): boolean {
  const escaped = sensitive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const atEnd = new RegExp(`${escaped}(?![\\w-])\\s*$`);

  return ruleSelector
    .split(',')
    .map((branch) => branch.replace(/[)\s]+$/, '').trim())
    .some((branch) => atEnd.test(branch));
}

export interface DensityViolation {
  selector: string;
  atRules: string[];
  matched: string;
}

export interface DensityReport {
  /** Nombre de regles reellement examinees. */
  rulesExamined: number;

  /** La sonde a-t-elle vu assez de matiere pour que son verdict veuille dire quelque chose ? */
  reliable: boolean;
  violations: DensityViolation[];
}

/**
 * Cherche les regles qui rabattent une grille sensible sur une colonne unique
 * a une largeur ou plusieurs colonnes tiennent encore.
 *
 * L'enveloppe mobile/tablette (`.bolt-responsive-ide-mobile`) est exemptee : le
 * proprietaire du produit a tranche que la tablette 768 se traite comme le
 * mobile 390, donc l'empilement y est voulu.
 */
export function findDensityViolations(rawCss: string): DensityReport {
  const css = stripCssComments(rawCss);
  const rules = parseRules(css);
  const violations: DensityViolation[] = [];

  for (const rule of rules) {
    if (!SINGLE_COLUMN.test(rule.body)) {
      continue;
    }

    if (narrowestMaxWidth(rule.atRules, 'container') < SINGLE_COLUMN_FLOOR_PX) {
      continue;
    }

    if (narrowestMaxWidth(rule.atRules, 'media') <= MOBILE_TABLET_MAX_PX) {
      continue;
    }

    const scope = [...rule.atRules, rule.selector].join(' ');

    if (scope.includes('.bolt-responsive-ide-mobile')) {
      continue;
    }

    for (const selector of DENSITY_SENSITIVE_SELECTORS) {
      if (isRuleSubject(rule.selector, selector)) {
        violations.push({ selector, atRules: rule.atRules, matched: rule.selector });
      }
    }
  }

  return {
    rulesExamined: rules.length,
    reliable: rules.length >= 10,
    violations,
  };
}
