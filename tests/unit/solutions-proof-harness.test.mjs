import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

// The harness is a repository script, not an app module addressable through `~/`.
// eslint-disable-next-line no-restricted-imports
import {
  DEFAULT_OUTPUT_DIRECTORY,
  EXPECTED_MATRIX_ROWS,
  EXPECTED_SCREENSHOTS,
  LANGUAGES,
  REFERENCE_SOLUTION_SLUG,
  SCREENSHOT_WIDTHS,
  SOLUTION_SLUGS,
  THEMES,
  VIEWPORTS,
  buildProofMatrix,
  loadHarnessConfig,
  normalizeBaseUrl,
  resolveEvidenceDirectory,
  screenshotFilename,
} from '../../scripts/solutions-proof-harness-lib.mjs';

describe('Solutions proof matrix', () => {
  it('contains the exact eight remaining slugs and excludes the App Builder reference', () => {
    assert.deepEqual(SOLUTION_SLUGS, [
      'website-builder',
      'game-builder',
      'dashboard-builder',
      'chatbot-builder',
      'internal-ai-builder',
      'startups',
      'freelancers',
      'enterprise',
    ]);
    assert.equal(REFERENCE_SOLUTION_SLUG, 'app-builder');
    assert.equal(SOLUTION_SLUGS.includes(REFERENCE_SOLUTION_SLUG), false);
    assert.equal(SOLUTION_SLUGS.includes('enterprise'), true);
  });

  it('builds exactly 128 unique rows and exactly 96 screenshot rows', () => {
    const matrix = buildProofMatrix();

    assert.equal(matrix.length, EXPECTED_MATRIX_ROWS);
    assert.equal(new Set(matrix.map((row) => row.id)).size, EXPECTED_MATRIX_ROWS);
    assert.equal(matrix.filter((row) => row.captureScreenshot).length, EXPECTED_SCREENSHOTS);
    assert.equal(matrix.length, SOLUTION_SLUGS.length * LANGUAGES.length * THEMES.length * VIEWPORTS.length);
    assert.equal(
      matrix.filter((row) => row.captureScreenshot).length,
      SOLUTION_SLUGS.length * LANGUAGES.length * THEMES.length * SCREENSHOT_WIDTHS.length,
    );

    for (const slug of SOLUTION_SLUGS) {
      assert.equal(
        matrix.filter((row) => row.slug === slug).length,
        16,
        `${slug} must have 2 languages × 2 themes × 4 viewports`,
      );
      assert.equal(
        matrix.filter((row) => row.slug === slug && row.captureScreenshot).length,
        12,
        `${slug} must have 2 languages × 2 themes × 3 final screenshots`,
      );
    }

    assert.equal(
      matrix.some((row) => row.slug === REFERENCE_SOLUTION_SLUG),
      false,
    );
  });

  it('uses stable collision-free evidence names and never captures the 1024 matrix-only row', () => {
    const matrix = buildProofMatrix();
    const screenshotRows = matrix.filter((row) => row.captureScreenshot);
    const names = screenshotRows.map((row) => row.screenshot);

    assert.equal(new Set(names).size, EXPECTED_SCREENSHOTS);
    assert.equal(
      names.some((name) => name.endsWith('--1024.png')),
      false,
    );
    assert.equal(
      screenshotFilename({
        slug: 'internal-ai-builder',
        language: 'fr',
        theme: 'dark',
        viewport: { width: 390 },
      }),
      'internal-ai-builder--fr--dark--390.png',
    );
    assert.equal(
      screenshotFilename({
        slug: 'enterprise',
        language: 'en',
        theme: 'light',
        viewport: { width: 1440 },
      }),
      'enterprise--en--light--1440.png',
    );
  });
});

describe('Solutions proof configuration', () => {
  it('requires a base URL', () => {
    assert.throws(() => normalizeBaseUrl(undefined), /deployed base URL is required/i);
  });

  it('requires HTTPS for deployed hosts and rejects reserved examples', () => {
    assert.throws(() => normalizeBaseUrl('http://preview.e-code.ai'), /must use HTTPS/i);
    assert.throws(() => normalizeBaseUrl('https://example.com'), /example domains/i);
    assert.equal(normalizeBaseUrl('https://preview.e-code.ai').value, 'https://preview.e-code.ai');
  });

  it('rejects local origins unless the override is explicit', () => {
    assert.throws(() => normalizeBaseUrl('http://127.0.0.1:5173'), /rejected by default/i);
    assert.deepEqual(normalizeBaseUrl('http://127.0.0.1:5173', { allowLocal: true }), {
      value: 'http://127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      local: true,
    });
  });

  it('rejects private, link-local, metadata, single-label, and IPv6 ULA hosts as deployed proof', () => {
    for (const baseUrl of [
      'https://10.0.0.1',
      'https://100.64.0.1',
      'https://169.254.169.254',
      'https://172.16.0.1',
      'https://192.168.1.20',
      'https://preview.example',
      'https://preview.internal',
      'https://preview',
      'https://[fd00::1]',
      'https://[fe80::1]',
      'https://[fec0::1]',
    ]) {
      assert.throws(() => normalizeBaseUrl(baseUrl), /non-public base URLs are rejected/i, baseUrl);
    }

    assert.equal(normalizeBaseUrl('https://1.1.1.1').value, 'https://1.1.1.1');
  });

  it('keeps all generated evidence below docs/', () => {
    const cwd = '/tmp/vibecore-proof-config';

    assert.equal(
      resolveEvidenceDirectory(cwd, DEFAULT_OUTPUT_DIRECTORY).relative,
      'docs/deploy-evidence/solutions-final',
    );
    assert.throws(() => resolveEvidenceDirectory(cwd, '../outside'), /descendant.*docs/i);
    assert.throws(() => resolveEvidenceDirectory(cwd, 'docs'), /descendant.*docs/i);
  });

  it('loads CLI values ahead of environment values', () => {
    const config = loadHarnessConfig({
      argv: [
        '--base-url',
        'https://cli-preview.e-code.ai',
        '--output-dir',
        'docs/evidence/solutions/cli',
        '--workers',
        '3',
        '--timeout-ms',
        '45000',
      ],
      env: {
        SOLUTIONS_PROOF_BASE_URL: 'https://env-preview.e-code.ai',
        SOLUTIONS_PROOF_OUTPUT_DIR: 'docs/evidence/solutions/env',
        SOLUTIONS_PROOF_WORKERS: '1',
      },
      cwd: '/tmp/vibecore-proof-config',
    });

    assert.equal(config.baseUrl, 'https://cli-preview.e-code.ai');
    assert.equal(config.outputDirectoryRelative, 'docs/evidence/solutions/cli');
    assert.equal(config.workers, 3);
    assert.equal(config.timeoutMs, 45_000);
    assert.equal(config.deployed, true);
  });
});
