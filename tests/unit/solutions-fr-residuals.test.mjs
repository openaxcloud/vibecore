import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { describe, it } from 'vitest';

// Repository audit utilities are not app modules addressable through `~/`.
// eslint-disable-next-line no-restricted-imports
import {
  ENGLISH_MARKERS,
  IDENTICAL_VALUE_ALLOWLIST,
  SOLUTION_COPY_SOURCES,
  TERM_ALLOWLIST,
  auditSolutionsFrench,
  extractLocaleStrings,
  scanLocalePair,
} from '../../scripts/solutions-fr-residuals-lib.mjs';

function fixtureRecords({ en, fr }) {
  const source = `export const COPY = { en: ${JSON.stringify(en)}, fr: ${JSON.stringify(fr)} } as const;`;
  return {
    englishRecords: extractLocaleStrings({ source, locale: 'en' }),
    frenchRecords: extractLocaleStrings({ source, locale: 'fr' }),
  };
}

describe('Solutions FR residual audit scope', () => {
  it('contains the exact eight requested copy modules and excludes Enterprise', () => {
    assert.deepEqual(
      SOLUTION_COPY_SOURCES.map(({ slug }) => slug),
      [
        'app-builder',
        'website-builder',
        'game-builder',
        'dashboard-builder',
        'chatbot-builder',
        'internal-ai-builder',
        'startups',
        'freelancers',
      ],
    );
    assert.equal(
      SOLUTION_COPY_SOURCES.some(({ file, slug }) => file.includes('enterprise') || slug === 'enterprise'),
      false,
    );
  });

  it('parses every EN/FR leaf statically with identical structure', async () => {
    for (const { file } of SOLUTION_COPY_SOURCES) {
      const source = await fs.readFile(file, 'utf8');
      const english = extractLocaleStrings({ source, sourceFile: file, locale: 'en' });
      const french = extractLocaleStrings({ source, sourceFile: file, locale: 'fr' });

      assert.deepEqual(
        french.map(({ propertyPath }) => propertyPath),
        english.map(({ propertyPath }) => propertyPath),
        file,
      );
    }
  });
});

describe('Solutions FR residual classification', () => {
  it('flags both a fully untranslated leaf and an English fragment inside French prose', () => {
    const records = fixtureRecords({
      en: { nav: 'Lobby', body: 'Review your app in Preview.' },
      fr: { nav: 'Lobby', body: 'Vérifiez your application dans Preview.' },
    });

    const report = scanLocalePair({ slug: 'fixture', file: 'fixture.ts', ...records });

    assert.deepEqual(
      report.findings.map(({ category, match, path }) => ({ category, match, path })),
      [
        { category: 'identical-to-en', match: 'Lobby', path: 'nav' },
        { category: 'english-marker', match: 'your', path: 'body' },
      ],
    );
  });

  it('allows named products and technical terms without hiding surrounding English prose', () => {
    const records = fixtureRecords({
      en: {
        brand: 'Meridian Studio',
        body: 'Use React and TypeScript in E-Code Preview.',
      },
      fr: {
        brand: 'Meridian Studio',
        body: 'Utilisez React et TypeScript dans Preview avec E-Code.',
      },
    });

    const report = scanLocalePair({ slug: 'fixture', file: 'fixture.ts', ...records });

    assert.deepEqual(report.findings, []);
    assert.equal(report.allowedIdentical[0].rule, 'brand-or-proper-name');
    assert.equal(report.termUsage.get('ecode-brand'), 1);
    assert.equal(report.termUsage.get('ecode-ui-name'), 1);
    assert.equal(report.termUsage.get('source-and-platform-term'), 2);
  });

  it('fails closed when EN and FR structures diverge', () => {
    const records = fixtureRecords({ en: { title: 'Title' }, fr: { body: 'Corps' } });

    assert.throws(
      () => scanLocalePair({ slug: 'fixture', file: 'fixture.ts', ...records }),
      /EN\/FR structure mismatch/,
    );
  });

  it('documents every allowlist rule and keeps marker ids unique', () => {
    for (const rule of [...IDENTICAL_VALUE_ALLOWLIST, ...TERM_ALLOWLIST]) {
      assert.ok(rule.id.length > 0);
      assert.ok(rule.reason.length >= 20, rule.id);
    }

    const ruleIds = [...IDENTICAL_VALUE_ALLOWLIST, ...TERM_ALLOWLIST].map(({ id }) => id);
    assert.equal(new Set(ruleIds).size, ruleIds.length);
    assert.equal(new Set(ENGLISH_MARKERS.map(({ id }) => id)).size, ENGLISH_MARKERS.length);
  });
});

describe('Solutions FR copy gate', () => {
  it('contains no unapproved English residual in the eight in-scope French pages', async () => {
    const report = await auditSolutionsFrench();

    assert.equal(
      report.findings.length,
      0,
      report.findings
        .map(({ file, line, path, match }) => `${file}:${line} ${path}: ${JSON.stringify(match)}`)
        .join('\n'),
    );
  });
});
