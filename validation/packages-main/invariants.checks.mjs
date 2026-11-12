import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { agentResponseTimeout } from './upstream/runtime-agent-router.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const run = read('./run.sh'),
  workflow = read('../../.github/workflows/packages-main-runtime.yml');

const acceptance = read('./acceptance.mjs');
test('push is limited to a single validation branch, without PR, schedule or dispatch', () => {
  assert.match(workflow, /branches: \[test\/packages-main-runtime-20261112\]/);
  assert.doesNotMatch(workflow, /workflow_dispatch|pull_request:|schedule:|contents: write/);
  assert.match(workflow, /ref: 05515deb61d2ff7a77c11243cb0d1bed58a08e69/);
  assert.match(workflow, /path: product/);
  assert.match(workflow, /path: harness/);
  assert.match(workflow, /Always clean[\s\S]*if: always\(\)/);
});
test('all upstream transport/provision files are byte-identical to pinned e3bdf blobs', () => {
  for (const entry of JSON.parse(read('./upstream-provenance.json'))) {
    const data = readFileSync(new URL(`./upstream/${entry.path.split('/').at(-1)}`, import.meta.url));
    const blob = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
    assert.equal(blob, entry.sha, entry.path);
    assert.match(entry.source, /\/e3bdf79b0ac37338549e1019d3663d73dc46b74f\//);
  }
});
test('product SHA and full tree bytes checked before and after; image context is only Git archive', () => {
  const verify = read('./verify-product.sh');
  assert.match(verify, /e3d7f51ea4c250e686cfb560876da9c25ebab899/);
  assert.match(verify, /hashlib.sha1/);
  assert.match(verify, /git diff --exit-code HEAD/);
  assert(run.match(/verify-product.sh/g).length >= 4);
  assert.match(
    run,
    /git archive 05515deb61d2ff7a77c11243cb0d1bed58a08e69 > "\$RUNNER_TEMP\/packages-main-private\/product.tar"/,
  );
  assert.match(run, /-f "\$context\/services\/workspace-agent\/Dockerfile"/);
  assert.match(run, /-f "\$HARNESS_DIR\/Proof.Dockerfile" -t "\$PROOF_IMAGE" "\$context"/);
  assert.doesNotMatch(run, /git (cherry-pick|apply)|cp .*\$PRODUCT_DIR\//);
});
test('no security/quota/MFA/anti-abuse overrides or provider credentials', () => {
  assert.doesNotMatch(
    run + workflow + read('./Proof.Dockerfile'),
    /AUTH_REGISTER_RATE_LIMIT_MAX|AUTH_LOGIN_RATE_LIMIT_MAX|ADMIN_MFA_REQUIRED|ANTHROPIC_API_KEY|OPENAI_API_KEY|GCS_BUCKET|continue-on-error/,
  );
  assert.match(run, /--cap-drop=ALL --security-opt=no-new-privileges/);
  assert.match(read('./Proof.Dockerfile'), /USER node/);
});
test('only dedicated install relay gets330s, no change to ordinary transport', () => {
  assert.equal(agentResponseTimeout('POST', '/packages/v1/install', 120000), 330000);

  for (const [method, path] of [
    ['GET', '/packages/v1/install'],
    ['POST', '/commands'],
    ['POST', '/packages/v1/install?x=1'],
    ['GET', '/packages/v1/capabilities'],
  ]) {
    assert.equal(agentResponseTimeout(method, path, 120000), 120000);
  }
});
test('acceptance uses real UI once and pinned main helper; reload/same workspace/gVisor/digests required', () => {
  assert.match(acceptance, /verifyInstalledAuditPackage/);
  assert.match(acceptance, /PRODUCT_DIR}\/scripts\/ci\/package-install-import.mjs/);
  assert.match(acceptance, /timeout: 360000/);
  assert.equal((acceptance.match(/name: 'Install package'/g) ?? []).length, 1);
  assert.match(acceptance, /page.reload/);
  assert.match(acceptance, /state\?\.data\?\.workspace\?\.id, workspaceId/);
  assert.match(acceptance, /transport.installRequests, 1/);
  assert.match(acceptance, /pod.spec.runtimeClassName, 'gvisor'/);
  assert.match(acceptance, /cap.version, cap.maxBudgetMs, cap.validatedSpecs/);
  assert.match(acceptance, /\[401, 403\]/);
  assert.match(acceptance, /imageIDs.every\(Boolean\)/);
  assert.doesNotMatch(acceptance, /route\(|routeFromHAR|fulfill\(|fallback\(/);
});
test('cleanup trap precedes provisioning and images; failures remain failures', () => {
  assert(run.indexOf('trap cleanup EXIT') < run.indexOf('docker build --label'));
  assert(
    run.indexOf('trap cleanup EXIT') < run.indexOf('bash "$HARNESS_DIR/upstream/provision-runtime-kubernetes.sh"'),
  );
  assert.match(run, /trap 'exit 143' TERM/);
  assert.match(run, /exit "\$result"/);
  assert.match(acceptance, /process.exitCode = 1/);
  assert.match(read('./cleanup.sh'), /COMPOSE_PROJECT_NAME="packages-main-/);
});

test('runtime stop follows staged executable identity and propagates failure', () => {
  assert.doesNotMatch(run + read('./cleanup.sh'), /pkill/);
  assert.match(run, /runtime_status=\$\?/);
  assert.match(run, /\$runtime_status != 0/);
  assert.match(read('./stop-runtime.py'), /os.pidfd_open/);
  assert.match(read('./stop-runtime.py'), /signal.pidfd_send_signal/);
  assert.match(read('./stop-runtime.py'), /arguments\[0\] == executable/);
});

test('startup waits are bounded GET-only and do not retry installation', () => {
  assert.match(acceptance, /workspaceDeadline = performance.now\(\) \+ 180000/);
  assert.match(acceptance, /capabilityDeadline = performance.now\(\) \+ 180000/);
  assert.match(acceptance, /\[502, 503\].includes\(response.status\)/);
  assert.match(acceptance, /requests.length < 256/);
  assert.match(acceptance, /requestOverflow, false/);
});
