#!/usr/bin/env node
/*
 * P11 screenshotter — mandatory Helm RENDER test.
 *
 * Why this exists: the screenshotter is enabled in prod via `--set` flags in
 * .github/workflows/deploy-main.yml (CD deploys with --reuse-values, which
 * ignores values-prod.yaml), and its auth secret is chart-generated
 * (templates/screenshotter-auth-secret.yaml). A template typo would only
 * surface mid-`helm upgrade --atomic` as a production rollback. This script
 * proves, BEFORE any upgrade, that the chart renders:
 *   1. under values-prod.yaml: the screenshotter Deployment + Service, the
 *      chart-managed auth Secret (with the SCREENSHOTTER_SHARED_SECRET key),
 *      the allow-screenshotter-egress NetworkPolicy, the configmap URL, and
 *      the auth Secret mounted (envFrom) on EVERY Deployment;
 *   2. under default values: NO screenshotter Deployment (still opt-in for
 *      other installs of this chart) but the auth Secret still provisioned;
 *   3. under the exact --set combination deploy-main.yml uses on top of
 *      default values (the --reuse-values simulation for a release whose
 *      stored values pre-date the feature).
 *
 * Run: node scripts/validate-helm-screenshotter.mjs   (requires `helm` in PATH)
 * Wired into .github/workflows/deploy-main.yml as a blocking pre-upgrade step.
 */

import { execFileSync } from 'node:child_process';

const CHART = 'infra/helm/platform';
const FULLNAME = 'vibecore-vibecore-platform';
const SECRET_NAME = `${FULLNAME}-screenshotter-auth`;
const SCREENSHOTTER_URL = `http://${FULLNAME}-screenshotter.vibecore.svc.cluster.local:3030`;
const PREVIEW_PROXY_URL = `http://${FULLNAME}-preview-proxy.vibecore.svc.cluster.local:3020`;

// Must stay in lock-step with the SETS block in deploy-main.yml.
const DEPLOY_MAIN_SETS = [
  '--set',
  'services.screenshotter.enabled=true',
  '--set',
  'services.screenshotter.imageTag=testsha0000',
  '--set-string',
  `platformEnv.screenshotterUrl=${SCREENSHOTTER_URL}`,
  '--set-string',
  'platformEnv.screenshotterAllowedHosts=preview.e-code.ai',
  '--set-string',
  `platformEnv.screenshotterPreviewProxyUrl=${PREVIEW_PROXY_URL}`,
];

let failures = 0;

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`ok   - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function helmTemplate(args) {
  return execFileSync('helm', ['template', 'vibecore', CHART, ...args], { encoding: 'utf8' });
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---- 1. values-prod.yaml renders the full screenshotter surface ----
const prod = helmTemplate(['--values', `${CHART}/values-prod.yaml`]);

check(
  'values-prod renders the screenshotter Deployment',
  prod.includes(`name: ${FULLNAME}-screenshotter\n`) && /app\.kubernetes\.io\/name: screenshotter/.test(prod),
);
check(
  'values-prod renders the chart-managed auth Secret with SCREENSHOTTER_SHARED_SECRET',
  prod.includes(`name: ${SECRET_NAME}`) && /SCREENSHOTTER_SHARED_SECRET: "[A-Za-z0-9+/=]+"/.test(prod),
);
check('values-prod renders allow-screenshotter-egress', prod.includes('name: allow-screenshotter-egress'));
check(
  'values-prod configmap points SCREENSHOTTER_URL at the in-cluster service',
  prod.includes(`SCREENSHOTTER_URL: "${SCREENSHOTTER_URL}"`),
);
check(
  'values-prod configmap sets the SSRF allowlist + preview-proxy route',
  prod.includes('SCREENSHOTTER_ALLOWED_HOSTS: "preview.e-code.ai"') &&
    prod.includes(`SCREENSHOTTER_PREVIEW_PROXY_URL: "${PREVIEW_PROXY_URL}"`),
);

// Every Deployment must mount the auth secret via envFrom (api sends the
// bearer, the screenshotter pod verifies it — both read the same Secret).
{
  const deployments = count(prod, '\nkind: Deployment\n');
  // Occurrences of the secret name = 1 (the Secret's own metadata) + one
  // envFrom secretRef per Deployment.
  const refs = count(prod, `name: ${SECRET_NAME}`) - 1;
  check(
    `auth Secret is envFrom-mounted on every Deployment (${refs}/${deployments})`,
    deployments > 0 && refs === deployments,
    `deployments=${deployments} secretRefs=${refs}`,
  );
}

// ---- 2. default values: still opt-in, but the secret pre-provisions ----
const defaults = helmTemplate([]);

check(
  'default values do NOT render a screenshotter Deployment (feature stays opt-in)',
  !defaults.includes(`name: ${FULLNAME}-screenshotter\n`),
);
check(
  'default values still provision the auth Secret (safe pre-provisioning)',
  defaults.includes(`name: ${SECRET_NAME}`),
);

// ---- 3. deploy-main.yml --set combination over default values (--reuse-values
//         simulation: stored release values that pre-date the feature) ----
const viaSets = helmTemplate(DEPLOY_MAIN_SETS);

check(
  'deploy-main --set combination renders the Deployment pinned to the pushed tag',
  viaSets.includes(`name: ${FULLNAME}-screenshotter\n`) && viaSets.includes('screenshotter:testsha0000'),
);
check(
  'deploy-main --set combination renders the configmap URL',
  viaSets.includes(`SCREENSHOTTER_URL: "${SCREENSHOTTER_URL}"`),
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}

console.log('\nall screenshotter render checks passed');
