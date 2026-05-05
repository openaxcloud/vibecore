import { existsSync, readFileSync } from 'node:fs';

const reportFile = process.env.IDE_PANEL_AUDIT_OUT ?? 'tmp/ide-panel-audit.json';
const docFile = 'docs/IDE_PANEL_AUDIT.md';

const expectedGroupCounts = {
  panel_get: 18,
  panel_action: 12,
  security_guard: 1,
  panel_render: 24,
  ui_interaction: 14,
  workspace_interaction: 6,
  responsive_viewport: 6,
};

const failures = [];

function readJson(file) {
  if (!existsSync(file)) {
    failures.push(`${file} is missing. Run pnpm run ide:panel-audit first.`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readText(file) {
  if (!existsSync(file)) {
    failures.push(`${file} is missing`);
    return '';
  }

  return readFileSync(file, 'utf8');
}

const report = readJson(reportFile);
const doc = readText(docFile);

if (report) {
  const summary = report.summary ?? {};
  const groupCounts = report.groupCounts ?? {};
  const networkEvidence = report.networkEvidence ?? {};
  const pageErrors = report.pageErrors ?? [];
  const results = Array.isArray(report.results) ? report.results : [];

  if (summary.failed !== 0) {
    failures.push(`audit report has ${summary.failed ?? 'unknown'} failed checks`);
  }

  const expectedTotal = Object.values(expectedGroupCounts).reduce((sum, count) => sum + count, 0);

  if (summary.total !== expectedTotal || summary.passed !== expectedTotal) {
    failures.push(`audit summary must be ${expectedTotal}/${expectedTotal}, got ${summary.passed}/${summary.total}`);
  }

  for (const [kind, expected] of Object.entries(expectedGroupCounts)) {
    if (groupCounts[kind] !== expected) {
      failures.push(`audit group ${kind} must be ${expected}, got ${groupCounts[kind] ?? 0}`);
    }
  }

  if ((groupCounts.page_error ?? 0) !== 0) {
    failures.push(`audit report contains ${groupCounts.page_error} browser page_error entries`);
  }

  if (pageErrors.length !== 0) {
    failures.push(`audit report contains ${pageErrors.length} collected browser errors`);
  }

  if (networkEvidence.serviceInteractions !== expectedGroupCounts.ui_interaction) {
    failures.push(
      `networkEvidence.serviceInteractions must be ${expectedGroupCounts.ui_interaction}, got ${networkEvidence.serviceInteractions}`,
    );
  }

  if (networkEvidence.serviceInteractionsWithBackendCalls !== expectedGroupCounts.ui_interaction) {
    failures.push(
      `networkEvidence.serviceInteractionsWithBackendCalls must be ${expectedGroupCounts.ui_interaction}, got ${networkEvidence.serviceInteractionsWithBackendCalls}`,
    );
  }

  if (networkEvidence.missingBackendMethods !== 0) {
    failures.push(`networkEvidence reports ${networkEvidence.missingBackendMethods} missing backend methods`);
  }

  const resultsWithMissingBackend = results.filter((result) => result.missingBackendMethods?.length);

  if (resultsWithMissingBackend.length > 0) {
    failures.push(`${resultsWithMissingBackend.length} results have missing backend methods`);
  }

  const failedResults = results.filter(
    (result) =>
      result.ok === false ||
      result.rendered === false ||
      result.applicationError === true ||
      result.expectedGuard === false,
  );

  if (failedResults.length > 0) {
    failures.push(`${failedResults.length} result entries are failing`);
  }
}

const requiredDocSnippets = [
  '| Total audited checks | PASS, 81/81 |',
  '| Backend panel GET endpoints | PASS, 18/18 |',
  '| Browser panel render checks | PASS, 24/24 |',
  '| Safe panel actions | PASS or expected quota guard, 12/12 |',
  '| Critical UI interactions | PASS, 14/14 |',
  '| UI backend method evidence | PASS, 14/14 service interactions observed expected backend methods |',
  '| Workspace UI interactions | PASS, 6/6 |',
  '| Responsive viewport audit | PASS, 6/6 |',
  '| Browser console/page errors | PASS, fail the audit if any collected page error exists |',
  'This audit does **not** certify Fortune 500 production readiness.',
  'Do not market the full IDE as “Fortune 500 complete”',
];

for (const snippet of requiredDocSnippets) {
  if (!doc.includes(snippet)) {
    failures.push(`${docFile} is missing required audit snippet: ${snippet}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`IDE panel audit report valid: ${reportFile}`);
