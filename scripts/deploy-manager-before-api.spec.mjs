import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

// Standalone deployment code has no browser ~/ alias.
// eslint-disable-next-line no-restricted-imports
import {
  assertManagerReady,
  assertMigrationComplete,
  assertOnlyManagerChanges,
  runStage,
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
    { service: 'api', image: 'api', sourceSha: sha, digest: apiDigest, rebuilt: true },
    { service: 'workspaceManager', image: 'workspace-manager', sourceSha: sha, digest: managerDigest, rebuilt: true },
  ],
};

function deployment(name, image) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name, generation: 2 },
    spec: { replicas: 1, template: { metadata: { annotations: {} }, spec: { containers: [{ name: 'app', image }] } } },
    status: { observedGeneration: 2, updatedReplicas: 1, readyReplicas: 1, availableReplicas: 1 },
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
      metadata: { name, annotations: { 'helm.sh/hook': 'pre-install,pre-upgrade', 'helm.sh/hook-weight': '-20' } },
    },
    {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name, annotations: { 'helm.sh/hook': 'pre-install,pre-upgrade', 'helm.sh/hook-weight': '-10' } },
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
    conditions: [{ type: 'Ready', status: 'True' }],
    containerStatuses: [{ ready: true, imageID: `containerd://${registry}/workspace-manager@${managerDigest}` }],
  },
};
const completedMigration = {
  ...hooks(`${registry}/api@${apiDigest}`)[1],
  metadata: { ...hooks(`${registry}/api@${apiDigest}`)[1].metadata, uid: 'synthetic-migration-uid' },
  status: { succeeded: 1, conditions: [{ type: 'Complete', status: 'True' }] },
};

function execute({ after = prepared, failure, pod = readyPod, migration = completedMigration } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'stage-test-'));
  const envFile = join(directory, 'env');
  writeFileSync(envFile, '');

  const calls = [];

  let upgraded = false;
  let error;

  try {
    runStage({
      manifest,
      env: {
        TARGET_SHA: sha,
        INITIAL_REVISION: '42',
        REG: registry,
        HELM_RELEASE: 'test',
        HELM_NAMESPACE: 'test',
        GITHUB_ENV: envFile,
      },
      command: (bin, args) => {
        calls.push([bin, ...args]);

        if (bin === 'helm' && args[0] === 'get') {
          return args[1] === 'values'
            ? '{}'
            : args[1] === 'hooks'
              ? docs(hooks(`${registry}/api@${oldDigest}`))
              : docs(old);
        }

        if (bin === 'helm' && args[0] === 'template') {
          return docs([...after, ...hooks(`${registry}/api@${apiDigest}`)]);
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
          return JSON.stringify({ items: [pod] });
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
    rmSync(directory, { recursive: true, force: true });
  }

  return { calls, error };
}

describe('migration, manager, API sequencing', () => {
  it('requires exact target provenance and an original rollback revision before mutation', () => {
    expect(stagePlan(manifest, sha, '42')).toMatchObject({ migrationDigest: apiDigest, managerDigest });

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
    changed[1].spec.template.spec.containers.push({ name: 'unapproved', image: 'unapproved' });
    expect(() => assertOnlyManagerChanges(docs(old), docs(changed), managerName)).toThrow('CONTAINER');
  });

  it('refuses ConfigMap, Service, RBAC, Secret, added and removed resources before mutation', () => {
    for (const kind of ['ConfigMap', 'Service', 'Role', 'Secret']) {
      const item = { apiVersion: 'v1', kind, metadata: { name: 'same' }, data: { value: 'old' } };
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

    const upgrade = calls.find((call) => call[0] === 'helm' && call[1] === 'upgrade');
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
    expect(result.calls.some((call) => call.includes('upgrade'))).toBe(false);
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
    expect(verify(completedMigration)).toMatchObject({ uid: 'synthetic-migration-uid', complete: true, succeeded: 1 });
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
            if (bin === 'helm' && args[0] === 'template') return f.afterYaml;
            if (bin === 'helm' && args[0] === 'upgrade') { upgraded = true; return ''; }
            if (args.includes('rollout')) return '';
            if (args.includes('pods')) return JSON.stringify({ items: [f.readyPod] });
            if (args[3] === 'job') return JSON.stringify(f.completedMigration);
            return JSON.stringify((upgraded ? f.prepared : f.old).find(item => item.metadata.name === args[4]));
          } });
        assert.equal(result.initialRevision, '42');
        assert.match(readFileSync('env', 'utf8'), /STAGED_UPGRADE_STARTED=1/);
      `,
      );
      execFileSync(process.execPath, ['check.mjs'], { cwd: directory, env: { PATH: process.env.PATH }, stdio: 'pipe' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
