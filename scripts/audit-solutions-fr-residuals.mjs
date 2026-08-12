#!/usr/bin/env node

import { auditSolutionFiles, FR_RESIDUAL_ALLOWLIST } from './solutions-fr-residuals-lib.mjs';

const json = process.argv.includes('--json');
const report = auditSolutionFiles();

if (json) {
  process.stdout.write(`${JSON.stringify({ ...report, allowlist: FR_RESIDUAL_ALLOWLIST }, null, 2)}\n`);
} else {
  const detailPageCount = report.pages.filter((page) => page.slug !== 'solutions-index').length;

  console.log(
    `Solutions FR: index + ${detailPageCount} pages, ${report.summary.frenchStrings} chaînes, ` +
      `${report.summary.findings} résidu(s), ${report.summary.translatedPercent.toFixed(2)} % conforme.`,
  );

  for (const page of report.pages) {
    console.log(
      `${page.slug}: ${page.frenchStrings}/${page.englishStrings} chaînes FR, ` +
        `${page.findings.length} résidu(s), ${page.allowed.length} exception(s) justifiée(s).`,
    );
  }

  for (const finding of report.findings) {
    console.error(`${finding.file} ${finding.path} [${finding.kind}] ${JSON.stringify(finding.value)}`);
  }
}

if (report.findings.length > 0) {
  process.exitCode = 1;
}
