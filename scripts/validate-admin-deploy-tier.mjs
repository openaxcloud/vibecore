#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FILES = Object.freeze({
  workflow: '.github/workflows/deploy-main.yml',
  cloudbuild: 'infra/cloudbuild/single-admin.yaml',
  detector: 'scripts/detect-deploy-tiers.mjs',
  helmValues: 'infra/helm/platform/values-prod.yaml',
  helmDeployments: 'infra/helm/platform/templates/deployments.yaml',
  makefile: 'Makefile',
});

function problem(file, message) {
  return `::error file=${file}::${message}`;
}

function requirePattern(problems, file, text, pattern, message) {
  if (!pattern.test(text)) {
    problems.push(problem(file, message));
  }
}

export function validateAdminDeployTierSources(sources) {
  const problems = [];
  const { workflow, cloudbuild, detector, helmValues, helmDeployments, makefile } = sources;

  requirePattern(
    problems,
    FILES.detector,
    detector,
    /DEPLOY_TIERS\s*=\s*Object\.freeze\(\['runtime', 'web', 'admin', 'wsagent'\]\)/u,
    'admin is not a first-class deploy tier',
  );
  requirePattern(
    problems,
    FILES.detector,
    detector,
    /path\.startsWith\('apps\/admin\/'\)/u,
    'apps/admin changes do not select the admin tier',
  );

  for (const dependency of ['app/lib/i18n/catalogs/admin.ts', 'app/lib/i18n/language.ts']) {
    if (!detector.includes(`'${dependency}'`)) {
      problems.push(problem(FILES.detector, `missing real admin build dependency: ${dependency}`));
    }
  }

  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /node scripts\/detect-deploy-tiers\.mjs/u,
    'workflow does not execute the tested tier classifier',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /- name: Build admin tier \(Cloud Build\)\s+if: steps\.tiers\.outputs\.admin == 'true'/u,
    'admin Cloud Build step is missing or not gated by admin detection',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /--config=infra\/cloudbuild\/single-admin\.yaml/u,
    'admin build does not use the signed dedicated Cloud Build config',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /IMAGES="\$\{IMAGES\} \$\{REG\}\/admin:\$\{SHORT_SHA\}"/u,
    'blocking Trivy gate does not include the rebuilt admin image',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /--set "services\.admin\.imageTag=\$\{SHORT_SHA\}"/u,
    'atomic Helm upgrade does not pin the admin service tag',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /for svc in web admin api workspace-manager preview-proxy ai-gateway worker/u,
    'admin Deployment is absent from rollout verification',
  );
  requirePattern(
    problems,
    FILES.workflow,
    workflow,
    /LIVE_ADMIN=.*spec\.template\.spec\.containers\[0\]\.image/u,
    'live admin Deployment tag is not checked after rollout',
  );

  requirePattern(
    problems,
    FILES.cloudbuild,
    cloudbuild,
    /--build-arg=PACKAGE_FILTER=@vibecore\/admin/u,
    'Cloud Build does not select @vibecore/admin',
  );
  requirePattern(
    problems,
    FILES.cloudbuild,
    cloudbuild,
    /--build-arg=START_CMD=node serve\.mjs/u,
    'admin runtime command is missing',
  );
  requirePattern(
    problems,
    FILES.cloudbuild,
    cloudbuild,
    /docker push .*\/admin:\$\{_SHORT_SHA\}[\s\S]*docker push .*\/admin:latest/u,
    'immutable and cache admin tags are not explicitly pushed',
  );
  requirePattern(
    problems,
    FILES.cloudbuild,
    cloudbuild,
    /- id: sign-image[\s\S]*waitFor: \['push-image', 'fetch-cosign'\][\s\S]*bash scripts\/cosign-sign-images\.sh "\$digest_ref"/u,
    'admin image is not signed by registry digest after push',
  );
  requirePattern(
    problems,
    FILES.cloudbuild,
    cloudbuild,
    /- id: scan-image[\s\S]*waitFor: \['push-image'\][\s\S]*admin:\$\{_SHORT_SHA\}/u,
    'Artifact Registry scan is not sequenced after the admin push',
  );

  const sensitiveBuildArgs = cloudbuild
    .split(/\r?\n/u)
    .filter((line) => line.includes('--build-arg='))
    .filter((line) => /(?:SECRET|PASSWORD|TOKEN|API_KEY)/u.test(line));
  if (sensitiveBuildArgs.length > 0) {
    problems.push(problem(FILES.cloudbuild, 'sensitive values must never enter admin Docker build args'));
  }

  requirePattern(
    problems,
    FILES.helmValues,
    helmValues,
    /services:[\s\S]*?\n  admin:\n    enabled: true\n    image: admin\n    port: 3000/u,
    'production Helm values do not define the enabled admin service',
  );
  requirePattern(
    problems,
    FILES.helmDeployments,
    helmDeployments,
    /\$imageTag := default \$\.Values\.global\.imageTag \$svc\.imageTag/u,
    'Deployment template does not support a service-scoped immutable tag',
  );
  requirePattern(
    problems,
    FILES.makefile,
    makefile,
    /deploy-admin:[\s\S]*--config=infra\/cloudbuild\/single-admin\.yaml/u,
    'manual targeted admin build bypasses the signed admin config',
  );

  return problems;
}

function readSources() {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, readFileSync(file, 'utf8')]));
}

function runSelfTest(sources) {
  const baseline = validateAdminDeployTierSources(sources);

  if (baseline.length > 0) {
    console.error('SELF-TEST cannot start: repository baseline is invalid');
    baseline.forEach((entry) => console.error(entry));
    return 1;
  }

  const mutations = [
    ['remove admin source detection', 'detector', "path.startsWith('apps/admin/')", 'false'],
    ['remove admin build submission', 'workflow', '--config=infra/cloudbuild/single-admin.yaml', '--config=missing'],
    ['remove blocking admin scan', 'workflow', '${REG}/admin:${SHORT_SHA}', '${REG}/missing:${SHORT_SHA}'],
    [
      'remove Helm admin tag',
      'workflow',
      'services.admin.imageTag=${SHORT_SHA}',
      'services.missing.imageTag=${SHORT_SHA}',
    ],
    ['remove admin rollout', 'workflow', 'for svc in web admin api', 'for svc in web api'],
    [
      'remove digest signature',
      'cloudbuild',
      'bash scripts/cosign-sign-images.sh "$digest_ref"',
      'echo signature-removed',
    ],
  ];
  let failures = 0;

  for (const [name, key, needle, replacement] of mutations) {
    const mutatedText = sources[key].replace(needle, replacement);

    if (mutatedText === sources[key]) {
      console.error(`FAIL - ${name}: mutation needle was not found`);
      failures += 1;
      continue;
    }

    const mutated = { ...sources, [key]: mutatedText };
    const caught = validateAdminDeployTierSources(mutated).length > 0;
    console.log(`${caught ? 'ok  ' : 'FAIL'} - ${name}`);

    if (!caught) {
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`SELF-TEST FAILED: ${failures}/${mutations.length} mutation(s) escaped`);
    return 1;
  }

  console.log(`SELF-TEST OK: ${mutations.length}/${mutations.length} broken-wiring mutations rejected`);
  return 0;
}

function main() {
  const sources = readSources();

  if (process.argv.includes('--self-test')) {
    return runSelfTest(sources);
  }

  const problems = validateAdminDeployTierSources(sources);
  problems.forEach((entry) => console.error(entry));

  if (problems.length > 0) {
    console.error(`FAILED: ${problems.length} admin deploy tier policy violation(s)`);
    return 1;
  }

  console.log('OK: admin detection, build, scan, signature, Helm pin and rollout verification are wired');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
