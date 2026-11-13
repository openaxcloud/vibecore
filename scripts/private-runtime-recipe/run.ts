import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { assertRecipeClusterName, assertRecipeKubeconfig, assertRecipeEvent } from './checks.js';
import { podEvidence, type EvidencePod } from './evidence.js';
import { dependencyImages, recipeManifests } from './manifests.js';

// No target/namespace/credential inputs. Refuse reusable/self-hosted executors.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assertRecipeEvent(process.env.GITHUB_EVENT_NAME, process.env.GITHUB_REF);
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.RUNNER_OS, 'Linux');
assert.ok(process.env.RUNNER_TEMP);

const temp = resolve(process.env.RUNNER_TEMP);
const statePath = join(temp, 'vibecore-private-runtime-state.json');
const evidence = resolve('private-runtime-evidence');
mkdirSync(evidence, { recursive: true });
type State = { name: string; directory: string; kubeconfig: string };

let state: State;

const forwards: ChildProcess[] = [];

function childEnv(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    ...process.env,
    KUBECONFIG: state.kubeconfig,
    DOCKER_HOST: 'unix:///var/run/docker.sock',
  };

  for (const key of ['DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'KUBERNETES_MASTER']) {
    delete result[key];
  }

  return result;
}

async function run(
  command: string,
  args: string[],
  options: { input?: string; stream?: boolean; timeout?: number; progressFile?: string } = {},
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let outputBytes = 0;

    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    }, options.timeout ?? 120_000);
    child.stdout.on('data', (data: Buffer) => {
      if (options.progressFile) {
        appendFileSync(options.progressFile, data);
      }

      if (options.stream) {
        process.stdout.write(data);
      } else {
        outputBytes += data.length;

        if (outputBytes > 16 * 1024 * 1024) {
          child.kill('SIGTERM');
        } else {
          stdout += data.toString();
        }
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      if (options.stream) {
        process.stderr.write(data);
      }

      // Buffered commands may carry Secret manifests. Never print their stderr.
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);

      if (!timedOut && code === 0 && outputBytes <= 16 * 1024 * 1024) {
        resolvePromise(stdout);
      } else {
        reject(
          new Error(`${command} ${args.slice(0, 3).join(' ')} failed (exit ${code}); see recipe stage/status evidence`),
        );
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(options.input);
  });
}

const docker = (args: string[], stream = false) =>
  run('docker', ['--host=unix:///var/run/docker.sock', ...args], { stream, timeout: 1_800_000 });
const kubectl = (args: string[], input?: string) =>
  run('kubectl', ['--kubeconfig', state.kubeconfig, '--context', `kind-${state.name}`, ...args], {
    input,
    timeout: 660_000,
  });

async function assertLocalCluster() {
  assertRecipeClusterName(state.name);
  assert.equal(dirname(state.directory), temp);
  assert.ok(state.directory.startsWith(join(temp, 'vc-private-')));
  assert.equal(state.kubeconfig, join(state.directory, 'kubeconfig'));

  const config = await run('kubectl', ['--kubeconfig', state.kubeconfig, 'config', 'view', '--raw', '-o', 'json']);
  assertRecipeKubeconfig(JSON.parse(config), state.name);

  const label = await docker([
    'inspect',
    '--format',
    '{{ index .Config.Labels "io.x-k8s.kind.cluster" }}',
    `${state.name}-control-plane`,
  ]);
  assert.equal(label.trim(), state.name, 'Docker node is not owned by this recipe');
}

async function cleanup() {
  forwards.forEach((child) => child.kill());

  if (!existsSync(statePath)) {
    return;
  }

  state = JSON.parse(readFileSync(statePath, 'utf8')) as State;
  assertRecipeClusterName(state.name);
  assert.equal(dirname(state.directory), temp);
  assert.ok(state.directory.startsWith(join(temp, 'vc-private-')));
  assert.equal(state.kubeconfig, join(state.directory, 'kubeconfig'));

  const nodes = (
    await docker(['ps', '-a', '--filter', `label=io.x-k8s.kind.cluster=${state.name}`, '--format', '{{.Names}}'])
  ).trim();

  if (!nodes) {
    return;
  }

  assert.equal(nodes, `${state.name}-control-plane`, 'Refusing unexpected cluster members');

  // kind delete touches only this generated local Docker node, never a remote kube context.
  await run('kind', ['delete', 'cluster', '--name', state.name, '--kubeconfig', state.kubeconfig], { stream: true });
}

async function forward(service: string, port: number) {
  const child = spawn(
    'kubectl',
    [
      '--kubeconfig',
      state.kubeconfig,
      '--context',
      `kind-${state.name}`,
      '-n',
      state.name,
      'port-forward',
      '--address=127.0.0.1',
      `service/${service}`,
      `${port}:${port}`,
    ],
    { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  forwards.push(child);
  await new Promise<void>((resolveForward, reject) => {
    const timer = setTimeout(() => reject(new Error(`Port forward ${service} timed out`)), 30_000);
    child.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes(`127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolveForward();
      }
    });
    child.stderr?.on('data', () => undefined);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Port forward ${service} exited ${code}`));
    });
  });
}

async function main() {
  if (process.argv.includes('--cleanup')) {
    await cleanup();
    return;
  }

  const name = `vc-private-${randomBytes(8).toString('hex')}`;
  const directory = mkdtempSync(join(temp, 'vc-private-'));
  state = { name, directory, kubeconfig: join(directory, 'kubeconfig') };
  assert.ok(!existsSync(state.kubeconfig));
  assert.ok(!(await run('kind', ['get', 'clusters'])).split(/\s+/).includes(name));
  writeFileSync(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });

  let stage = 'create-local-cluster';

  try {
    await run(
      'kind',
      [
        'create',
        'cluster',
        '--name',
        name,
        '--image',
        'kindest/node:v1.34.0@sha256:7416a61b42b1662ca6ca89f02028ac133a309a2a30ba309614e8ec94d976dc5a',
        '--kubeconfig',
        state.kubeconfig,
        '--wait',
        '180s',
      ],
      { stream: true, timeout: 600_000 },
    );
    await assertLocalCluster();
    await kubectl(['get', 'storageclass', 'standard']);
    stage = 'build-local-images';
    await docker(
      [
        'build',
        '--target',
        'platform',
        '-f',
        'scripts/private-runtime-recipe/Dockerfile',
        '-t',
        `vc-private-platform:${name}`,
        '.',
      ],
      true,
    );
    await docker(
      [
        'build',
        '--target',
        'agent',
        '-f',
        'scripts/private-runtime-recipe/Dockerfile',
        '-t',
        `vc-private-agent:${name}`,
        '.',
      ],
      true,
    );

    for (const [service, image] of Object.entries(dependencyImages)) {
      await docker(['pull', image], true);
      // Docker save by digest may omit RepoTags. Give kind an explicit local name.
      await docker(['tag', image, `vc-private-${service}:${name}`]);
      const imageID = (await docker(['image', 'inspect', '--format', '{{.Id}}', image])).trim();
      console.log(
        JSON.stringify({
          dependency: service,
          pinnedSource: image,
          localImage: `vc-private-${service}:${name}`,
          imageID,
        }),
      );
    }
    await run(
      'kind',
      [
        'load',
        'docker-image',
        '--name',
        name,
        `vc-private-platform:${name}`,
        `vc-private-agent:${name}`,
        ...Object.keys(dependencyImages).map((service) => `vc-private-${service}:${name}`),
      ],
      { stream: true, timeout: 600_000 },
    );
    stage = 'start-local-dependencies';

    const resources = recipeManifests(
      name,
      ...(Array.from({ length: 4 }, () => randomBytes(32).toString('hex')) as [string, string, string, string]),
    );
    const late = resources.filter(
      (resource) =>
        ['api', 'manager', 'migrate'].includes(resource.metadata.name) && ['Deployment', 'Job'].includes(resource.kind),
    );

    const early = resources.filter((resource) => !late.includes(resource));
    await assertLocalCluster();
    await kubectl(['apply', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'List', items: early }));

    for (const service of ['postgres', 'redis']) {
      await kubectl(['-n', name, 'rollout', 'status', `deployment/${service}`, '--timeout=180s']);
    }
    stage = 'migrate-local-postgres';
    await kubectl(
      ['apply', '-f', '-'],
      JSON.stringify({ apiVersion: 'v1', kind: 'List', items: late.filter((resource) => resource.kind === 'Job') }),
    );
    await kubectl(['-n', name, 'wait', '--for=condition=complete', 'job/migrate', '--timeout=600s']);
    stage = 'start-real-api-and-manager';
    await kubectl(
      ['apply', '-f', '-'],
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'List',
        items: late.filter((resource) => resource.kind === 'Deployment'),
      }),
    );

    for (const service of ['api', 'manager']) {
      await kubectl(['-n', name, 'rollout', 'status', `deployment/${service}`, '--timeout=180s']);
    }
    await forward('api', 3001);
    await forward('manager', 3010);
    stage = 'real-api-manager-agent-validation';
    await assertLocalCluster();
    process.env.PRIVATE_RUNTIME_RECIPE_ID = name;
    process.env.RUNTIME_API_E2E_PRIVATE_RECIPE = '1';
    process.env.RUNTIME_API_E2E_NAMESPACE = name;
    process.env.RUNTIME_API_E2E_API_URL = 'http://127.0.0.1:3001';
    process.env.RUNTIME_API_E2E_RUNTIME_URL = 'http://127.0.0.1:3001/api/runtime';
    process.env.RUNTIME_API_E2E_WORKSPACE_MANAGER_URL = 'http://127.0.0.1:3010';

    const result = await run('node_modules/.bin/tsx', ['scripts/validate-runtime-api-kubernetes.ts'], {
      timeout: 900_000,
      progressFile: join(evidence, 'validation-progress.txt'),
    });
    writeFileSync(join(evidence, 'checks.txt'), result);
    writeFileSync(
      join(evidence, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          stage,
          cluster: name,
          commit: process.env.GITHUB_SHA,
          scope: 'functional-local-only',
          aiGeneration: 'not-tested',
          productionIsolation: 'not-tested',
          publication: 'not-tested',
        },
        null,
        2,
      ),
    );
    console.log(result);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, stage, cluster: name }));
    writeFileSync(
      join(evidence, 'result.json'),
      JSON.stringify(
        { ok: false, stage, cluster: name, error: error instanceof Error ? error.message : 'failed' },
        null,
        2,
      ),
    );

    throw error;
  } finally {
    try {
      await assertLocalCluster();

      const pods = JSON.parse(await kubectl(['get', 'pods', '-A', '-o', 'json'])) as { items: EvidencePod[] };
      const statuses = pods.items.map(podEvidence);
      writeFileSync(join(evidence, 'pod-status.json'), JSON.stringify(statuses, null, 2));
      console.log(JSON.stringify({ podStatuses: statuses }));
    } catch {
      // No trusted local cluster exists; never probe a fallback context.
    }
    await cleanup();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recipe failed');
  process.exitCode = 1;
});
