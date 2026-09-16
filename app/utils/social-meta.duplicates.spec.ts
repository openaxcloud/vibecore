import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every public page shipped `twitter:title` and `twitter:description` TWICE —
 * byte-identical copies — and several also shipped `og:type` twice, so social
 * crawlers received an ambiguous tag across the whole public domain.
 *
 * The cause was not the root document's fallback (that guard is correct): routes
 * spread `socialMetaTags()`, which already provides those descriptors, and then
 * re-declared the very same ones right after the spread.
 *
 * This also kept the "French i18n live audit" workflow RED on every pull
 * request (`expected length 1, received 2`), for everyone.
 *
 * This guard is source-level on purpose: it is deterministic, needs no loader
 * data, and names the exact file and descriptor to delete.
 */
const APP_ROOT = join(__dirname, '..');

/** Descriptors `socialMetaTags()` already returns — see `social-meta.ts`. */
const PROVIDED_BY_SOCIAL_META = [
  "name: 'twitter:card'",
  "name: 'twitter:title'",
  "name: 'twitter:description'",
  "name: 'twitter:image'",
  "name: 'twitter:image:alt'",
  "property: 'og:title'",
  "property: 'og:description'",
  "property: 'og:type'",
  "property: 'og:site_name'",
  "property: 'og:image'",
  "property: 'og:image:alt'",
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        yield* sourceFiles(full);
      }

      continue;
    }

    if (/\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

describe('public pages never emit a social meta tag twice', () => {
  it('no route re-declares a descriptor it already spreads from socialMetaTags()', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      if (file.endsWith(join('utils', 'social-meta.ts'))) {
        continue;
      }

      const source = readFileSync(file, 'utf8');

      if (!/\.\.\.(social\b|socialMetaTags\()/.test(source)) {
        continue;
      }

      for (const descriptor of PROVIDED_BY_SOCIAL_META) {
        if (source.includes(descriptor)) {
          offenders.push(`${file.replace(APP_ROOT, 'app')}: ${descriptor}`);
        }
      }
    }

    expect(offenders, `duplicate social meta descriptors:\n${offenders.join('\n')}`).toEqual([]);
  });
});
