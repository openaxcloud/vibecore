import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const requiredWorkflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/e2e.yml',
  '.github/workflows/docker.yml',
  '.github/workflows/terraform.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-main.yml',
  '.github/workflows/deploy-break-glass.yml',
  '.github/workflows/release-gate-dryrun.yml',
  '.github/workflows/staging-runtime-validation.yml',
  '.github/workflows/desktop-release.yml',
  '.github/workflows/mobile-release.yml',
];

const requiredLoadTests = [
  'tests/load/api-load.js',
  'tests/load/workspace-lifecycle-load.js',
  'tests/load/preview-load.js',
  'tests/load/ai-simulated-load.js',
  'tests/load/billing-webhook-load.js',
];

const requiredDocs = ['docs/CI_CD.md', 'docs/RELEASE_PROCESS.md', 'docs/ROLLBACK.md', 'docs/LOAD_TESTING.md'];

const requiredMobileAssets = [
  'apps/mobile/capacitor.config.ts',
  'apps/mobile/android/app/src/main/AndroidManifest.xml',
  'apps/mobile/ios/App/App/Info.plist',
  'apps/mobile/ios/App/App/App.entitlements',
  'apps/mobile/assets/assetlinks.json',
  'apps/mobile/assets/apple-app-site-association',
  'public/.well-known/assetlinks.json',
  'public/.well-known/apple-app-site-association',
  'docs/MOBILE_APPS.md',
  'docs/IOS_RELEASE.md',
  'docs/ANDROID_RELEASE.md',
  'docs/MOBILE_SECURITY.md',
];

for (const file of [...requiredWorkflows, ...requiredLoadTests, ...requiredDocs, ...requiredMobileAssets]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required CI/CD asset: ${file}`);
  }
}

const workflowFiles = fs
  .readdirSync('.github/workflows')
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => path.join('.github/workflows', file));

for (const file of workflowFiles) {
  const document = parseDocument(fs.readFileSync(file, 'utf8'));

  if (document.errors.length > 0) {
    throw new Error(`${file} is not valid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }

  if (!document.get('jobs')) {
    throw new Error(`${file} must define jobs`);
  }
}

// RELEASE INTEGRITY: there must be exactly ONE way to deploy production, and it must
// go through the exact-SHA gate.
//
// `deploy-prod.yml` used to be a second, ungated path: a free-form `image_tag` input,
// `helm upgrade --install` WITHOUT `--reuse-values`, and `--set global.imageTag=<tag>`.
// Running it would not merely bypass the gate — it would drop every per-service
// `imageDigest` the gated path had pinned and put the whole platform back on a single
// mutable tag. It also used a different concurrency group, so it could race a gated
// rollout. It has been removed; the sanctioned manual path is `deploy-main.yml`'s
// `target_sha` dispatch, which is bound to a commit already on main and passes the
// same gate as a push.
if (fs.existsSync('.github/workflows/deploy-prod.yml')) {
  throw new Error(
    'deploy-prod.yml is back. Production must have exactly one deploy path (deploy-main.yml, gated). ' +
      'A second path that sets global.imageTag would unpin every digest the gate established.',
  );
}

const gatedProd = fs.readFileSync('.github/workflows/deploy-main.yml', 'utf8');
if (!gatedProd.includes('environment:') || !gatedProd.includes('production')) {
  throw new Error('deploy-main.yml must use the production GitHub Environment.');
}
if (!gatedProd.includes('helm rollback')) {
  throw new Error('deploy-main.yml must print rollback instructions.');
}
for (const expected of ['release-gate', 'verify-required-checks.mjs', 'imageDigest', 'verify-imageids']) {
  if (!gatedProd.includes(expected)) {
    throw new Error(`deploy-main.yml missing release-gate wiring: ${expected}`);
  }
}

const stagingWorkflow = fs.readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
for (const expected of ['actions/setup-node@', 'pnpm/action-setup@', 'pnpm install --frozen-lockfile']) {
  if (!stagingWorkflow.includes(expected)) {
    throw new Error(`deploy-staging.yml missing dependency setup: ${expected}`);
  }
}

for (const [file, requiredPermissions] of [
  // deploy-main.yml deliberately does NOT grant id-token at the workflow level — the
  // release gate must be able to refuse before any WIF-exchangeable credential exists.
  // Its build job grants it per-job; that is asserted by validate-deploy-gate-wired.mjs.
  ['.github/workflows/deploy-main.yml', ['contents: read', 'actions: read']],
  ['.github/workflows/deploy-staging.yml', ['contents: read', 'id-token: write']],
  ['.github/workflows/staging-runtime-validation.yml', ['contents: read', 'id-token: write']],
]) {
  const source = fs.readFileSync(file, 'utf8');

  for (const permission of requiredPermissions) {
    if (!source.includes(permission)) {
      throw new Error(`${file} missing required permission ${permission}`);
    }
  }

  if (source.includes('contents: write')) {
    throw new Error(`${file} must not request contents: write`);
  }
}

const dockerWorkflow = fs.readFileSync('.github/workflows/docker.yml', 'utf8');
for (const image of [
  'web',
  'admin',
  'api',
  'worker',
  'ai-gateway',
  'workspace-manager',
  'workspace-agent',
  'preview-proxy',
]) {
  if (!dockerWorkflow.includes(`image: ${image}`)) {
    throw new Error(`docker.yml does not build image ${image}`);
  }
}
for (const keyword of ['sbom', 'trivy', 'Artifact Registry']) {
  if (!dockerWorkflow.toLowerCase().includes(keyword.toLowerCase())) {
    throw new Error(`docker.yml missing ${keyword}`);
  }
}

const stagingRuntimeWorkflow = fs.readFileSync('.github/workflows/staging-runtime-validation.yml', 'utf8');
for (const expected of [
  'workflow_dispatch',
  'STAGING_WORKSPACE_CLUSTER',
  'RUNTIME_E2E_SKIP_KIND: "1"',
  'RUNTIME_E2E_SKIP_IMAGE_BUILD: "1"',
  'pnpm run runtime:validate:remote-kubernetes',
  'pnpm run networkpolicies:validate:live',
  'NETWORKPOLICY_BLOCKED_IPS',
]) {
  if (!stagingRuntimeWorkflow.includes(expected)) {
    throw new Error(`staging-runtime-validation.yml missing ${expected}`);
  }
}

const mobileWorkflow = fs.readFileSync('.github/workflows/mobile-release.yml', 'utf8');
for (const expected of [
  'actions/setup-java@v4',
  'java-version: 21',
  'pnpm mobile:validate',
  'pnpm mobile:release-assets',
  'pnpm mobile:validate:release',
  'pnpm mobile:build:android',
  'pnpm --filter @vibecore/mobile sync:ios',
  'pnpm mobile:build:ios:docs',
]) {
  if (!mobileWorkflow.includes(expected)) {
    throw new Error(`mobile-release.yml missing ${expected}`);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    workflows: requiredWorkflows.length,
    parsedWorkflows: workflowFiles.length,
    loadTests: requiredLoadTests.length,
    mobileAssets: requiredMobileAssets.length,
  }),
);
