#!/usr/bin/env node

import { auditSolutionsFrench, formatSolutionsFrenchAudit } from './solutions-fr-residuals-lib.mjs';

function parseArguments(argv) {
  const options = { format: 'text', failOnFindings: true, rootDirectory: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--json' || argument === '--format=json') {
      options.format = 'json';
    } else if (argument === '--format=text') {
      options.format = 'text';
    } else if (argument === '--no-fail') {
      options.failOnFindings = false;
    } else if (argument === '--root') {
      const rootDirectory = argv[index + 1];

      if (!rootDirectory) {
        throw new Error('--root requires a directory.');
      }

      options.rootDirectory = rootDirectory;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

const options = parseArguments(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`Usage: node scripts/audit-solutions-fr-residuals.mjs [options]

Strictly audits the eight in-scope Solutions copy modules (EN versus FR).
Enterprise is intentionally excluded.

Options:
  --json, --format=json  Emit stable machine-readable JSON
  --format=text          Emit the human-readable report (default)
  --no-fail              Exit 0 even when findings remain
  --root <directory>     Repository root (defaults to the current directory)
  -h, --help             Show this help
`);
  process.exit(0);
}

const report = await auditSolutionsFrench({ rootDirectory: options.rootDirectory });
process.stdout.write(
  options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : formatSolutionsFrenchAudit(report),
);

if (options.failOnFindings && report.findings.length > 0) {
  process.exitCode = 1;
}
