#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  applyAllowlist,
  buildBaseline,
  compareWithBaseline,
  scanRepository,
  summarizeFindings,
  validateAllowlist,
  validateBaseline,
} from './source-scanner.mjs';

const ALLOWLIST_FILE = 'scripts/i18n/source-allowlist.json';
const BASELINE_FILE = 'scripts/i18n/source-baseline.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function printErrors(title, errors) {
  if (errors.length === 0) {
    return;
  }

  console.error(title);
  console.error(errors.map((error) => `- ${error}`).join('\n'));
}

function formatViolation(violation) {
  return `${violation.file}: ${violation.code} (baseline=${violation.baseline}, current=${violation.current})`;
}

export async function runSourceScan({ mode = 'check', sourceRevision, includeFiles = false } = {}) {
  const allowlist = await readJson(ALLOWLIST_FILE);
  const allowlistErrors = validateAllowlist(allowlist);
  const scan = await scanRepository();
  const { accepted, residual } = applyAllowlist(scan.findings, allowlist);
  const summary = summarizeFindings(residual);
  const result = {
    mode,
    scannedFiles: scan.scannedFiles,
    ...(includeFiles ? { scannedFilePaths: scan.scannedFilePaths } : {}),
    parseErrors: scan.parseErrors,
    allowlistErrors,
    allowlistedFindings: accepted.length,
    residual: summary,
    baselineErrors: [],
    baselineViolations: [],
    improvements: [],
  };

  if (mode === 'print-baseline') {
    return { ...result, baseline: buildBaseline(residual, { sourceRevision }) };
  }

  if (mode === 'check') {
    const baseline = await readJson(BASELINE_FILE);
    result.baselineErrors = validateBaseline(baseline);

    if (result.baselineErrors.length === 0) {
      const comparison = compareWithBaseline(residual, baseline);
      result.baselineViolations = comparison.violations;
      result.improvements = comparison.improvements;
    }
  }

  return result;
}

async function runCli() {
  const mode = process.argv.includes('--print-baseline')
    ? 'print-baseline'
    : process.argv.includes('--require-zero')
      ? 'require-zero'
      : 'check';
  const result = await runSourceScan({
    mode,
    sourceRevision: process.env.GITHUB_SHA ?? 'working-tree',
    includeFiles: process.argv.includes('--include-files'),
  });

  if (mode === 'print-baseline') {
    if (result.parseErrors.length > 0 || result.allowlistErrors.length > 0) {
      printErrors(
        'Parser failures:',
        result.parseErrors.map(
          (error) => `${error.file}${error.line ? `:${error.line}:${error.column ?? 1}` : ''}: ${error.message}`,
        ),
      );
      printErrors('Invalid allowlist:', result.allowlistErrors);
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(result.baseline, null, 2));
    return;
  }

  const failed =
    result.parseErrors.length > 0 ||
    result.allowlistErrors.length > 0 ||
    result.baselineErrors.length > 0 ||
    result.baselineViolations.length > 0 ||
    (mode === 'require-zero' && result.residual.count > 0);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...result, passed: !failed }, null, 2));
  } else {
    console.log(
      `i18n source scan: files=${result.scannedFiles}, residual=${result.residual.count} ` +
        `in ${result.residual.files} files, allowlisted=${result.allowlistedFindings}, mode=${mode}`,
    );
    console.log(`rules: ${JSON.stringify(result.residual.byRule)}`);

    if (result.residual.topFiles.length > 0) {
      console.log('largest open residue files:');
      console.log(result.residual.topFiles.map(({ file, count }) => `- ${file}: ${count}`).join('\n'));
    }

    printErrors(
      'Parser failures:',
      result.parseErrors.map(
        (error) => `${error.file}${error.line ? `:${error.line}:${error.column ?? 1}` : ''}: ${error.message}`,
      ),
    );
    printErrors('Invalid allowlist:', result.allowlistErrors);
    printErrors('Invalid baseline:', result.baselineErrors);
    printErrors('Hardcoded-copy baseline regressions:', result.baselineViolations.map(formatViolation));

    if (mode === 'require-zero' && result.residual.count > 0) {
      console.error(`Zero-copy gate failed: ${result.residual.count} non-allowlisted findings remain.`);
    }

    if (!failed) {
      console.log(
        mode === 'check'
          ? `i18n source baseline clean (${result.improvements.length} file improvements detected)`
          : 'i18n source scan has zero residual findings',
      );
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
