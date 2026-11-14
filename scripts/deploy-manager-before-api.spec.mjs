import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

// Standalone deployment code has no browser ~/ alias.
// eslint-disable-next-line no-restricted-imports
import {
  assertManagerReady,
  waitForManagerReady,
  assertMigrationComplete,
  assertOnlyManagerChanges,
  runStage,
  renderedRelease,
  stagePlan,
} from '../infra/helm/stage-manager-before-api.mjs';

const sha = 'a'.repeat(40);
const apiDigest = `sha256:${'b'.repeat(64)}`;
const managerDigest = `sha256:${'c'.repeat(64)}`;
const oldDigest = `sha256:${'d'.repeat(64)}`;
const registry = 'registry.example.invalid/project/platform';
const managerName = 'test-vibecore-platform-workspace-manager';

const manifest = {
  services: [
    {
      service: 'api',
      image: 'api',
      sourceSha: sha,
      digest: apiDigest,
      rebuilt: true,
    },
    {
      service: 'workspaceManager',
      image: 'workspace-manager',
      sourceSha: sha,
      digest: managerDigest,
      rebuilt: true,
    },
  ],
};

function deployment(name, image) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, generation: 2 },
    spec: {
      replicas: 1,
      template: {
        metadata: { annotations: {} },
        spec: { containers: [{ name: 'app', image }] },
      },
    },
    status: {
      observedGeneration: 2,
      updatedReplicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
    },
  };
}

const old = ['api', 'workspace-manager', 'web'].map((name) =>
  deployment(`test-vibecore-platform-${name}`, `${registry}/${name}@${oldDigest}`),
);

const prepared = structuredClone(old);
prepared[1].spec.template.spec.containers[0].image = `${registry}/workspace-manager@${managerDigest}`;
prepared[1].spec.template.metadata.annotations = {
  'vibecore.dev/image-source-sha': sha,
  'vibecore.dev/image-source-digest': managerDigest,
};

const docs = (items) => items.map((item) => stringify(item)).join('---\n');

function hooks(image) {
  const name = 'test-vibecore-platform-prisma-migrate';
  return [
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name,
        annotations: {
          'helm.sh/hook': 'pre-install,pre-upgrade',
          'helm.sh/hook-weight': '-20',
        },
      },
    },
    {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name,
        annotations: {
          'helm.sh/hook': 'pre-install,pre-upgrade',
          'helm.sh/hook-weight': '-10',
        },
      },
      spec: {
        template: {
          spec: {
            serviceAccountName: name,
            automountServiceAccountToken: false,
            containers: [{ name: 'migration', image }],
          },
        },
      },
    },
  ];
}

const readyPod = {
  metadata: {},
  spec: prepared[1].spec.template.spec,
  status: {
    phase: 'Running',
    conditions: [{ type: 'Ready', status: 'True' }],
    containerStatuses: [
      {
        ready: true,
        state: { running: { startedAt: '2026-11-01T00:00:00Z' } },
        imageID: `containerd://${registry}/workspace-manager@${managerDigest}`,
      },
    ],
  },
};
const completedMigration = {
  ...hooks(`${registry}/api@${apiDigest}`)[1],
  metadata: {
    ...hooks(`${registry}/api@${apiDigest}`)[1].metadata,
    uid: 'synthetic-migration-uid',
  },
  status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] },
};

function execute({
  after = prepared,
  failure,
  pod = readyPod,
  pods,
  migration = completedMigration,
  failCommandAt,
  commandError,
  invalidJsonAt,
  invalidJson,
  pauseFailure,
  beforePause,
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'stage-test-'));
  const envFile = join(directory, 'env');
  writeFileSync(envFile, '');

  const calls = [];

  let upgraded = false;
  let failedCommands = 0;
  let invalidResponses = 0;
  let time = 0;
  let error;
  let receipt;

  try {
    runStage({
      manifest,
      now: () => time,
      pause: (milliseconds) => {
        beforePause?.(directory);

        if (pauseFailure) {
          throw pauseFailure.error;
        }

        time += milliseconds;
      },
      env: {
        TARGET_SHA: sha,
        INITIAL_REVISION: '42',
        REG: registry,
        HELM_RELEASE: 'test',
        HELM_NAMESPACE: 'test',
        GITHUB_ENV: envFile,
        RUNNER_TEMP: directory,
      },
      command: (bin, args) => {
        calls.push([bin, ...args]);

        if (invalidJsonAt?.(bin, args, upgraded)) {
          invalidResponses++;
          return invalidJson;
        }

        if (failCommandAt?.(bin, args, upgraded)) {
          failedCommands++;
          throw commandError;
        }

        if (bin === 'helm' && args[0] === 'get') {
          return args[1] === 'values'
            ? '{}'
            : args[1] === 'hooks'
              ? docs(hooks(`${registry}/api@${oldDigest}`))
              : docs(old);
        }

        if (bin === 'helm' && args[0] === 'upgrade' && args.includes('--dry-run=server')) {
          expect(readFileSync(envFile, 'utf8')).not.toContain('STAGED_UPGRADE_STARTED=1');
          return JSON.stringify({
            manifest: docs(after),
            hooks: hooks(`${registry}/api@${apiDigest}`).map((hook) => ({
              manifest: docs([hook]),
            })),
          });
        }

        if (bin === 'helm' && args[0] === 'upgrade') {
          expect(readFileSync(envFile, 'utf8')).toContain('STAGED_UPGRADE_STARTED=1');

          if (failure === 'migration') {
            throw new Error('synthetic command failure');
          }

          upgraded = true;

          return '';
        }

        if (args.includes('rollout')) {
          if (failure === 'rollout') {
            throw new Error('synthetic rollout failure');
          }

          return '';
        }

        if (args.includes('pods')) {
          if (failure === 'pods-access') {
            throw new Error('Forbidden synthetic-private-provider-message');
          }

          return JSON.stringify({ items: pods ?? [pod] });
        }

        if (args[3] === 'job') {
          return JSON.stringify(migration);
        }

        const name = args[4];

        return JSON.stringify((upgraded ? after : old).find((item) => item.metadata.name === name));
      },
    });
  } catch (caught) {
    error = caught;
  } finally {
    const receiptFile = join(directory, 'manager-stage.json');

    if (existsSync(receiptFile)) {
      receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
    }

    rmSync(directory, { recursive: true, force: true });
  }

  return { calls, error, receipt, failedCommands, invalidResponses };
}

describe('migration, manager, API sequencing', () => {
  it('previews the same reuse-values upgrade and preserves all hook manifests', () => {
    const { calls, error } = execute();
    expect(error).toBeUndefined();

    const preview = calls.find((call) => call.includes('--dry-run=server'));

    const mutation = calls.find((call) => call[1] === 'upgrade' && !call.includes('--dry-run=server'));
    expect(preview.slice(0, -3)).toEqual(mutation);
    expect(preview.slice(-3)).toEqual(['--dry-run=server', '-o', 'json']);
    expect(preview).toContain('--reuse-values');
    expect(calls.some((call) => call.includes('template') || call.includes('values'))).toBe(false);

    for (const output of ['bad secret contents', '{}', '{"manifest":"x","hooks":[{}]}']) {
      expect(() => renderedRelease(output)).toThrow('STAGED_MANAGER_INVALID_DRY_RUN_RELEASE');
    }
  });

  it('reports resource identities and paths without leaking leaf values or secret map keys', () => {
    const secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'test-secret' },
      data: { 'private-key-name': 'old-secret-value' },
    };

    const changed = structuredClone(secret);
    changed.data['private-key-name'] = 'new-secret-value';

    const changedDeployment = structuredClone(prepared);
    changedDeployment[0].spec.replicas = 91;

    let message;

    try {
      assertOnlyManagerChanges(docs([...old, secret]), docs([...changedDeployment, changed]), managerName);
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('UNRELATED_RESOURCE_CHANGED');
    expect(message).toContain('test-secret');
    expect(message).toContain('/data/*');
    expect(message).toContain('/spec/replicas');

    for (const privateValue of ['private-key-name', 'old-secret-value', 'new-secret-value', '91']) {
      expect(message).not.toContain(privateValue);
    }
  });

  it('bounds diagnostics while retaining the rejection for wide unexpected changes', () => {
    const config = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'config' },
      spec: {},
    };

    const changed = structuredClone(config);

    for (let i = 0; i < 100; i++) {
      changed.spec[`field${i}`] = 'sensitive-leaf';
    }

    let message;

    try {
      assertOnlyManagerChanges(docs([...old, config]), docs([...prepared, changed]), managerName);
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('UNRELATED_RESOURCE_CHANGED');
    expect(message).toContain('"truncated":true');
    expect(message).not.toContain('sensitive-leaf');
    expect(message.length).toBeLessThan(3000);
  });

  it('requires exact target provenance and an original rollback revision before mutation', () => {
    expect(stagePlan(manifest, sha, '42')).toMatchObject({
      migrationDigest: apiDigest,
      managerDigest,
    });

    for (const revision of ['', '0', undefined, 'latest']) {
      expect(() => stagePlan(manifest, sha, revision)).toThrow();
    }

    for (const field of [{ sourceSha: 'e'.repeat(40) }, { digest: 'latest' }, { rebuilt: false }]) {
      const altered = structuredClone(manifest);
      Object.assign(altered.services[1], field);
      expect(() => stagePlan(altered, sha, '42')).toThrow();
    }

    const carried = structuredClone(manifest);
    carried.services[0].rebuilt = false;
    expect(stagePlan(carried, sha, '42')).toBeNull();
  });

  it('changes only the manager template and refuses API, sidecar or other service changes', () => {
    expect(() => assertOnlyManagerChanges(docs(old), docs(prepared), managerName)).not.toThrow();

    for (const index of [0, 2]) {
      const changed = structuredClone(prepared);
      changed[index].spec.template.spec.containers[0].image = `${registry}/api@${apiDigest}`;
      expect(() => assertOnlyManagerChanges(docs(old), docs(changed), managerName)).toThrow('UNRELATED');
    }

    const changed = structuredClone(prepared);
    changed[1].spec.template.spec.containers.push({
      name: 'unapproved',
      image: 'unapproved',
    });
    expect(() => assertOnlyManagerChanges(docs(old), docs(changed), managerName)).toThrow('CONTAINER');
  });

  it('refuses ConfigMap, Service, RBAC, Secret, added and removed resources before mutation', () => {
    for (const kind of ['ConfigMap', 'Service', 'Role', 'Secret']) {
      const item = {
        apiVersion: 'v1',
        kind,
        metadata: { name: 'same' },
        data: { value: 'old' },
      };

      const changed = { ...item, data: { value: 'changed' } };
      expect(() => assertOnlyManagerChanges(docs([...old, item]), docs([...prepared, changed]), managerName)).toThrow(
        'UNRELATED',
      );
      expect(() => assertOnlyManagerChanges(docs(old), docs([...prepared, item]), managerName)).toThrow('RESOURCE_SET');
      expect(() => assertOnlyManagerChanges(docs([...old, item]), docs(prepared), managerName)).toThrow('RESOURCE_SET');
    }
  });

  it('requires the exact migration hook image and preserves hook security', () => {
    const before = docs([...old, ...hooks(`${registry}/api@${oldDigest}`)]);
    const after = [...prepared, ...hooks(`${registry}/api@${apiDigest}`)];
    expect(() =>
      assertOnlyManagerChanges(before, docs(after), managerName, `${registry}/api@${apiDigest}`),
    ).not.toThrow();
    expect(() => assertOnlyManagerChanges(before, docs(after), managerName, `${registry}/api@${oldDigest}`)).toThrow(
      'HOOK',
    );
    after.at(-1).spec.template.spec.automountServiceAccountToken = true;
    expect(() => assertOnlyManagerChanges(before, docs(after), managerName, `${registry}/api@${apiDigest}`)).toThrow(
      'HOOK',
    );
  });

  it('passes the new API digest only to the hook, and waits for verified manager pods', () => {
    const { calls, error } = execute();
    expect(error).toBeUndefined();

    const upgrade = calls.find(
      (call) => call[0] === 'helm' && call[1] === 'upgrade' && !call.includes('--dry-run=server'),
    );
    expect(upgrade).toContain(`migrations.imageDigest=${apiDigest}`);
    expect(upgrade).toContain('migrations.enabled=true');
    expect(upgrade).toContain(`services.workspaceManager.imageDigest=${managerDigest}`);
    expect(upgrade.join(' ')).not.toContain('services.api.image');
    expect(upgrade).not.toContain('--no-hooks');
    expect(calls.find((call) => call.includes('rollout'))).toContain('--timeout=22m');
    expect(calls.findIndex((call) => call.includes('rollout'))).toBeGreaterThan(calls.indexOf(upgrade));
  });

  it('stops on migration/rollout failure and never reports manager readiness', () => {
    for (const failure of ['migration', 'rollout']) {
      const { calls, error } = execute({ failure });
      expect(error).toBeDefined();
      expect(calls.some((call) => call.includes('pods'))).toBe(false);
    }

    const changed = structuredClone(prepared);
    changed[2].spec.replicas = 2;

    const result = execute({ after: changed });
    expect(result.error).toBeDefined();
    expect(result.calls.some((call) => call.includes('upgrade') && !call.includes('--dry-run=server'))).toBe(false);
  });

  it('rejects old, unready, absent or mismatched manager imageIDs', () => {
    for (const imageID of [
      managerDigest,
      `containerd://${managerDigest}`,
      `docker-pullable://${registry}/workspace-manager@${managerDigest}`,
    ]) {
      const pod = structuredClone(readyPod);
      pod.status.containerStatuses[0].imageID = imageID;
      expect(execute({ pod }).error).toBeUndefined();
    }
    expect(() =>
      assertManagerReady(
        prepared[1],
        { items: [readyPod] },
        `${registry}/workspace-manager@${managerDigest}`,
        managerDigest,
      ),
    ).not.toThrow();

    for (const patch of [{ ready: false }, { imageID: `containerd://wrong@${oldDigest}` }]) {
      const pod = structuredClone(readyPod);
      Object.assign(pod.status.containerStatuses[0], patch);
      expect(execute({ pod }).error).toBeDefined();
    }
    expect(() =>
      assertManagerReady(prepared[1], { items: [] }, `${registry}/workspace-manager@${managerDigest}`, managerDigest),
    ).toThrow();

    for (const observedGeneration of [undefined, null, '2', 1, NaN]) {
      const deployment = structuredClone(prepared[1]);
      deployment.status.observedGeneration = observedGeneration;
      expect(() =>
        assertManagerReady(
          deployment,
          { items: [readyPod] },
          `${registry}/workspace-manager@${managerDigest}`,
          managerDigest,
        ),
      ).toThrow();
    }
  });

  it('requires a completed retained migration Job with the new API image and UID', () => {
    const verify = (job) =>
      assertMigrationComplete(job, 'test-vibecore-platform-prisma-migrate', `${registry}/api@${apiDigest}`);
    expect(verify(completedMigration)).toMatchObject({
      uid: 'synthetic-migration-uid',
      complete: true,
      succeeded: 1,
    });
    expect(() => verify(undefined)).toThrow();

    for (const patch of [{ succeeded: 0 }, { conditions: [{ type: 'Failed', status: 'True' }] }, { conditions: [] }]) {
      const job = structuredClone(completedMigration);
      Object.assign(job.status, patch);
      expect(() => verify(job)).toThrow();
    }

    const wrong = structuredClone(completedMigration);
    wrong.spec.template.spec.containers[0].image = `${registry}/api@${oldDigest}`;
    expect(() => verify(wrong)).toThrow();

    const result = execute({ migration: wrong });
    expect(result.error).toBeDefined();
    expect(result.calls.some((call) => call.includes('rollout') || call.includes('pods'))).toBe(false);
  });

  it('wires both stages after security gates and rolls any staged failure back to the original revision', () => {
    const workflow = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));

    const steps = workflow.jobs['build-and-deploy'].steps;

    const stage = steps.findIndex((step) => step.name === 'Migrate and prepare manager before API');
    const final = steps.findIndex((step) => step.name === 'Helm upgrade (all services pinned by digest)');
    expect(stage).toBeLessThan(final);
    expect(steps.findIndex((step) => step.id === 'prevrev')).toBeLessThan(stage);

    for (const prefix of ['Vulnerability gate', 'Re-verify required']) {
      const index = steps.findIndex((step) => step.name?.startsWith(prefix));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(stage);
    }
    expect(steps[stage].env.INITIAL_REVISION).toBe('${{ steps.prevrev.outputs.revision }}');
    expect(steps[stage].run).toBe('node infra/helm/stage-manager-before-api.bundle.mjs');
    expect(steps[stage]['timeout-minutes']).toBe(55);
    expect(workflow.jobs['build-and-deploy']['timeout-minutes']).toBeGreaterThanOrEqual(130 + 55);
    expect(steps[final].run).toContain('migrations.imageDigest=');

    const rollback = steps.find((step) => step.name?.startsWith('Roll back to the previous revision'));
    expect(rollback.if).toContain("env.STAGED_UPGRADE_STARTED == '1'");
    expect(rollback.env.PREV_REVISION).toBe('${{ steps.prevrev.outputs.revision }}');
    expect(rollback.run).toContain('helm rollback "${HELM_RELEASE}" "${PREV_REVISION}"');
  });

  it('executes the delivered bundle in a directory with no node_modules', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hermetic-stage-'));

    try {
      writeFileSync(join(directory, 'stage.mjs'), readFileSync('infra/helm/stage-manager-before-api.bundle.mjs'));
      writeFileSync(
        join(directory, 'fixtures.json'),
        JSON.stringify({
          manifest,
          old,
          prepared,
          readyPod,
          completedMigration,
          beforeYaml: docs(old),
          hooksYaml: docs(hooks(`${registry}/api@${oldDigest}`)),
          afterYaml: docs([...prepared, ...hooks(`${registry}/api@${apiDigest}`)]),
          sha,
          registry,
        }),
      );
      writeFileSync(
        join(directory, 'check.mjs'),
        `
        import assert from 'node:assert/strict';
        import { readFileSync, writeFileSync } from 'node:fs';
        import { runStage } from './stage.mjs';
        const f = JSON.parse(readFileSync('fixtures.json', 'utf8'));
        writeFileSync('env', '');
        let upgraded = false;
        const result = runStage({ manifest: f.manifest,
          env: { TARGET_SHA: f.sha, INITIAL_REVISION: '42', REG: f.registry,
            HELM_RELEASE: 'test', HELM_NAMESPACE: 'test', GITHUB_ENV: 'env' },
          command: (bin, args) => {
            if (bin === 'helm' && args[0] === 'get') return args[1] === 'values' ? '{}' : args[1] === 'hooks' ? f.hooksYaml : f.beforeYaml;
            if (bin === 'helm' && args[0] === 'upgrade' && args.includes('--dry-run=server')) return JSON.stringify({manifest:f.afterYaml,hooks:[]});
            if (bin === 'helm' && args[0] === 'upgrade') { upgraded = true; return ''; }
            if (args.includes('rollout')) return '';
            if (args.includes('pods')) return JSON.stringify({ items: [f.readyPod] });
            if (args[3] === 'job') return JSON.stringify(f.completedMigration);
            return JSON.stringify((upgraded ? f.prepared : f.old).find(item => item.metadata.name === args[4]));
          } });
        assert.equal(result.initialRevision, '42');
        assert.deepEqual(result.managerReadiness, {desired:1, active:1, terminalExcluded:0, observations:1});
        assert.equal(result.migrationJob.uid, 'synthetic-migration-uid');
        assert.match(readFileSync('env', 'utf8'), /STAGED_UPGRADE_STARTED=1/);
      `,
      );
      execFileSync(process.execPath, ['check.mjs'], {
        cwd: directory,
        env: { PATH: process.env.PATH },
        stdio: 'pipe',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('manager pod lifecycle attestation', () => {
  const image = `${registry}/workspace-manager@${managerDigest}`;
  const verify = (items, deployment = prepared[1]) => assertManagerReady(deployment, { items }, image, managerDigest);

  const terminal = (phase) => {
    const pod = structuredClone(readyPod);
    pod.status.phase = phase;
    pod.status.conditions = [{ type: 'Ready', status: 'False' }];
    pod.spec = { containers: [{ name: 'app', image: `${registry}/workspace-manager@${oldDigest}` }] };
    pod.status.containerStatuses[0] = {
      name: 'app',
      ready: false,
      imageID: oldDigest,
      state: { terminated: { exitCode: phase === 'Succeeded' ? 0 : 1 } },
    };

    return pod;
  };

  it.each(['Failed', 'Succeeded'])('excludes retained %s pods only when consistently terminated', (phase) => {
    expect(() => verify([readyPod, terminal(phase)])).not.toThrow();
    expect(execute({ pods: [readyPod, terminal(phase)] }).error).toBeUndefined();
  });

  it.each(['Failed', 'Succeeded'])('accepts stopped %s pods without optional Ready condition', (phase) => {
    for (const conditions of [undefined, [], [{ type: 'PodScheduled', status: 'True' }]]) {
      const pod = terminal(phase);
      pod.status.conditions = conditions;
      expect(() => verify([readyPod, pod])).not.toThrow();
    }
  });

  it('explains missing terminal evidence without exposing arbitrary values', () => {
    const pod = terminal('Failed');
    pod.status.conditions = [{ type: 'Ready', status: 'PRIVATE_SENTINEL' }];
    delete pod.status.containerStatuses;
    pod.status.initContainerStatuses = [{ state: { running: { message: 'PRIVATE_SENTINEL' } } }];

    let error;

    try {
      verify([readyPod, pod]);
    } catch (e) {
      error = e;
    }

    const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('{')));
    expect(diagnostic.pods[1].terminalEvidence).toEqual({
      phaseTerminal: true,
      readyCondition: 'Other',
      regular: 'Missing',
      init: 'NotTerminated',
      ephemeral: 'Absent',
    });
    expect(error.message).not.toContain('PRIVATE_SENTINEL');
  });

  it('does not ignore a deleting pod that can still serve or count it as the desired replica', () => {
    const deleting = structuredClone(readyPod);
    deleting.metadata.deletionTimestamp = '2026-11-01T00:00:00Z';
    deleting.spec = { containers: [{ name: 'app', image: `${registry}/workspace-manager@${oldDigest}` }] };
    expect(() => verify([readyPod, deleting])).toThrow('MANAGER_POD_COUNT');
    deleting.spec = structuredClone(readyPod.spec);
    expect(() => verify([deleting])).toThrow('MANAGER_POD_UNVERIFIED');
  });

  it.each(['Pending', 'Unknown', undefined])('refuses unverified phase %s even with stale Ready status', (phase) => {
    const pod = structuredClone(readyPod);
    pod.status.phase = phase;
    expect(() => verify([pod])).toThrow('MANAGER_POD_UNVERIFIED');
  });

  it('does not exclude inconsistent or incomplete terminal reports', () => {
    for (const mutate of [
      (p) => {
        p.status.conditions[0].status = 'True';
      },
      (p) => {
        p.status.containerStatuses[0].ready = true;
      },
      (p) => {
        p.status.containerStatuses[0].state = { running: {} };
      },
      (p) => {
        p.status.containerStatuses[0].state = { waiting: {} };
      },
      (p) => {
        delete p.status.containerStatuses;
      },
      (p) => {
        p.status.initContainerStatuses = [{ ready: false, state: { running: {} } }];
      },
    ]) {
      const pod = terminal('Failed');
      mutate(pod);
      expect(() => verify([readyPod, pod])).toThrow('MANAGER_POD_COUNT');
    }
  });

  it.each(['containerStatuses', 'initContainerStatuses', 'ephemeralContainerStatuses'])(
    'keeps active %s blocking even without Ready and during deletion',
    (field) => {
      for (const state of [{ running: {} }, { waiting: {} }, {}]) {
        const pod = terminal('Failed');
        delete pod.status.conditions;
        pod.metadata.deletionTimestamp = '2026-11-04T16:00:00Z';
        pod.status[field] = [{ ready: false, state }];
        expect(() => verify([readyPod, pod])).toThrow('MANAGER_POD_COUNT');
      }
    },
  );

  it.each([null, {}, [{ type: 'Ready', status: 'Unknown' }]])(
    'refuses invalid or unknown Ready evidence %j',
    (conditions) => {
      const pod = terminal('Failed');
      pod.status.conditions = conditions;
      expect(() => verify([readyPod, pod])).toThrow('MANAGER_POD_COUNT');
    },
  );

  it('retains live replica counts for HPA and refuses absent or extra nonterminal pods', () => {
    const deployment = structuredClone(prepared[1]);
    deployment.spec.replicas = 3;
    Object.assign(deployment.status, { updatedReplicas: 3, readyReplicas: 3, availableReplicas: 3 });
    expect(() => verify([readyPod, readyPod, readyPod], deployment)).not.toThrow();
    expect(() => verify([readyPod, readyPod], deployment)).toThrow('MANAGER_POD_COUNT');
    expect(() => verify([readyPod, readyPod, readyPod, readyPod], deployment)).toThrow('MANAGER_POD_COUNT');
    expect(() => verify([], deployment)).toThrow('MANAGER_POD_COUNT');
  });

  it('does not hide foreign nonterminal pods or an old digest', () => {
    const foreign = structuredClone(readyPod);
    foreign.metadata.ownerReferences = [
      { kind: 'ReplicaSet', name: 'foreign', uid: '00000000-0000-0000-0000-000000000001', controller: true },
    ];
    foreign.status.containerStatuses[0].imageID = oldDigest;
    expect(() => verify([readyPod, foreign])).toThrow('MANAGER_POD_COUNT');
    expect(() => verify([foreign])).toThrow('MANAGER_POD_UNVERIFIED');
  });

  it('emits bounded identities, counts and booleans without raw pod contents', () => {
    const secret = 'PRIVATE_SENTINEL_DO_NOT_PRINT';
    const pod = terminal('Failed');
    pod.metadata = {
      name: 'manager-old',
      uid: '00000000-0000-0000-0000-000000000001',
      annotations: { secret },
      labels: { secret },
      ownerReferences: [
        {
          kind: 'ReplicaSet',
          name: 'manager-rs',
          uid: '00000000-0000-0000-0000-000000000002',
          controller: true,
          secret,
        },
      ],
    };
    pod.status.containerStatuses[0].state.running = { message: secret };
    pod.spec.containers[0].env = [{ name: 'TOKEN', value: secret }];

    let error;

    try {
      verify([readyPod, ...Array.from({ length: 20 }, () => pod)]);
    } catch (e) {
      error = e;
    }

    const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('{')));
    expect(diagnostic.expected).toBe(1);
    expect(diagnostic.observed).toBe(21);
    expect(diagnostic.pods).toHaveLength(16);
    expect(diagnostic.truncated).toBe(true);
    expect(error.message).toContain('manager-old');
    expect(error.message).toContain('00000000-0000-0000-0000-000000000002');
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain(oldDigest);
    expect(error.message.length).toBeLessThan(14000);
  });

  it('keeps the 22 minute rollout timeout and never retries timeout or access failures', () => {
    for (const failure of ['rollout', 'pods-access']) {
      const result = execute({ failure });
      expect(result.error).toBeDefined();

      const rollout = result.calls.filter((c) => c.includes('rollout'));
      expect(rollout).toHaveLength(1);
      expect(rollout[0]).toContain('--timeout=22m');
      expect(result.calls.filter((c) => c.includes('pods'))).toHaveLength(failure === 'pods-access' ? 1 : 0);
      expect(
        result.calls.filter((c) => c[0] === 'helm' && c.includes('upgrade') && !c.includes('--dry-run=server')),
      ).toHaveLength(1);
    }
  });
});

describe('manager readiness convergence deadline', () => {
  const image = `${registry}/workspace-manager@${managerDigest}`;
  const limit = 22 * 60 * 1000;

  function observe({ snapshots, rolloutTime = 0, errorAt, brokenJson = false }) {
    let time = 0;
    let observation = 0;

    const calls = [];
    const pauses = [];
    const budgets = [];

    let error;
    let receipt;

    const command = (bin, args, options) => {
      budgets.push(options?.timeout);
      calls.push([bin, ...args]);

      if (args.includes('rollout')) {
        if (errorAt === 'rollout') {
          throw new Error('rollout timeout');
        }

        time += rolloutTime;

        return '';
      }

      if (errorAt && args.includes(errorAt)) {
        throw new Error('Forbidden PRIVATE_COMMAND_DETAIL');
      }

      if (brokenJson) {
        return '{';
      }

      const current = snapshots[Math.min(observation, snapshots.length - 1)];

      if (args.includes('deployment')) {
        return JSON.stringify(current.deployment ?? prepared[1]);
      }

      observation++;

      return JSON.stringify({ items: current.pods });
    };

    try {
      receipt = waitForManagerReady({
        command,
        namespace: 'test',
        release: 'test',
        managerName,
        image,
        digest: managerDigest,
        now: () => time,
        pause: (milliseconds) => {
          pauses.push(milliseconds);
          time += milliseconds;
        },
      });
    } catch (caught) {
      error = caught;
    }

    return { error, time, calls, pauses, observation, receipt, budgets };
  }
  it('observes a draining old pod until it is gone without repeating upgrade or rollout', () => {
    const old = structuredClone(readyPod);
    old.metadata.deletionTimestamp = '2026-11-01T00:00:00Z';
    old.status.containerStatuses[0].imageID = oldDigest;

    const result = observe({
      snapshots: [{ pods: [readyPod, old] }, { pods: [readyPod] }],
      rolloutTime: limit - 2000,
    });
    expect(result.error).toBeUndefined();
    expect(result.time).toBe(limit - 1000);
    expect(result.observation).toBe(2);
    expect(result.receipt).toEqual({ desired: 1, active: 1, terminalExcluded: 0, observations: 2 });
    expect(result.pauses).toEqual([1000]);
    expect(result.budgets).toEqual([limit, 2000, 2000, 1000, 1000]);
    expect(result.calls.filter((c) => c.includes('rollout'))).toHaveLength(1);
    expect(result.calls.every((c) => c[0] === 'kubectl')).toBe(true);
    expect(
      result.calls.filter((c) => c.includes('get')).every((c) => c.some((a) => a.startsWith('--request-timeout='))),
    ).toBe(true);
  });
  it('uses the next live HPA desired count rather than a captured replica value', () => {
    const scaled = structuredClone(prepared[1]);
    scaled.spec.replicas = 2;
    Object.assign(scaled.status, { updatedReplicas: 2, readyReplicas: 2, availableReplicas: 2 });

    const result = observe({ snapshots: [{ deployment: scaled, pods: [readyPod] }, { pods: [readyPod] }] });
    expect(result.error).toBeUndefined();
    expect(result.observation).toBe(2);
  });
  it('fails at the original deadline including time already spent in rollout', () => {
    const result = observe({ snapshots: [{ pods: [] }], rolloutTime: limit - 2000 });
    expect(result.error.message).toContain('MANAGER_READINESS_TIMEOUT');
    expect(result.error.message).toContain('"observed":0');
    expect(result.time).toBe(limit);
    expect(result.pauses).toEqual([1000, 1000]);
    expect(result.observation).toBe(2);

    const exhausted = observe({ snapshots: [{ pods: [readyPod] }], rolloutTime: limit });
    expect(exhausted.error.message).toContain('MANAGER_READINESS_TIMEOUT');
    expect(exhausted.observation).toBe(0);
  });
  it.each(['deployment', 'pods', 'rollout'])('never retries a %s command error', (errorAt) => {
    const result = observe({ snapshots: [{ pods: [readyPod] }], errorAt });
    expect(result.error).toBeDefined();
    expect(result.pauses).toEqual([]);
    expect(result.calls.filter((c) => c.includes(errorAt))).toHaveLength(1);
  });
  it('does not retry malformed JSON', () => {
    const result = observe({ snapshots: [{ pods: [readyPod] }], brokenJson: true });
    expect(result.error.message).toBe(
      'STAGED_MANAGER_JSON_INVALID ' +
        JSON.stringify({ operation: 'observe-manager-deployment', phase: 'manager-readiness' }),
    );
    expect(result.pauses).toEqual([]);
    expect(result.calls).toHaveLength(2);
  });
});

describe('safe command failure diagnostics', () => {
  const cases = [
    [
      'read-release-manifest',
      'preflight',
      (bin, args) => bin === 'helm' && args[0] === 'get' && args[1] === 'manifest',
    ],
    ['read-release-hooks', 'preflight', (bin, args) => bin === 'helm' && args[0] === 'get' && args[1] === 'hooks'],
    ['preview-upgrade', 'preflight', (bin, args) => bin === 'helm' && args.includes('--dry-run=server')],
    [
      'read-retained-deployment',
      'preflight',
      (bin, args, upgraded) => bin === 'kubectl' && args.includes('deployment') && !upgraded,
    ],
    [
      'upgrade-manager',
      'upgrade-requested',
      (bin, args) => bin === 'helm' && args[0] === 'upgrade' && !args.includes('--dry-run=server'),
    ],
    ['read-migration-job', 'upgrade-returned', (bin, args) => bin === 'kubectl' && args.includes('job')],
    ['rollout-manager', 'migration-job-verified', (bin, args) => bin === 'kubectl' && args.includes('rollout')],
    [
      'observe-manager-deployment',
      'manager-readiness',
      (bin, args, upgraded) => bin === 'kubectl' && args.includes('deployment') && upgraded,
    ],
    ['observe-manager-pods', 'manager-readiness', (bin, args) => bin === 'kubectl' && args.includes('pods')],
  ];
  const privateError = (patch = {}) =>
    Object.assign(new Error('Forbidden PRIVATE_MESSAGE_TOKEN'), {
      status: 1,
      signal: null,
      code: undefined,
      stdout: 'PRIVATE_STDOUT_HELM_VALUES',
      stderr: 'PRIVATE_STDERR_TOKEN',
      args: ['PRIVATE_ARGUMENT_TOKEN'],
      cmd: 'PRIVATE_COMMAND_TOKEN',
      env: { TOKEN: 'PRIVATE_ENV_TOKEN' },
      ...patch,
    });
  it.each(cases)('identifies %s without command contents or a retry', (operation, phase, failCommandAt) => {
    const result = execute({ failCommandAt, commandError: privateError() });
    expect(result.error.message).toMatch(/^STAGED_MANAGER_COMMAND_FAILED /);

    const diagnostic = JSON.parse(result.error.message.slice(result.error.message.indexOf('{')));
    expect(diagnostic).toEqual({
      operation,
      phase,
      status: 1,
      signal: null,
      code: null,
      lastObservation: null,
    });
    expect(result.error.message).not.toMatch(/PRIVATE_|Forbidden|helm get|kubectl/);

    expect(result.failedCommands).toBe(1);
  });
  it.each([
    [
      { status: null, signal: 'SIGTERM', code: 'ETIMEDOUT' },
      { status: null, signal: 'SIGTERM', code: 'ETIMEDOUT' },
    ],
    [
      { status: 127, signal: null, code: 'ENOENT' },
      { status: 127, signal: null, code: 'ENOENT' },
    ],
    [
      { status: 1, signal: 'SIGKILL', code: 'EACCES' },
      { status: 1, signal: 'SIGKILL', code: 'EACCES' },
    ],
    [
      { status: '403', signal: 'PRIVATE_SIGNAL', code: 'PRIVATE_CODE' },
      { status: null, signal: null, code: null },
    ],
    [
      { status: -1, signal: { secret: 'PRIVATE_SIGNAL' }, code: 403 },
      { status: null, signal: null, code: null },
    ],
    [
      { status: 999999, signal: null, code: 'Forbidden' },
      { status: null, signal: null, code: null },
    ],
  ])('whitelists only factual process fields %#', (patch, expected) => {
    const result = execute({ failCommandAt: cases[0][2], commandError: privateError(patch) });
    const diagnostic = JSON.parse(result.error.message.slice(result.error.message.indexOf('{')));
    expect(diagnostic).toMatchObject(expected);
    expect(result.error.message).not.toMatch(/PRIVATE_|Forbidden|stdout|stderr|args|env|duration|cause/);
  });
  it('preserves the last safe readiness observation when the next read command fails', () => {
    let time = 0;
    let reads = 0;

    const failed = structuredClone(readyPod);
    failed.status.conditions = [{ type: 'Ready', status: 'False', message: 'PRIVATE_CONDITION' }];
    failed.metadata.annotations = { secret: 'PRIVATE_ANNOTATION' };

    const command = (bin, args) => {
      if (args.includes('rollout')) {
        return '';
      }

      if (args.includes('deployment')) {
        return JSON.stringify(prepared[1]);
      }

      if (++reads === 2) {
        throw privateError({ code: 'ETIMEDOUT', signal: 'SIGTERM', status: null });
      }

      return JSON.stringify({ items: [failed] });
    };

    let error;

    try {
      waitForManagerReady({
        command,
        namespace: 'test',
        release: 'test',
        managerName,
        image: `${registry}/workspace-manager@${managerDigest}`,
        digest: managerDigest,
        now: () => time,
        pause: (ms) => {
          time += ms;
        },
      });
    } catch (e) {
      error = e;
    }

    const diagnostic = JSON.parse(error.message.slice(error.message.indexOf('{')));
    expect(diagnostic.operation).toBe('observe-manager-pods');
    expect(diagnostic.lastObservation.ready).toBe(0);
    expect(diagnostic.lastObservation.observed).toBe(1);
    expect(diagnostic.lastObservation.pods[0].ready).toBe(false);
    expect(error.message).not.toMatch(/PRIVATE_|Forbidden/);
    expect(reads).toBe(2);
    expect(time).toBe(1000);
  });
});

it('prints only safe command metadata from the actual delivered CLI failure path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stage-command-cli-'));

  try {
    writeFileSync(join(directory, 'stage.mjs'), readFileSync('infra/helm/stage-manager-before-api.bundle.mjs'));
    writeFileSync(join(directory, 'release-manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(directory, 'env'), '');
    writeFileSync(
      join(directory, 'helm'),
      '#!/bin/sh\necho PRIVATE_STDOUT_CANARY\necho PRIVATE_STDERR_CANARY >&2\nexit 7\n',
      { mode: 0o700 },
    );

    const result = spawnSync(process.execPath, ['stage.mjs'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        PATH: directory,
        TARGET_SHA: sha,
        INITIAL_REVISION: '42',
        REG: registry,
        HELM_RELEASE: 'test',
        HELM_NAMESPACE: 'test',
        GITHUB_ENV: join(directory, 'env'),
        TOKEN: 'PRIVATE_ENV_CANARY',
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe(
      'STAGED_MANAGER_COMMAND_FAILED ' +
        JSON.stringify({
          operation: 'read-release-manifest',
          phase: 'preflight',
          status: 7,
          signal: null,
          code: null,
          lastObservation: null,
        }),
    );
    expect(result.stderr).not.toMatch(/PRIVATE_|release-manifest\.json|registry\.example|--|helm get/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('safe JSON response diagnostics', () => {
  const cases = [
    [
      'read-retained-deployment',
      'preflight',
      (bin, args, upgraded) => bin === 'kubectl' && args.includes('deployment') && !upgraded,
    ],
    ['read-migration-job', 'upgrade-returned', (bin, args) => bin === 'kubectl' && args.includes('job')],
    [
      'observe-manager-deployment',
      'manager-readiness',
      (bin, args, upgraded) => bin === 'kubectl' && args.includes('deployment') && upgraded,
    ],
    ['observe-manager-pods', 'manager-readiness', (bin, args) => bin === 'kubectl' && args.includes('pods')],
  ];

  for (const invalidJson of ['PRIVATE_JSON_SENTINEL', '{"token":"PRIVATE_JSON_SENTINEL",']) {
    it.each(cases)(
      'identifies malformed JSON from %s without disclosure or retry',
      (operation, phase, invalidJsonAt) => {
        const result = execute({ invalidJsonAt, invalidJson });
        expect(result.error.message).toBe('STAGED_MANAGER_JSON_INVALID ' + JSON.stringify({ operation, phase }));
        expect(result.error.message).not.toMatch(/PRIVATE_|SyntaxError|Unexpected|token|stdout|stderr/);
        expect(result.calls.at(-1)).toEqual(expect.arrayContaining(['kubectl']));
        expect(result.invalidResponses).toBe(1);
      },
    );
  }
});

describe('persisted final manager readiness evidence', () => {
  const notReady = () => {
    const pod = structuredClone(readyPod);
    pod.status.conditions = [{ type: 'Ready', status: 'False', message: 'PRIVATE_MESSAGE' }];
    pod.metadata.labels = { secret: 'PRIVATE_LABEL' };
    pod.metadata.annotations = { token: 'PRIVATE_ANNOTATION', url: 'https://PRIVATE_URL' };
    pod.metadata.name = 'private-credential-canary';
    pod.metadata.uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    pod.metadata.ownerReferences = [{ kind: 'ReplicaSet', name: 'private-owner-canary', controller: true }];
    pod.spec.secret = 'PRIVATE_SPEC';

    return pod;
  };

  it.each([
    ['rollout-manager', (bin, args) => args.includes('rollout')],
    ['observe-manager-deployment', (bin, args, upgraded) => upgraded && args.includes('deployment')],
    ['observe-manager-pods', (bin, args) => args.includes('pods')],
  ])('persists the final %s failure without provider content or retries', (operation, failCommandAt) => {
    const commandError = Object.assign(new Error('STAGED_MANAGER_PRIVATE_MESSAGE'), {
      status: 7,
      signal: 'PRIVATE_SIGNAL',
      code: 'PRIVATE_CODE',
      stdout: 'PRIVATE_STDOUT',
      stderr: 'PRIVATE_STDERR',
    });

    const result = execute({ failCommandAt, commandError });
    expect(result.receipt.phase).toBe('manager-readiness-failed');
    expect(result.receipt.migrationJob).toBeDefined();
    expect(result.receipt.managerReadiness).toBeUndefined();
    expect(result.receipt.managerReadinessFailure).toEqual({
      reason: 'COMMAND_FAILED',
      diagnostic: {
        operation,
        phase: operation === 'rollout-manager' ? 'migration-job-verified' : 'manager-readiness',
        status: 7,
        signal: null,
        code: null,
        lastObservation: null,
      },
    });
    expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_');
    expect(result.failedCommands).toBe(1);
    expect(result.error.message).toMatch(/^STAGED_MANAGER_COMMAND_FAILED /);
  });

  it.each(['exit', 'timeout'])('captures a real child-process %s without its output', (mode) => {
    let commandError;

    try {
      execFileSync(
        process.execPath,
        [
          '-e',
          mode === 'exit'
            ? "process.stderr.write('Authorization: Bearer PRIVATE_TOKEN\\nhttps://user:PRIVATE_PASSWORD@example.invalid/?token=PRIVATE_TOKEN\\nAPI_KEY=PRIVATE_KEY'); process.exit(7)"
            : 'setInterval(() => {}, 1000)',
        ],
        { timeout: mode === 'exit' ? 5000 : 50, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      commandError = error;
    }

    expect(commandError).toBeDefined();

    const result = execute({ failCommandAt: (bin, args) => args.includes('rollout'), commandError });
    const failure = result.receipt.managerReadinessFailure;
    expect(failure.reason).toBe('COMMAND_FAILED');
    expect(failure.diagnostic.status).toBe(mode === 'exit' ? 7 : null);
    expect(failure.diagnostic.code).toBe(mode === 'exit' ? null : 'ETIMEDOUT');
    expect(JSON.stringify(failure)).not.toMatch(/PRIVATE_|Authorization|Bearer|https:|API_KEY|stderr|stdout/);
    expect(result.failedCommands).toBe(1);
  });

  it('persists the final timeout with the last bounded readiness observation', () => {
    const result = execute({ pod: notReady() });
    expect(result.error.message).toMatch(/^STAGED_MANAGER_MANAGER_READINESS_TIMEOUT /);

    const failure = result.receipt.managerReadinessFailure;
    expect(failure.reason).toBe('MANAGER_READINESS_TIMEOUT');
    expect(failure.diagnostic.lastObservation.ready).toBe(0);
    expect(failure.diagnostic.lastObservation.pods).toHaveLength(1);
    expect(JSON.stringify(failure)).not.toMatch(/PRIVATE_|private-|labels|spec|message|aaaaaaaa|owners|name|uid/);
    expect(JSON.stringify(failure).length).toBeLessThan(2000);
    expect(result.calls.filter((args) => args.includes('rollout'))).toHaveLength(1);
  });

  it('bounds persisted observations even with many private pod identities', () => {
    const result = execute({ pods: Array.from({ length: 20 }, notReady) });
    const observation = result.receipt.managerReadinessFailure.diagnostic.lastObservation;
    expect(observation.truncated).toBe(true);
    expect(observation.pods).toHaveLength(16);
    expect(JSON.stringify(observation).length).toBeLessThan(3000);
    expect(JSON.stringify(observation)).not.toMatch(
      /PRIVATE_|private-|aaaaaaaa|owners|name|uid|labels|annotations|https:/,
    );
  });

  it('rejects arbitrary process fields in persisted evidence', () => {
    const commandError = Object.assign(new Error('PRIVATE_MESSAGE'), {
      status: 'PRIVATE_STATUS',
      signal: 'Authorization: Bearer PRIVATE_TOKEN',
      code: 'https://user:PRIVATE_PASSWORD@example.invalid/?token=PRIVATE_TOKEN',
      env: { API_KEY: 'PRIVATE_KEY' },
      stdout: 'PRIVATE_STDOUT',
      stderr: 'PRIVATE_STDERR',
    });

    const result = execute({ failCommandAt: (bin, args) => args.includes('rollout'), commandError });
    expect(result.receipt.managerReadinessFailure.diagnostic).toMatchObject({ status: null, signal: null, code: null });
    expect(JSON.stringify(result.receipt.managerReadinessFailure)).not.toMatch(
      /PRIVATE_|Authorization|https:|API_KEY|env|stdout|stderr/,
    );
  });

  it('persists invalid JSON without copying the response', () => {
    const result = execute({
      invalidJsonAt: (bin, args) => args.includes('pods'),
      invalidJson: 'PRIVATE_JSON',
    });
    expect(result.receipt.managerReadinessFailure).toEqual({
      reason: 'JSON_INVALID',
      diagnostic: { operation: 'observe-manager-pods', phase: 'manager-readiness' },
    });
    expect(result.invalidResponses).toBe(1);
  });

  it('persists a non-retryable readiness rejection', () => {
    const result = execute({ invalidJsonAt: (bin, args) => args.includes('pods'), invalidJson: '{}' });
    expect(result.receipt.managerReadinessFailure.reason).toBe('MANAGER_PODS_INVALID');
    expect(result.error.message).toMatch(/^STAGED_MANAGER_MANAGER_PODS_INVALID /);
    expect(result.invalidResponses).toBe(1);
  });

  it.each([
    new Error('STAGED_MANAGER_COMMAND_FAILED {"reason":"PRIVATE_FORGED"}'),
    new Error(
      'Authorization: Bearer PRIVATE_TOKEN https://user:PRIVATE_PASSWORD@example.invalid/?token=PRIVATE_TOKEN API_KEY=PRIVATE_KEY',
    ),
    Object.assign(new Error('PRIVATE_MESSAGE'), {
      reason: 'COMMAND_FAILED',
      diagnostic: { secret: 'PRIVATE_TOKEN' },
    }),
    {
      get message() {
        throw new Error('PRIVATE_GETTER');
      },
    },
    'PRIVATE_STRING',
    null,
    17,
  ])('classifies unexpected thrown values without reading their text %#', (error) => {
    const result = execute({ pod: notReady(), pauseFailure: { error } });
    expect(result.error).toBe(error);
    expect(result.receipt.managerReadinessFailure).toEqual({ reason: 'UNEXPECTED_FAILURE' });
    expect(JSON.stringify(result.receipt)).not.toContain('PRIVATE_');
  });

  it('does not replace the original error when persisting the failure fails', () => {
    const error = new Error('PRIVATE_ORIGINAL');

    const result = execute({
      pod: notReady(),
      pauseFailure: { error },
      beforePause: (directory) => rmSync(directory, { recursive: true, force: true }),
    });
    expect(result.error).toBe(error);
    expect(result.receipt).toBeUndefined();
  });

  it('does not add failure evidence to successful receipts', () => {
    const result = execute();
    expect(result.error).toBeUndefined();
    expect(result.receipt.phase).toBe('manager-ready');
    expect(result.receipt.managerReadiness).toBeDefined();
    expect(result.receipt.managerReadinessFailure).toBeUndefined();
  });
});
