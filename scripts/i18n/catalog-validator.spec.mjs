import { describe, expect, it } from 'vitest';

import {
  exportedBilingualCatalogNames,
  exportedCatalogNames,
  interpolationTokens,
  parseCatalog,
  validateCatalogRegistration,
  validateCatalogs,
  validateRuntimeMissingKeyFallback,
} from './catalog-validator.mjs';

function catalog(name, entries) {
  const properties = Object.entries(entries)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');

  return parseCatalog(`export const ${name} = {${properties}} as const;`, name, `${name}.ts`);
}

describe('i18n catalog validator', () => {
  it('accepts strict key parity and matching interpolation tokens', () => {
    const result = validateCatalogs({
      en: catalog('en', { 'welcome.title': 'Welcome {name}', items_one: '{count} item', items_other: '{count} items' }),
      fr: catalog('fr', {
        'welcome.title': 'Bienvenue {name}',
        items_one: '{count} élément',
        items_other: '{count} éléments',
      }),
    });

    expect(result.issues).toEqual([]);
    expect(result.metrics).toMatchObject({ enEntries: 3, frEntries: 3, matchingKeys: 3, pluralFamilies: 1 });
  });

  it('reports missing keys, interpolation drift and raw implementation keys', () => {
    const result = validateCatalogs({
      en: catalog('en', { 'welcome.title': 'Welcome {name}', 'settings.label': 'Settings' }),
      fr: catalog('fr', { 'welcome.title': 'Bienvenue {user}', 'orphan.label': 'orphan.label' }),
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'catalog-interpolation-mismatch',
        'catalog-key-missing-fr',
        'catalog-key-missing-en',
        'catalog-value-raw-key',
      ]),
    );
  });

  it('flattens structured catalog objects and arrays for exact locale parity', () => {
    const en = parseCatalog(
      `export const pagesEn = { home: { title: 'Home', highlights: ['Fast', 'Typed'] } } as const;`,
      'pagesEn',
    );
    const fr = parseCatalog(
      `export const pagesFr = { home: { title: 'Accueil', highlights: ['Rapide', 'Typé'] } } as const;`,
      'pagesFr',
    );
    const result = validateCatalogs({ en, fr });

    expect(en.flat).toBe(false);
    expect([...en.entries.keys()]).toEqual(['home.title', 'home.highlights.0', 'home.highlights.1']);
    expect(result.issues).toEqual([]);
  });

  it('requires _one and _other for every explicit plural family', () => {
    const result = validateCatalogs({
      en: catalog('en', { items_one: '{count} item' }),
      fr: catalog('fr', { items_one: '{count} élément' }),
    });

    expect(result.issues.filter((issue) => issue.code === 'catalog-plural-incomplete')).toHaveLength(2);
  });

  it('extracts repeated interpolation parameters as a multiset', () => {
    expect(interpolationTokens('{count} of {total}; {count} selected')).toEqual(['count', 'count', 'total']);
  });

  it('discovers paired catalog exports and requires runtime registration', () => {
    const discovered = exportedCatalogNames(
      'export const billingEn = {} as const; export const billingFr = {} as const;',
    );

    expect(discovered).toEqual({ names: ['billingEn', 'billingFr'], issues: [] });
    expect(
      validateCatalogRegistration('const resources = { en: { ...billingEn }, fr: {} };', [
        { enName: 'billingEn', frName: 'billingFr' },
      ]).map((issue) => issue.key),
    ).toEqual(['billingFr']);
  });

  it('discovers and validates component-local { en, fr } catalogues', () => {
    const source = `
      export const routeCopy = {
        en: { home: { title: 'Welcome {name}', points: ['Fast'] } },
        fr: { home: { title: 'Bienvenue {name}', points: ['Rapide'] } },
      } as const;
    `;

    expect(exportedBilingualCatalogNames(source)).toEqual({ names: ['routeCopy'], issues: [] });

    const result = validateCatalogs({
      en: parseCatalog(source, 'routeCopy.en'),
      fr: parseCatalog(source, 'routeCopy.fr'),
    });

    expect(result.issues).toEqual([]);
    expect(result.metrics).toMatchObject({ enEntries: 2, frEntries: 2, matchingKeys: 2 });
  });

  it('normalizes typed catalogue formatter functions into interpolation tokens', () => {
    const source = `
      export const formatterCopy = {
        en: { segment: (timestamp: string) => \`Segment \${timestamp}\` },
        fr: { segment: (timestamp: string) => \`Séquence \${timestamp}\` },
      } as const;
    `;
    const en = parseCatalog(source, 'formatterCopy.en');
    const fr = parseCatalog(source, 'formatterCopy.fr');

    expect(en.entries.get('segment')).toBe('Segment {timestamp}');
    expect(validateCatalogs({ en, fr }).issues).toEqual([]);
  });

  it('requires a missing-key handler and rejects echoing its key argument', () => {
    expect(validateRuntimeMissingKeyFallback('const options = {};').map((issue) => issue.code)).toContain(
      'runtime-missing-key-handler-absent',
    );
    expect(
      validateRuntimeMissingKeyFallback('const options = { parseMissingKeyHandler: (key) => key };').map(
        (issue) => issue.code,
      ),
    ).toContain('runtime-missing-key-handler-echoes-key');
    expect(
      validateRuntimeMissingKeyFallback("const options = { parseMissingKeyHandler: () => en['common.unavailable'] };"),
    ).toEqual([]);
  });
});
