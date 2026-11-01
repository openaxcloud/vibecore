import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { parseAllDocuments, stringify } from 'yaml';

// Native Node CI checks have no browser ~/ alias.
// eslint-disable-next-line no-restricted-imports
import { assertOnlyManagerChanges } from '../../infra/helm/stage-manager-before-api.mjs';

const old = `sha256:${'a'.repeat(64)}`;
const api = `sha256:${'b'.repeat(64)}`;
const manager = `sha256:${'c'.repeat(64)}`;
const registry = 'registry.example.invalid/platform';

const render = (...overrides) =>
  execFileSync(
    'helm',
    [
      'template',
      'test',
      'infra/helm/platform',
      '--namespace',
      'test',
      '--is-upgrade',
      '--set-string',
      `global.imageRegistry=${registry}`,
      '--set-string',
      `global.imageDigest=${old}`,
      ...overrides.flatMap((value) => ['--set-string', value]),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
const docs = (text) =>
  parseAllDocuments(text)
    .map((document) => {
      assert.equal(document.errors.length, 0);
      return document.toJSON();
    })
    .filter(Boolean);
const resource = (text, kind, suffix) => {
  const matches = docs(text).filter((doc) => doc.kind === kind && doc.metadata.name.endsWith(suffix));
  assert.equal(matches.length, 1);

  return matches[0];
};

test('real Helm render exposes retained-value drift without exempting that deployment', () => {
  // Models a retained old chart default, not a live cluster/Helm storage test.
  const before = render('services.web.replicas=7');

  const normalizeSyntheticLookups = (text) =>
    docs(text)
      .map((item) =>
        item.kind === 'Secret'
          ? {
              ...item,
              data: docs(before).find((old) => old.kind === 'Secret' && old.metadata.name === item.metadata.name).data,
            }
          : item,
      )
      .map((item) => stringify(item))
      .join('---\n');

  const stage = [`migrations.imageDigest=${api}`, `services.workspaceManager.imageDigest=${manager}`];

  const newDefaults = normalizeSyntheticLookups(render(...stage));
  assert.throws(
    () =>
      assertOnlyManagerChanges(
        before,
        newDefaults,
        'test-vibecore-platform-workspace-manager',
        `${registry}/api@${api}`,
      ),
    (error) => error.message.includes('UNRELATED_RESOURCE_CHANGED') && error.message.includes('/spec/replicas'),
  );

  const retained = normalizeSyntheticLookups(render('services.web.replicas=7', ...stage));
  assertOnlyManagerChanges(before, retained, 'test-vibecore-platform-workspace-manager', `${registry}/api@${api}`);
});

// No skip or stand-in Helm: setup-helm is a mandatory preceding CI step.
test('real Helm keeps old API and other services while migrating with new API before manager', () => {
  const before = render();

  const staged = render(`migrations.imageDigest=${api}`, `services.workspaceManager.imageDigest=${manager}`);

  /*
   * Offline Helm cannot perform Secret lookups and generates fresh random data.
   * Runtime uses --dry-run=server; supply the stored Secret data only in this
   * isolated render test. The guard's Secret-drift refusal is tested separately.
   */
  const prepared = docs(staged).map((item) =>
    item.kind === 'Secret'
      ? {
          ...item,
          data: docs(before).find((old) => old.kind === 'Secret' && old.metadata.name === item.metadata.name).data,
        }
      : item,
  );
  assertOnlyManagerChanges(
    before,
    prepared.map((item) => stringify(item)).join('---\n'),
    'test-vibecore-platform-workspace-manager',
    `${registry}/api@${api}`,
  );
  assert.equal(resource(staged, 'Deployment', '-api').spec.template.spec.containers[0].image, `${registry}/api@${old}`);
  assert.equal(
    resource(staged, 'Deployment', '-workspace-manager').spec.template.spec.containers[0].image,
    `${registry}/workspace-manager@${manager}`,
  );

  const hook = resource(staged, 'Job', '-prisma-migrate');
  assert.equal(hook.metadata.annotations['helm.sh/hook'], 'pre-install,pre-upgrade');
  assert.equal(hook.metadata.annotations['helm.sh/hook-weight'], '-10');
  assert.equal(hook.spec.template.spec.containers[0].image, `${registry}/api@${api}`);
  assert.equal(hook.spec.template.spec.automountServiceAccountToken, false);
  assert.equal(hook.spec.activeDeadlineSeconds, 300);
});

test('clearing the stage override follows API again, including later SEC8 upgrades', () => {
  for (const next of [api, old]) {
    // Explicit empty is what the final upgrade persists for --reuse-values.
    const rendered = render('migrations.imageDigest=', `services.api.imageDigest=${next}`);
    assert.equal(
      resource(rendered, 'Job', '-prisma-migrate').spec.template.spec.containers[0].image,
      `${registry}/api@${next}`,
    );
  }
  assert.equal(
    resource(render(), 'Job', '-prisma-migrate').spec.template.spec.containers[0].image,
    `${registry}/api@${old}`,
  );
});

test('unknown/malformed migration digest fails rendering instead of selecting a mutable image', () => {
  for (const bad of ['latest', 'sha256:nope', `sha256:${'a'.repeat(63)}`]) {
    assert.throws(() => render(`migrations.imageDigest=${bad}`));
  }
});
