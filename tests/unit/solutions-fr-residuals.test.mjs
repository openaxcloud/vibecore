import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- this test exercises a standalone repository audit script.
import {
  FR_RESIDUAL_ALLOWLIST,
  SOLUTION_COPY_SOURCES,
  auditSolutionCatalogue,
  auditSolutionFiles,
  looksLikeEnglishProse,
  parseSolutionCopySource,
} from '../../scripts/solutions-fr-residuals-lib.mjs';

describe('Solutions French residual audit', () => {
  it('scans the Solutions index plus exactly eight remaining pages, including Enterprise', () => {
    assert.deepEqual(
      SOLUTION_COPY_SOURCES.map(([slug]) => slug),
      [
        'solutions-index',
        'website-builder',
        'game-builder',
        'dashboard-builder',
        'chatbot-builder',
        'internal-ai-builder',
        'enterprise',
        'startups',
        'freelancers',
      ],
    );
  });

  it('parses static TypeScript copy catalogues without executing repository code', () => {
    const catalogue = parseSolutionCopySource(`
      export const COPY = {
        en: { hero: { title: 'Build your app' }, items: ['One', 'Two'] },
        fr: { hero: { title: 'Construisez votre app' }, items: ['Un', 'Deux'] },
      } as const;
    `);

    assert.equal(catalogue.fr.hero.title, 'Construisez votre app');
    assert.deepEqual(catalogue.en.items, ['One', 'Two']);
  });

  it('fails closed on missing translations, unchanged prose, and English prose', () => {
    const report = auditSolutionCatalogue({
      slug: 'fixture',
      file: 'fixture.copy.ts',
      catalogue: {
        en: { missing: 'Missing text', unchanged: 'See how it builds', mixed: 'English source' },
        fr: { missing: '', unchanged: 'See how it builds', mixed: 'Build your project with real code' },
      },
    });

    assert.deepEqual(
      report.findings.map(({ path, kind }) => [path, kind]),
      [
        ['missing', 'missing-fr'],
        ['unchanged', 'identical-en-fr'],
        ['mixed', 'english-prose'],
      ],
    );
    assert.equal(looksLikeEnglishProse('Construisez votre projet avec du vrai code'), false);
    assert.equal(looksLikeEnglishProse('Delivered'), true);
  });

  it('keeps every exception exact and documented', () => {
    assert.ok(FR_RESIDUAL_ALLOWLIST.length > 0);
    assert.equal(new Set(FR_RESIDUAL_ALLOWLIST.map(({ value }) => value)).size, FR_RESIDUAL_ALLOWLIST.length);

    for (const entry of FR_RESIDUAL_ALLOWLIST) {
      assert.ok(entry.value.trim().length > 0);
      assert.ok(entry.reason.trim().length > 8, `${entry.value} needs a specific reason`);
    }
  });

  it('reports zero English residuals across all eight real French catalogues', () => {
    const report = auditSolutionFiles();

    assert.equal(report.summary.pages, 9);
    assert.equal(report.summary.findings, 0, JSON.stringify(report.findings, null, 2));
    assert.equal(report.summary.englishStrings, report.summary.frenchStrings);
    assert.equal(report.summary.translatedPercent, 100);
  });
});
