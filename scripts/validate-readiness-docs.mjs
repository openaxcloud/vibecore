import { readFileSync } from 'node:fs';

const requiredDocs = [
  'docs/PRODUCTION_READINESS.md',
  'docs/COMPLETION_MATRIX.md',
  'docs/GO_LIVE_CHECKLIST.md',
  'docs/RISK_REGISTER.md',
  'docs/REMAINING_BLOCKERS.md',
];

const requiredItems = [
  'Bolt IDE preserved',
  'RuntimeAdapter complete',
  'WebContainer mode conserved',
  'Remote Kubernetes mode functional',
  'Auth',
  'RBAC',
  'Enterprise SSO/SCIM readiness',
  'Projects',
  'File operations',
  'Terminal',
  'Preview',
  'AI tools',
  'Billing',
  'Quotas',
  'Admin',
  'Desktop app',
  'iOS app',
  'Android app',
  'Tablet UX',
  'Mobile editor fallback',
  'Collaboration',
  'Deployments',
  'Security',
  'Workspace isolation',
  'NetworkPolicies',
  'Admission policies',
  'Abuse detection',
  'Observability',
  'Backups',
  'CI/CD',
  'GCP infra',
  'Load tests',
  'Documentation',
  'Legal/compliance pages',
];

const docs = new Map(requiredDocs.map((file) => [file, readFileSync(file, 'utf8')]));
const readiness = docs.get('docs/PRODUCTION_READINESS.md') ?? '';
const matrix = docs.get('docs/COMPLETION_MATRIX.md') ?? '';

const failures = [];

for (const file of requiredDocs) {
  if (!docs.get(file)?.trim()) {
    failures.push(`${file} is empty`);
  }
}

if (!readiness.includes('not approved for production launch')) {
  failures.push('PRODUCTION_READINESS.md must explicitly avoid production-ready approval');
}

if (!readiness.includes('Private beta')) {
  failures.push('PRODUCTION_READINESS.md must include private beta readiness');
}

const strictPhrases = [
  'This product is not assessed as an MVP',
  'Permanent mocks are not acceptable substitutes for critical production flows',
  'Bolt IDE preservation remains a hard requirement',
  'Acceptance Criteria Status',
  'Platform can be called production ready',
  'missing',
];

for (const phrase of strictPhrases) {
  if (!readiness.includes(phrase)) {
    failures.push(`PRODUCTION_READINESS.md is missing strict readiness phrase: ${phrase}`);
  }
}

for (const item of requiredItems) {
  if (!matrix.includes(`| ${requiredItems.indexOf(item) + 1} | ${item} |`)) {
    failures.push(`COMPLETION_MATRIX.md is missing item: ${item}`);
  }
}

const statusMatches = matrix.match(/\| (complete|partial|missing) \|/g) ?? [];
if (statusMatches.length < requiredItems.length) {
  failures.push(`COMPLETION_MATRIX.md has ${statusMatches.length} statuses, expected at least ${requiredItems.length}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`readiness docs valid: ${requiredDocs.length} docs, ${requiredItems.length} matrix items`);
