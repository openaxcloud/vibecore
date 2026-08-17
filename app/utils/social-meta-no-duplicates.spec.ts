import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { socialMetaTags } from './social-meta';

/*
 * BUG-CI-010 — `socialMetaTags()` émet déjà `og:type`, `twitter:title` et
 * `twitter:description`, mais 38 routes les REDÉCLARAIENT juste après avoir
 * étalé le helper. Résultat : deux balises identiques dans le `<head>`.
 *
 * Mesuré sur le site rendu : `twitter:title` et `twitter:description` en double
 * sur toutes les pages marketing, `og:type` en double sur celles qui le
 * redéclaraient. Côté CI, la porte « French i18n live audit » comptait
 * 228 `one Twitter title`, 228 `one Twitter description` et 72 `one Open Graph
 * type` en échec, sur 61 pages — ses assertions exigent `toHaveLength(1)`.
 *
 * Ces lignes étaient un résidu : le helper ne portait pas ces balises à
 * l'origine (cf. BUG-MKT-007 / BUG-MKT-008 dans son en-tête), elles ont été
 * ajoutées dedans plus tard, et les redéclarations par route n'ont jamais été
 * retirées.
 *
 * Ce test est le garde qui manquait : il relit les sources et refuse qu'une
 * route redéclare une balise que le helper produit déjà. Un test qui rendrait
 * les pages coûterait une pile complète ; ici l'invariant est statique, donc
 * vérifiable sans navigateur et sans réseau.
 */

const APP_DIR = join(process.cwd(), 'app');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }

    if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }

  return found;
}

/** Clés (`name:` / `property:`) que le helper émet systématiquement. */
function keysOwnedByHelper(): string[] {
  return socialMetaTags({ title: 't', description: 'd' })
    .map((tag) => {
      if (typeof tag !== 'object' || tag === null) {
        return undefined;
      }

      if ('property' in tag && typeof tag.property === 'string') {
        return `property:${tag.property}`;
      }

      if ('name' in tag && typeof tag.name === 'string') {
        return `name:${tag.name}`;
      }

      return undefined;
    })
    .filter((key): key is string => key !== undefined);
}

describe('aucune route ne redéclare une balise déjà émise par socialMetaTags', () => {
  it('le helper porte bien les balises en cause (sinon ce test ne garde rien)', () => {
    const owned = keysOwnedByHelper();

    expect(owned).toContain('name:twitter:title');
    expect(owned).toContain('name:twitter:description');
    expect(owned).toContain('property:og:type');
  });

  it('aucun fichier étalant le helper ne redéclare une de ses balises', () => {
    const owned = new Set(keysOwnedByHelper());
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_DIR)) {
      if (file.endsWith('social-meta.ts')) {
        continue;
      }

      const source = readFileSync(file, 'utf8');

      if (!source.includes('socialMetaTags')) {
        continue;
      }

      source.split('\n').forEach((line, index) => {
        const match = /\{\s*(name|property):\s*'([^']+)'\s*,\s*content:/.exec(line);

        if (!match) {
          return;
        }

        const key = `${match[1]}:${match[2]}`;

        if (owned.has(key)) {
          offenders.push(`${file.replace(process.cwd(), '.')}:${index + 1} redéclare ${key}`);
        }
      });
    }

    expect(offenders, `Balises déjà émises par socialMetaTags() :\n${offenders.join('\n')}`).toEqual([]);
  });
});
