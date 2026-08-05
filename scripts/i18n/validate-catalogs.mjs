#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  exportedBilingualCatalogNames,
  exportedCatalogNames,
  parseCatalog,
  validateCatalogRegistration,
  validateCatalogs,
  validateRuntimeMissingKeyFallback,
} from './catalog-validator.mjs';

const EN_FILE = 'app/lib/i18n/messages/en.ts';
const FR_FILE = 'app/lib/i18n/messages/fr.ts';
const RUNTIME_FILE = 'app/lib/i18n/runtime.ts';
const CATALOG_DIRECTORY = 'app/lib/i18n/catalogs';

function formatIssue(issue) {
  const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  return `${location}${issue.key ? ` [${issue.key}]` : ''} ${issue.code}: ${issue.message}`;
}

export async function validateRepositoryCatalogs() {
  const [enSource, frSource, runtimeSource, catalogEntries] = await Promise.all([
    readFile(EN_FILE, 'utf8'),
    readFile(FR_FILE, 'utf8'),
    readFile(RUNTIME_FILE, 'utf8'),
    readdir(CATALOG_DIRECTORY, { withFileTypes: true }),
  ]);
  const pairs = [
    {
      id: 'messages',
      enName: 'en',
      frName: 'fr',
      enFile: EN_FILE,
      frFile: FR_FILE,
      en: parseCatalog(enSource, 'en', EN_FILE),
      fr: parseCatalog(frSource, 'fr', FR_FILE),
      runtimeRegistration: false,
    },
  ];
  const discoveryIssues = [];

  for (const entry of catalogEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) {
      continue;
    }

    const file = `${CATALOG_DIRECTORY}/${entry.name}`;
    const source = await readFile(file, 'utf8');
    const discovered = exportedCatalogNames(source, file);
    const bilingual = exportedBilingualCatalogNames(source, file);
    discoveryIssues.push(...discovered.issues);
    discoveryIssues.push(...bilingual.issues);
    const names = new Set(discovered.names);
    const bases = new Set(discovered.names.map((name) => name.slice(0, -2)));

    for (const base of bases) {
      const enName = `${base}En`;
      const frName = `${base}Fr`;

      if (!names.has(enName) || !names.has(frName)) {
        discoveryIssues.push({
          code: 'catalog-language-pair-missing',
          file,
          key: base,
          message: `Catalog ${base} must export both ${enName} and ${frName}.`,
        });
        continue;
      }

      pairs.push({
        id: base,
        enName,
        frName,
        enFile: file,
        frFile: file,
        en: parseCatalog(source, enName, file),
        fr: parseCatalog(source, frName, file),
        runtimeRegistration: undefined,
        globalKeys: true,
      });
    }

    for (const name of bilingual.names) {
      pairs.push({
        id: name,
        enName: `${name}.en`,
        frName: `${name}.fr`,
        enFile: file,
        frFile: file,
        en: parseCatalog(source, `${name}.en`, file),
        fr: parseCatalog(source, `${name}.fr`, file),
        runtimeRegistration: false,
        globalKeys: false,
      });
    }
  }

  const result = {
    issues: [...discoveryIssues],
    metrics: { catalogs: pairs.length, enEntries: 0, frEntries: 0, matchingKeys: 0, pluralFamilies: 0 },
  };
  const seenEn = new Map();
  const seenFr = new Map();

  for (const pair of pairs) {
    pair.runtimeRegistration ??= pair.en.flat && pair.fr.flat;
    const pairResult = validateCatalogs({
      en: pair.en,
      fr: pair.fr,
      enFile: pair.enFile,
      frFile: pair.frFile,
    });

    result.issues.push(...pairResult.issues);

    for (const metric of ['enEntries', 'frEntries', 'matchingKeys', 'pluralFamilies']) {
      result.metrics[metric] += pairResult.metrics[metric];
    }

    if (pair.globalKeys === false) {
      continue;
    }

    for (const [language, catalog, seen] of [
      ['en', pair.en, seenEn],
      ['fr', pair.fr, seenFr],
    ]) {
      for (const key of catalog.entries.keys()) {
        const previous = seen.get(key);

        if (previous) {
          result.issues.push({
            code: 'catalog-key-duplicate-cross-file',
            file: language === 'en' ? pair.enFile : pair.frFile,
            key,
            message: `${key} is already defined in ${previous}.`,
          });
        } else {
          seen.set(key, language === 'en' ? pair.enFile : pair.frFile);
        }
      }
    }
  }

  result.issues.push(...validateRuntimeMissingKeyFallback(runtimeSource, RUNTIME_FILE));
  result.issues.push(
    ...validateCatalogRegistration(
      runtimeSource,
      pairs.filter((pair) => pair.runtimeRegistration),
      RUNTIME_FILE,
    ),
  );

  return result;
}

async function runCli() {
  const result = await validateRepositoryCatalogs();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `i18n catalogs: files=${result.metrics.catalogs}, en=${result.metrics.enEntries}, fr=${result.metrics.frEntries}, ` +
        `matching=${result.metrics.matchingKeys}, pluralFamilies=${result.metrics.pluralFamilies}`,
    );
  }

  if (result.issues.length > 0) {
    if (!process.argv.includes('--json')) {
      console.error(result.issues.map(formatIssue).join('\n'));
    }

    process.exitCode = 1;
  } else if (!process.argv.includes('--json')) {
    console.log('i18n catalog validation clean');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
