#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const CHART = 'infra/helm/platform';
const RELEASE = 'vibecore';
const FULLNAME = 'vibecore-vibecore-platform';
const BASELINE_DIGEST = `sha256:${'a'.repeat(64)}`;
const ADMIN_DIGEST = `sha256:${'b'.repeat(64)}`;
const ADMIN_SOURCE_SHA = 'c'.repeat(40);

let failures = 0;

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`ok   - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function documents(manifest) {
  return manifest
    .split(/^---\s*$/mu)
    .map((document) => document.trim())
    .filter(Boolean);
}

function resource(manifest, kind, name) {
  return documents(manifest).find(
    (document) =>
      new RegExp(`^kind: ${kind}$`, 'mu').test(document) && new RegExp(`^  name: ${name}$`, 'mu').test(document),
  );
}

const manifest = execFileSync(
  'helm',
  [
    'template',
    RELEASE,
    CHART,
    '--set-string',
    `global.imageDigest=${BASELINE_DIGEST}`,
    '--set-string',
    `services.admin.imageDigest=${ADMIN_DIGEST}`,
    '--set-string',
    `services.admin.imageSourceSha=${ADMIN_SOURCE_SHA}`,
  ],
  { encoding: 'utf8' },
);

const adminDeployment = resource(manifest, 'Deployment', `${FULLNAME}-admin`) ?? '';
const webDeployment = resource(manifest, 'Deployment', `${FULLNAME}-web`) ?? '';
const adminService = resource(manifest, 'Service', `${FULLNAME}-admin`) ?? '';

check('admin Deployment renders', Boolean(adminDeployment));
check(
  'admin Deployment alone receives its rebuilt immutable digest',
  adminDeployment.includes(`/admin@${ADMIN_DIGEST}`) && webDeployment.includes(`/web@${BASELINE_DIGEST}`),
  `admin image=${adminDeployment.match(/^\s*image: (.*)$/mu)?.[1] ?? 'missing'}, web image=${webDeployment.match(/^\s*image: (.*)$/mu)?.[1] ?? 'missing'}`,
);
check(
  'admin Deployment persists the source commit beside its digest',
  adminDeployment.includes(`vibecore.dev/image-source-sha: "${ADMIN_SOURCE_SHA}"`) &&
    !webDeployment.includes('vibecore.dev/image-source-sha:'),
);
check(
  'admin Deployment has distinct /health readiness and liveness probes',
  (adminDeployment.match(/path: \/health/gu) ?? []).length === 2 &&
    adminDeployment.includes('readinessProbe:') &&
    adminDeployment.includes('livenessProbe:'),
);
check(
  'admin pod keeps the restricted runtime security posture',
  adminDeployment.includes('automountServiceAccountToken: false') &&
    adminDeployment.includes('runAsNonRoot: true') &&
    adminDeployment.includes('allowPrivilegeEscalation: false') &&
    adminDeployment.includes('readOnlyRootFilesystem: true'),
);
check(
  'admin Service selects the admin Deployment on port 3000',
  Boolean(adminService) &&
    adminService.includes('app.kubernetes.io/name: admin') &&
    /port: 3000\s+targetPort: http/u.test(adminService),
);

if (failures > 0) {
  console.error(`\n${failures} admin Helm render check(s) failed — refusing production upgrade.`);
  process.exit(1);
}

console.log('\nAll admin Helm render checks passed.');
