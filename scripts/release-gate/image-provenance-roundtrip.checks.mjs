import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(path.join(root, '.github/workflows/deploy-main.yml'), 'utf8');
const { buildManifest } = await import(pathToFileURL(path.join(root, 'scripts/release-gate/release-manifest.mjs')));
const helm = 'helm';
const original = 'a'.repeat(40);
const target = 'b'.repeat(40);
const digest = `sha256:${'1'.repeat(64)}`;
const otherDigest = `sha256:${'2'.repeat(64)}`;
const registry = 'example.invalid/synthetic-provenance';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${command}: ${result.error?.message}`);

  return result;
}

function success(command, args, options) {
  const result = run(command, args, options);
  assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);

  return result.stdout;
}

function temporary(fn) {
  const directory = mkdtempSync(path.join(tmpdir(), 'image-provenance-'));

  try {
    return fn(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function entries(sourceSha = original) {
  return [
    { service: 'api', digest, tag: '', sourceSha, chartService: true, rolled: true },
    { service: 'workspaceAgent', digest, tag: '', sourceSha, chartService: false, rolled: false },
  ];
}

/*
 * Run the actual workflow's argument construction, not a reimplementation or a
 * fake helm/kubectl executable. Only its external inputs are synthetic data.
 */
function overrides(directory, services) {
  const start = workflow.indexOf('          while read -r service digest');
  const end = workflow.indexOf('          # Repris de main :', start);
  assert.ok(start >= 0 && end > start, 'workflow SETS block must exist');

  const block = workflow.slice(start, end).replace(/^          /gm, '');
  writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify({ services }));

  const output = success('bash', ['-c', `set -euo pipefail\nSETS=()\n${block}\nprintf '%s\\0' "\${SETS[@]}"`], {
    cwd: directory,
    env: { ...process.env, REG: registry },
  });

  return output.split('\0').filter(Boolean);
}

function render(directory, services, savedValues = {}, makeOverrides = overrides) {
  writeFileSync(path.join(directory, 'saved-values.json'), JSON.stringify(savedValues));

  const args = makeOverrides(directory, services);

  const result = run(helm, [
    'template',
    'provenance',
    path.join(root, 'infra/helm/platform'),
    '-f',
    path.join(directory, 'saved-values.json'),
    '--set-string',
    `global.imageRegistry=${registry}`,
    ...args,
  ]);

  return { result, args, documents: result.status === 0 ? result.stdout.split(/^---\s*$/m).filter(Boolean) : [] };
}

function objects(documents) {
  const deployment = documents.find(
    (d) => /^kind: Deployment$/m.test(d) && /^    app\.kubernetes\.io\/name: api$/m.test(d),
  );

  const configmap = documents.find((d) => /^kind: ConfigMap$/m.test(d) && /^  WORKSPACE_AGENT_IMAGE:/m.test(d));
  assert.ok(deployment, 'real Helm output contains API Deployment');
  assert.ok(configmap, 'real Helm output contains platform ConfigMap');

  return { deployment, configmap };
}

/*
 * Inspect only these scalar fields in Helm's actual YAML output. This is not a
 * general YAML parser and requires no npm dependencies in the deploy job.
 */
function scalar(document, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.match(new RegExp(`^ +${escaped}: (.+)$`, 'm'));

  if (!match) {
    return undefined;
  }

  return match[1].startsWith('"') ? JSON.parse(match[1]) : match[1];
}

function observed(documents) {
  const { deployment, configmap } = objects(documents);
  return {
    source: scalar(deployment, 'vibecore.dev/image-source-sha'),
    boundDigest: scalar(deployment, 'vibecore.dev/image-source-digest'),
    image: scalar(deployment, 'image'),
    agentSource: scalar(configmap, 'vibecore.dev/workspace-agent-image-source-sha'),
    agentBinding: scalar(configmap, 'vibecore.dev/workspace-agent-image-source-image'),
    agentImage: scalar(configmap, 'WORKSPACE_AGENT_IMAGE'),
  };
}

test('real Helm and jq are required, never silently skipped', () => {
  assert.match(success(helm, ['version', '--short']), /^v3\./);
  assert.match(success('jq', ['--version']), /^jq-/);
});

test('actual Bash and jq propagate known source and explicitly reset null source', () =>
  temporary((directory) => {
    const known = overrides(directory, entries());
    assert.ok(known.includes(`services.api.imageSourceSha=${original}`));
    assert.ok(known.includes(`platformEnv.runtime.workspaceAgentImageSourceSha=${original}`));

    const unknown = overrides(directory, entries(null));
    assert.ok(unknown.includes('services.api.imageSourceSha='));
    assert.ok(unknown.includes('platformEnv.runtime.workspaceAgentImageSourceSha='));
    assert.equal(
      unknown.some((arg) => arg.startsWith('services.workspaceAgent.')),
      false,
    );
  }));

test('workflow arguments reach real Deployment and ConfigMap provenance annotations', () =>
  temporary((directory) => {
    const rendered = render(directory, entries());
    assert.equal(rendered.result.status, 0, rendered.result.stderr);
    assert.deepEqual(observed(rendered.documents), {
      source: original,
      boundDigest: digest,
      image: `${registry}/api@${digest}`,
      agentSource: original,
      agentBinding: `${registry}/workspace-agent@${digest}`,
      agentImage: `${registry}/workspace-agent@${digest}`,
    });
    assert.equal(
      rendered.documents.some((d) => /^kind: Deployment$/m.test(d) && /^  name: .*workspace-agent$/m.test(d)),
      false,
    );
    assert.equal(
      rendered.args.some((arg) => arg.startsWith('services.workspaceAgent.')),
      false,
    );
  }));

test('saved Helm values retain original provenance on a later release, not the target SHA', () =>
  temporary((directory) => {
    const first = render(directory, entries());
    assert.equal(first.result.status, 0, first.result.stderr);

    const saved = {
      services: { api: { imageSourceSha: original, imageSourceDigest: digest, imageDigest: digest } },
      platformEnv: {
        runtime: {
          workspaceAgentImageSourceSha: original,
          workspaceAgentImageSourceImage: `${registry}/workspace-agent@${digest}`,
          workspaceAgentImage: `${registry}/workspace-agent@${digest}`,
        },
      },
    };

    const second = render(directory, entries(), saved);
    assert.equal(second.result.status, 0, second.result.stderr);
    assert.deepEqual(observed(second.documents), observed(first.documents));

    const data = observed(second.documents);

    const manifest = buildManifest({
      targetSha: target,
      registry,
      repository: 'synthetic/provenance',
      gateVerdictSha256: '4'.repeat(64),
      services: entries().map((entry) => ({
        ...entry,
        sourceSha: entry.chartService ? data.source : data.agentSource,
        rebuilt: false,
        cloudBuildId: null,
        signature: { verified: true, key: 'synthetic-evidence-only' },
        sbom: { format: 'cyclonedx-json', sha256: '3'.repeat(64) },
      })),
    });
    assert.equal(manifest.targetSha, target);
    assert.ok(manifest.services.every((service) => service.sourceSha === original));
    assert.equal(manifest.services.find((service) => service.service === 'workspaceAgent').rolled, false);
    assert.equal(manifest.services.find((service) => service.service === 'workspaceAgent').chartService, false);
  }));

test('null source explicitly erases stale saved provenance for Deployment and workspace agent', () =>
  temporary((directory) => {
    const saved = {
      services: { api: { imageSourceSha: original, imageSourceDigest: otherDigest, imageDigest: otherDigest } },
      platformEnv: {
        runtime: {
          workspaceAgentImageSourceSha: original,
          workspaceAgentImageSourceImage: `${registry}/workspace-agent@${otherDigest}`,
          workspaceAgentImage: `${registry}/workspace-agent@${otherDigest}`,
        },
      },
    };

    const rendered = render(directory, entries(null), saved);
    assert.equal(rendered.result.status, 0, rendered.result.stderr);

    const data = observed(rendered.documents);
    assert.equal(data.source, undefined);
    assert.equal(data.boundDigest, undefined);
    assert.equal(data.agentSource, undefined);
    assert.equal(data.agentBinding, undefined);
    assert.equal(data.image, `${registry}/api@${digest}`);
    assert.equal(data.agentImage, `${registry}/workspace-agent@${digest}`);
  }));

for (const field of ['services.api.imageSourceSha', 'platformEnv.runtime.workspaceAgentImageSourceSha']) {
  test(`real Helm schema rejects malformed SHA in ${field}`, () => {
    const result = run(helm, [
      'template',
      'provenance',
      path.join(root, 'infra/helm/platform'),
      '--set-string',
      `${field}=not-a-source-sha`,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /imageSourceSha|workspaceAgentImageSourceSha/);
    assert.match(result.stderr, /pattern/);
  });
}

test('actual Bash provenance binding guards reject mismatching or absent digest/image', () => {
  for (const [needle, valid, invalid] of [
    [
      'if [ -z "${PINNED}" ] || [ "${SOURCE_DIGEST}" != "${PINNED}" ]; then SOURCE_SHA=""; fi',
      { PINNED: digest, SOURCE_DIGEST: digest },
      { PINNED: digest, SOURCE_DIGEST: otherDigest },
    ],
    [
      'if [ "${SOURCE_IMAGE}" != "${CM_IMAGE}" ]; then SOURCE_SHA=""; fi',
      { SOURCE_IMAGE: `${registry}/workspace-agent@${digest}`, CM_IMAGE: `${registry}/workspace-agent@${digest}` },
      { SOURCE_IMAGE: `${registry}/workspace-agent@${otherDigest}`, CM_IMAGE: `${registry}/workspace-agent@${digest}` },
    ],
  ]) {
    assert.ok(workflow.includes(needle), 'workflow must bind the source to the current image');

    const execute = (environment) =>
      success('bash', ['-c', `set -euo pipefail\n${needle}\nprintf '%s' "$SOURCE_SHA"`], {
        env: { ...process.env, SOURCE_SHA: original, ...environment },
      });
    assert.equal(execute(valid), original);
    assert.equal(execute(invalid), '');
    assert.equal(
      execute(Object.fromEntries(Object.keys(valid).map((key) => [key, key === 'CM_IMAGE' ? valid[key] : '']))),
      '',
    );
  }
});

function breakGlassOverrides(directory, services) {
  const source = readFileSync(path.join(root, '.github/workflows/deploy-break-glass.yml'), 'utf8');

  const start = source.indexOf(
    '          while read -r service digest',
    source.indexOf('- name: Helm upgrade to the last-known-good digests'),
  );

  const end = source.indexOf('          echo "helm --set args:', start);
  assert.ok(start >= 0 && end > start, 'actual break-glass argument block exists');

  const block = source.slice(start, end).replace(/^          /gm, '');
  writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify({ services }));

  return success('bash', ['-c', `set -euo pipefail\nSETS=()\n${block}\nprintf '%s\\0' "\${SETS[@]}"`], {
    cwd: directory,
    env: { ...process.env, REG: registry },
  })
    .split('\0')
    .filter(Boolean);
}

function savedOrigin() {
  return {
    services: { api: { imageDigest: digest, imageSourceSha: original, imageSourceDigest: digest } },
    platformEnv: {
      runtime: {
        workspaceAgentImage: `${registry}/workspace-agent@${digest}`,
        workspaceAgentImageSourceSha: original,
        workspaceAgentImageSourceImage: `${registry}/workspace-agent@${digest}`,
      },
    },
  };
}

function replacement(sourceSha) {
  return entries(sourceSha).map((entry) => ({ ...entry, digest: otherDigest }));
}

function legacyReplacement() {
  return replacement(null).map(({ sourceSha: _sourceSha, ...entry }) => entry);
}

test('actual Bash break-glass replaces A with known B provenance and binding', () =>
  temporary((directory) => {
    const args = breakGlassOverrides(directory, replacement(target));

    for (const expected of [
      `services.api.imageDigest=${otherDigest}`,
      `services.api.imageSourceSha=${target}`,
      `services.api.imageSourceDigest=${otherDigest}`,
      `platformEnv.runtime.workspaceAgentImage=${registry}/workspace-agent@${otherDigest}`,
      `platformEnv.runtime.workspaceAgentImageSourceSha=${target}`,
      `platformEnv.runtime.workspaceAgentImageSourceImage=${registry}/workspace-agent@${otherDigest}`,
    ]) {
      assert.ok(args.includes(expected), expected);
    }
    assert.equal(
      args.some((arg) => arg.startsWith('services.workspaceAgent.')),
      false,
    );
  }));

test('actual Bash break-glass clears null and legacy absent source and bindings', () =>
  temporary((directory) => {
    for (const services of [replacement(null), legacyReplacement()]) {
      const args = breakGlassOverrides(directory, services);

      for (const expected of [
        'services.api.imageSourceSha=',
        'services.api.imageSourceDigest=',
        'platformEnv.runtime.workspaceAgentImageSourceSha=',
        'platformEnv.runtime.workspaceAgentImageSourceImage=',
      ]) {
        assert.ok(args.includes(expected), expected);
      }
    }
  }));

test('real Helm break-glass A to known B replaces both provenance bindings', () =>
  temporary((directory) => {
    const rendered = render(directory, replacement(target), savedOrigin(), breakGlassOverrides);
    assert.equal(rendered.result.status, 0, rendered.result.stderr);
    assert.deepEqual(observed(rendered.documents), {
      source: target,
      boundDigest: otherDigest,
      image: `${registry}/api@${otherDigest}`,
      agentSource: target,
      agentBinding: `${registry}/workspace-agent@${otherDigest}`,
      agentImage: `${registry}/workspace-agent@${otherDigest}`,
    });
    assert.equal(
      rendered.documents.some(
        (d) => /^kind: Deployment$/m.test(d) && /app\.kubernetes\.io\/name: workspace-agent/.test(d),
      ),
      false,
    );
  }));

test('real Helm break-glass A to unknown B clears null and legacy provenance', () =>
  temporary((directory) => {
    for (const services of [replacement(null), legacyReplacement()]) {
      const rendered = render(directory, services, savedOrigin(), breakGlassOverrides);
      assert.equal(rendered.result.status, 0, rendered.result.stderr);
      assert.deepEqual(observed(rendered.documents), {
        source: undefined,
        boundDigest: undefined,
        image: `${registry}/api@${otherDigest}`,
        agentSource: undefined,
        agentBinding: undefined,
        agentImage: `${registry}/workspace-agent@${otherDigest}`,
      });
    }
  }));

test('real Helm image-only change cannot bind saved A provenance to B', () =>
  temporary((directory) => {
    const rendered = render(directory, [], savedOrigin(), () => [
      '--set-string',
      `services.api.imageDigest=${otherDigest}`,
      '--set-string',
      `platformEnv.runtime.workspaceAgentImage=${registry}/workspace-agent@${otherDigest}`,
    ]);
    assert.equal(rendered.result.status, 0, rendered.result.stderr);
    assert.deepEqual(observed(rendered.documents), {
      source: undefined,
      boundDigest: undefined,
      image: `${registry}/api@${otherDigest}`,
      agentSource: undefined,
      agentBinding: undefined,
      agentImage: `${registry}/workspace-agent@${otherDigest}`,
    });
  }));
