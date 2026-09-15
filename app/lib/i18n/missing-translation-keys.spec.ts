import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * I18N-HALF-MIGRATION-001 — aucune clé passée à `t()` ne doit être absente des
 * catalogues.
 *
 * i18next rend la CLÉ quand elle est introuvable. Une migration arrêtée à
 * mi-chemin ne plante donc pas : elle affiche « sidebarMenu.header.settings » à
 * l'utilisateur, ce qui est précisément ce que la barre de qualité interdit —
 * aucun libellé technique visible.
 *
 * Trouvé ainsi : les infobulles des boutons Réglages et Aide. Leurs libellés
 * vivent dans un catalogue OBJET lu par `getSidebarMenuCopy()`, pas dans le
 * registre plat que `t()` interroge.
 *
 * MÉTHODE — trois faux positifs écartés avant de conclure, et le test les évite
 * tous les trois :
 *   * les catalogues vivent dans DEUX répertoires (`catalogs/` et `messages/`) —
 *     n'en lire qu'un donnait 232 fausses alertes ;
 *   * i18next pluralise en `_one` / `_other` : la clé nue n'existe pas, ses
 *     variantes si — 150 fausses alertes de plus ;
 *   * les catalogues objet ne sont pas des clés `t()` et ne doivent pas être
 *     comptés comme définitions.
 */

const ROOT = join(__dirname, '..', '..', '..');
const PLURAL_SUFFIXES = ['_one', '_other', '_zero', '_two', '_few', '_many'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        walk(full, out);
      }
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.spec.')) {
      out.push(full);
    }
  }

  return out;
}

function referencedKeys(): Set<string> {
  const keys = new Set<string>();

  for (const file of walk(join(ROOT, 'app'))) {
    if (file.includes(`${join('lib', 'i18n')}`)) {
      continue;
    }

    /*
     * COMMENTAIRES RETIRÉS avant de scanner.
     *
     * Sans cela, la prose qui EXPLIQUE le défaut — et qui cite forcément la clé
     * fautive — est comptée comme une référence. Le test tombait alors sur son
     * propre commentaire, une fois le vrai défaut corrigé.
     */
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const match of code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*\.[\w.]+)'/g)) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function definedKeys(): Set<string> {
  const keys = new Set<string>();

  for (const dir of ['catalogs', 'messages']) {
    let entries: string[] = [];

    try {
      entries = readdirSync(join(ROOT, 'app/lib/i18n', dir)).filter((f) => f.endsWith('.ts'));
    } catch {
      continue;
    }

    for (const file of entries) {
      for (const match of readFileSync(join(ROOT, 'app/lib/i18n', dir, file), 'utf8').matchAll(
        /^\s*'([\w.]+)'\s*:/gm,
      )) {
        keys.add(match[1]);
      }
    }
  }

  return keys;
}

describe('I18N-HALF-MIGRATION-001 — pas de clé brute affichée à l’utilisateur', () => {
  const defined = definedKeys();
  const referenced = referencedKeys();

  it('lit réellement les deux répertoires de catalogues', () => {
    /*
     * Sans ce garde-fou, une erreur de chemin rendrait « aucune clé manquante »
     * sur un ensemble vide — un vert qui ne prouve rien.
     */
    expect(defined.size).toBeGreaterThan(5000);
    expect(referenced.size).toBeGreaterThan(1000);
  });

  it('définit chaque clé passée à `t()`, pluriels compris', () => {
    const missing = [...referenced].filter(
      (key) => !defined.has(key) && !PLURAL_SUFFIXES.some((suffix) => defined.has(key + suffix)),
    );

    expect(missing.sort()).toEqual([]);
  });
});
