import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const helperPath = '.github/scripts/observe-manager-terminality.mjs';
const { projectList, projectPod } = await import(pathToFileURL(resolve(helperPath)).href);
const workflowPath = '.github/workflows/observe-manager-terminality.yml';
const specPath = 'scripts/release-gate/observe-manager-terminality.spec.mjs';
const workflow = parse(readFileSync(workflowPath, 'utf8'));
const job = workflow.jobs.observe;
const steps = job.steps;
const production = readFileSync('infra/helm/stage-manager-before-api.mjs', 'utf8');

const referenceSource = production.slice(
  production.indexOf('function terminalManagerPod('),
  production.indexOf('/** Only bounded structural identities'),
);

const terminalManagerPod = runInNewContext(`${referenceSource}; terminalManagerPod;`);

const context = {
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REPOSITORY: 'openaxcloud/vibecore',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: `openaxcloud/vibecore/${workflowPath}@refs/heads/main`,
  GITHUB_SHA: 'a'.repeat(40),
};

const stop = () => ({ ready: false, state: { terminated: { exitCode: 1 } } });

const pod = () => ({
  spec: { containers: [{}] },
  status: { phase: 'Failed', conditions: [{ type: 'Ready', status: 'False' }], containerStatuses: [stop()] },
});

const diagnosticError = 'TERMINAL_DIAGNOSTIC_UNAVAILABLE\n';

function cli(input, args = []) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    input,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
}

function assertRejected(input, args) {
  const result = cli(input, args);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(diagnosticError);
}

const negatives = [
  [
    'phase Running',
    (p) => {
      p.status.phase = 'Running';
    },
  ],
  [
    'conditions absent',
    (p) => {
      delete p.status.conditions;
    },
  ],
  [
    'conditions empty',
    (p) => {
      p.status.conditions = [];
    },
  ],
  [
    'Ready true',
    (p) => {
      p.status.conditions.push({ type: 'Ready', status: 'True' });
    },
  ],
  [
    'statuses absent',
    (p) => {
      delete p.status.containerStatuses;
    },
  ],
  [
    'statuses empty',
    (p) => {
      p.status.containerStatuses = [];
    },
  ],
  [
    'cardinality',
    (p) => {
      p.spec.containers.push({});
    },
  ],
  [
    'ready true',
    (p) => {
      p.status.containerStatuses[0].ready = true;
    },
  ],
  [
    'ready absent',
    (p) => {
      delete p.status.containerStatuses[0].ready;
    },
  ],
  [
    'termination absent',
    (p) => {
      delete p.status.containerStatuses[0].state.terminated;
    },
  ],
  [
    'termination string',
    (p) => {
      p.status.containerStatuses[0].state.terminated = 'CANARY';
    },
  ],
  [
    'exit absent',
    (p) => {
      delete p.status.containerStatuses[0].state.terminated.exitCode;
    },
  ],
  [
    'exit string',
    (p) => {
      p.status.containerStatuses[0].state.terminated.exitCode = '1';
    },
  ],
  [
    'fractional exit',
    (p) => {
      p.status.containerStatuses[0].state.terminated.exitCode = 1.5;
    },
  ],
  [
    'running',
    (p) => {
      p.status.containerStatuses[0].state.running = {};
    },
  ],
  [
    'waiting',
    (p) => {
      p.status.containerStatuses[0].state.waiting = {};
    },
  ],
  [
    'init null',
    (p) => {
      p.status.initContainerStatuses = null;
    },
  ],
  [
    'init running',
    (p) => {
      p.status.initContainerStatuses = [{ state: { running: {} } }];
    },
  ],
  [
    'ephemeral null',
    (p) => {
      p.status.ephemeralContainerStatuses = null;
    },
  ],
  [
    'ephemeral running',
    (p) => {
      p.status.ephemeralContainerStatuses = [{ state: { running: {} } }];
    },
  ],
];

describe('bounded diagnostic projection, not a new production predicate', () => {
  it('matches the actual production function, including all 512 combinations', () => {
    expect(referenceSource.startsWith('function terminalManagerPod(')).toBe(true);

    for (let bits = 0; bits < 512; bits++) {
      const p = pod();

      if (bits & 1) {
        p.status.phase = 'Running';
      }

      if (bits & 2) {
        p.status.conditions = undefined;
      } else {
        if (bits & 4) {
          p.status.conditions = [];
        }

        if (bits & 8) {
          p.status.conditions.push({ type: 'Ready', status: 'True' });
        }
      }

      if (bits & 16) {
        p.status.containerStatuses = undefined;
      } else if (bits & 32) {
        p.status.containerStatuses = [];
      } else {
        if (bits & 128) {
          p.status.containerStatuses[0].ready = true;
        }

        if (bits & 256) {
          p.status.containerStatuses[0].state = { waiting: {} };
        }
      }

      if (bits & 64) {
        p.spec.containers.push({});
      }

      expect(projectPod(p).terminal).toBe(Boolean(terminalManagerPod(p)));
    }
  });

  it.each(negatives)('preserves the negative %s', (_name, change) => {
    const p = pod();
    change(p);
    expect(Boolean(terminalManagerPod(p))).toBe(false);
    expect(projectPod(p).terminal).toBe(false);
    expect(Object.values(projectPod(p).required)).toContain(false);
  });

  it.each(['Failed', 'Succeeded'])('accepts %s only with every required condition', (phase) => {
    const p = pod();
    p.status.phase = phase;
    p.status.initContainerStatuses = [stop()];
    p.status.ephemeralContainerStatuses = [stop()];
    expect(projectPod(p).terminal).toBe(true);
    expect(Boolean(terminalManagerPod(p))).toBe(true);
  });

  it.each([undefined, null, {}, [], 'CANARY', false])(
    'handles incomplete conditions/statuses without disclosure: %j',
    (value) => {
      const p = pod();
      p.status.conditions = value;
      p.status.containerStatuses = value;
      expect(projectPod(p).terminal).toBe(Boolean(terminalManagerPod(p)));
      expect(JSON.stringify(projectPod(p))).not.toContain('CANARY');
    },
  );

  it.each([undefined, null, {}, false, 'CANARY', []])('retains exact terminated-state semantics for %j', (value) => {
    const p = pod();
    p.status.containerStatuses[0].state = value;
    expect(projectPod(p).terminal).toBe(Boolean(terminalManagerPod(p)));
  });

  it('never equates Failed with terminal, and counts omitted failures', () => {
    const items = Array.from({ length: 256 }, pod);

    for (const p of items) {
      p.status.containerStatuses[0].state = { waiting: {} };
    }

    const result = projectList({ items });
    expect(result.total).toBe(256);
    expect(result.failed).toBe(256);
    expect(result.terminal).toBe(0);
    expect(result.failedTerminal).toBe(0);
    expect(result.pods).toHaveLength(16);
    expect(result.omitted).toBe(240);
    expect(result.missingConditionsAmongFailed).toEqual({ mainAllNotReadyAndTerminated: 256 });
  });

  it('aggregates every missing subcondition, only among Failed pods', () => {
    const items = negatives.map(([, mutate]) => {
      const p = pod();
      mutate(p);

      return p;
    });

    const result = projectList({ items });
    const expected = {};

    for (const p of items.filter((p) => p.status.phase === 'Failed')) {
      for (const [key, ok] of Object.entries(projectPod(p).required)) {
        if (!ok) {
          expected[key] = (expected[key] ?? 0) + 1;
        }
      }
    }
    expect(result.missingConditionsAmongFailed).toEqual(expected);
  });

  it('reports an empty observation without inventing health', () => {
    expect(projectList({ items: [] })).toEqual({
      schemaVersion: 1,
      total: 0,
      failed: 0,
      terminal: 0,
      failedTerminal: 0,
      missingConditionsAmongFailed: {},
      omitted: 0,
      pods: [],
    });
  });

  it('emits only known phases, booleans and nonnegative bounded counts', () => {
    const p = pod();
    const canary = 'SECRET_IDENTITY_URL_HEADER_MESSAGE_ENV_IMAGE_OWNER_CANARY';
    p.metadata = {
      name: canary,
      uid: canary,
      ownerReferences: [{ name: canary }],
      labels: { canary },
      annotations: { canary },
    };
    p.spec.containers[0] = { name: canary, env: [{ name: canary, value: canary }], image: canary };
    p.status.message = canary;
    p.status.containerStatuses[0].imageID = canary;
    p.status.containerStatuses[0].state.terminated.message = canary;
    p.status.containerStatuses[0].state.terminated.exitCode = 987654321;

    const output = projectList({ items: [p] });
    expect(JSON.stringify(output)).not.toMatch(/CANARY|987654321|metadata|exitCode|imageID/);

    const inspect = (value) => {
      for (const child of Object.values(value)) {
        if (child !== null && typeof child === 'object') {
          inspect(child);
        } else if (typeof child === 'string') {
          expect(['Pending', 'Running', 'Failed', 'Succeeded', 'Unknown']).toContain(child);
        } else if (typeof child === 'number') {
          expect(Number.isSafeInteger(child) && child >= 0 && child <= 1024 * 1024).toBe(true);
        } else {
          expect(typeof child).toBe('boolean');
        }
      }
    };
    inspect(output);
    p.status.phase = canary;
    expect(projectPod(p).phase).toBe('Unknown');
  });

  it.each([
    null,
    [],
    {},
    { items: null },
    { items: 'CANARY' },
    { items: [null] },
    { items: [[]] },
    { items: Array.from({ length: 257 }, pod) },
  ])('rejects invalid envelopes %j', (value) => {
    assertRejected(JSON.stringify(value));
  });

  it.each(['status', 'spec', 'conditions', 'containerStatuses', 'initContainerStatuses', 'ephemeralContainerStatuses'])(
    'refuses malformed %s instead of guessing',
    (field) => {
      const p = pod();

      if (field === 'status' || field === 'spec') {
        p[field] = 'CANARY';
      } else {
        p.status[field] = [null];
      }

      assertRejected(JSON.stringify({ items: [p] }));
    },
  );

  it('accepts at most exactly 1 MiB, and rejects oversized input without partial output', () => {
    const input = JSON.stringify({ items: [] });
    const exact = input.padEnd(1024 * 1024, ' ');
    expect(cli(exact).status).toBe(0);
    assertRejected(`${exact} `);
  });

  it.each(['', '{"items": [SECRET_CANARY', 'null\nSECRET_CANARY', '[]'])('sanitizes invalid JSON %s', (input) => {
    assertRejected(input);
  });

  it('rejects invalid UTF-8 and all CLI overrides', () => {
    assertRejected(Buffer.from([0xff]));
    assertRejected('{"items":[]}', ['--namespace', 'other']);
  });
});

/* The actual inline shells and unchanged cluster wrapper run against local stubs only. */
function execute(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'manager-observer-'));

  const put = (path, content, executable = false) => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);

    if (executable) {
      chmodSync(full, 0o700);
    }
  };

  try {
    put('scripts/ci/cluster.sh', readFileSync('scripts/ci/cluster.sh'), true);
    put(helperPath, readFileSync(helperPath));
    put('payload.json', options.payload ?? JSON.stringify({ items: [pod()] }));
    put(
      'bin/gcloud',
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.KUBECONFIG !== process.env.RUNNER_TEMP + '/manager-observer-kubeconfig') process.exit(91);
fs.appendFileSync(process.env.CAPTURE, JSON.stringify(['gcloud', ...args]) + '\\n');
process.stderr.write('SECRET_STDERR_CANARY\\n');
let boundary;
if (args[0] === 'components') boundary = 'plugin';
else if (args[0] === 'projects') boundary = 'project';
else if (args[3] === 'get-credentials') boundary = 'credentials';
else if (args[3] === 'describe') boundary = 'membership';
else process.exit(90);
if (process.env.FAIL_AT === boundary) process.exit(1);
if (boundary === 'project') process.stdout.write(process.env.PROJECT_NUMBER);
if (boundary === 'membership') process.stdout.write(process.env.MEMBERSHIP);
`,
      true,
    );
    put(
      'bin/kubectl',
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.KUBECONFIG !== process.env.RUNNER_TEMP + '/manager-observer-kubeconfig') process.exit(91);
fs.appendFileSync(process.env.CAPTURE, JSON.stringify(['kubectl', ...args]) + '\\n');
process.stderr.write('SECRET_STDERR_CANARY\\n');
if (args[0] === 'config') {
  const boundary = args[3].includes('.contexts[') ? 'context' : 'server';
  if (process.env.FAIL_AT === boundary) process.exit(1);
  process.stdout.write(boundary === 'context' ? process.env.CLUSTER : process.env.SERVER);
} else {
  process.stdout.write(fs.readFileSync(process.env.PAYLOAD));
  if (process.env.FAIL_AT === 'pods') process.exit(1);
}
`,
      true,
    );
    mkdirSync(join(dir, 'temp'));
    put('temp/manager-observer-kubeconfig', 'SYNTHETIC_CREDENTIAL_CANARY');
    symlinkSync(process.execPath, join(dir, 'bin/node'));

    if (options.staleOutput) {
      put('temp/manager-observer-evidence/manager-terminality.json', 'STALE_CANARY');
    }

    const env = {
      PATH: `${join(dir, 'bin')}:/usr/bin:/bin`,
      RUNNER_TEMP: join(dir, 'temp'),
      KUBECONFIG: join(dir, 'temp/kubeconfig'),
      CAPTURE: join(dir, 'capture.jsonl'),
      PAYLOAD: join(dir, 'payload.json'),
      PROJECT_NUMBER: '267592214411',
      MEMBERSHIP: 'projects/vibecore-495216/locations/europe-west9/memberships/vibecore-prod-app',
      CLUSTER: 'verified-cluster',
      SERVER:
        'https://europe-west9-connectgateway.googleapis.com/v1/projects/267592214411/locations/europe-west9/gkeMemberships/vibecore-prod-app',
      GCP_PROJECT_ID: job.env.GCP_PROJECT_ID,
      FLEET_MEMBERSHIP: job.env.FLEET_MEMBERSHIP,
      FLEET_LOCATION: job.env.FLEET_LOCATION,
      ...context,
      ...options.env,
    };

    const script = options.script ?? [steps[0].run, steps[4].run, steps[5].run].join('\n');

    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 10000,
    });

    const artifact = join(dir, 'temp/manager-observer-evidence/manager-terminality.json');

    return {
      ...result,
      capture: existsSync(env.CAPTURE)
        ? readFileSync(env.CAPTURE, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        : [],
      kubeconfigExists: existsSync(join(dir, 'temp/manager-observer-kubeconfig')),
      artifact: existsSync(artifact) ? readFileSync(artifact, 'utf8') : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertCommands(capture) {
  expect(capture).toEqual([
    ['gcloud', 'components', 'install', 'gke-gcloud-auth-plugin', '--quiet'],
    [
      'gcloud',
      'container',
      'fleet',
      'memberships',
      'get-credentials',
      'vibecore-prod-app',
      '--project=vibecore-495216',
      '--location=europe-west9',
    ],
    ['gcloud', 'projects', 'describe', 'vibecore-495216', '--format=value(projectNumber)'],
    [
      'gcloud',
      'container',
      'fleet',
      'memberships',
      'describe',
      'vibecore-prod-app',
      '--project=vibecore-495216',
      '--location=europe-west9',
      '--format=value(name)',
    ],
    [
      'kubectl',
      'config',
      'view',
      '-o',
      "jsonpath={.contexts[?(@.name=='connectgateway_vibecore-495216_europe-west9_vibecore-prod-app')].context.cluster}",
    ],
    ['kubectl', 'config', 'view', '-o', "jsonpath={.clusters[?(@.name=='verified-cluster')].cluster.server}"],
    [
      'kubectl',
      '--context=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app',
      '-n',
      'vibecore',
      'get',
      'pods',
      '-l',
      'app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=vibecore',
      '--request-timeout=30s',
      '-o',
      'json',
    ],
  ]);
}

describe('fixed read-only command and authoritative target checks', () => {
  it('runs one list, after verified project/membership/context, and never leaks raw/stderr output', () => {
    const result = execute();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    assertCommands(result.capture);
    expect(JSON.parse(result.artifact)).toEqual(projectList({ items: [pod()] }));
  });

  it.each(['plugin', 'credentials', 'project', 'membership', 'context', 'server', 'pods'])(
    'stops without retries or artifact when %s fails',
    (boundary) => {
      const result = execute({ env: { FAIL_AT: boundary } });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        boundary === 'plugin' || boundary === 'credentials'
          ? 'TERMINAL_OBSERVER_GATEWAY_UNAVAILABLE\n'
          : diagnosticError,
      );
      expect(result.artifact).toBeNull();

      const gets = result.capture.filter((command) => command.includes('get'));
      expect(gets).toHaveLength(boundary === 'pods' ? 1 : 0);
      expect(new Set(result.capture.map((command) => JSON.stringify(command))).size).toBe(result.capture.length);
    },
  );

  it.each([
    { PROJECT_NUMBER: '1234' },
    { MEMBERSHIP: 'projects/other/locations/europe-west9/memberships/vibecore-prod-app' },
    { PROD_KUBE_CONTEXT: 'connectgateway_other_europe-west9_vibecore-prod-app' },
    { CLUSTER: '' },
    { SERVER: 'https://attacker.invalid/vibecore-prod-app' },
    {
      SERVER:
        'https://europe-west9-connectgateway.googleapis.com/v1/projects/1234/locations/europe-west9/gkeMemberships/vibecore-prod-app',
    },
  ])('fails closed on authoritative identity mismatch %j', (env) => {
    const result = execute({ env });
    expect(result.status).not.toBe(0);
    expect(result.artifact).toBeNull();
    expect(result.stderr).toBe(diagnosticError);
    expect(result.capture.some((command) => command.includes('get'))).toBe(false);
  });

  it('neutralizes ambient Helm routing in the unchanged wrapper', () => {
    const result = execute({
      env: { HELM_KUBEAPISERVER: 'https://attacker.invalid', HELM_KUBETOKEN: 'SECRET_CANARY', HELM_NAMESPACE: 'other' },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.capture.at(-1)).toContain('vibecore');
    expect(JSON.stringify(result.capture)).not.toContain('CANARY');
  });

  it.each([
    '',
    '{bad SECRET_CANARY',
    JSON.stringify({ items: [null] }),
    JSON.stringify({ items: Array.from({ length: 257 }, pod) }),
    ' '.repeat(1024 * 1024 + 1),
  ])('does not retain invalid observation %#', (payload) => {
    const result = execute({ payload });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(diagnosticError);
    expect(result.artifact).toBeNull();
  });

  it.each(Object.keys(context))('rejects wrong %s before any credential command', (key) => {
    const result = execute({ env: { [key]: 'INVALID_CANARY' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('TERMINAL_OBSERVER_CONTEXT_REFUSED\n');
    expect(result.capture).toEqual([]);
    expect(result.artifact).toBeNull();
  });

  it('refuses a stale output directory before reading pods', () => {
    const result = execute({ staleOutput: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(diagnosticError);
    expect(result.artifact).toBe('STALE_CANARY');
    expect(result.capture.some((command) => command.includes('get'))).toBe(false);
  });

  it.each([
    ['namespace', '-n vibecore get pods', '-n other get pods'],
    ['resource', 'get pods', 'get secrets'],
    ['verb', 'get pods', 'delete pods'],
    ['selector', 'app.kubernetes.io/instance=vibecore', 'app.kubernetes.io/instance=other'],
    ['budget', '--request-timeout=30s', '--request-timeout=300s'],
    ['format', '-o json', '-o yaml'],
    ['wrapper', 'scripts/ci/cluster.sh prod-gateway kubectl', 'kubectl'],
    ['target', 'prod-gateway kubectl', 'prod-direct kubectl'],
    ['tool', 'prod-gateway kubectl', 'prod-gateway helm'],
  ])('negative control detects broadened %s command', (_name, before, after) => {
    expect(steps[5].run).toContain(before);

    const result = execute({ script: [steps[0].run, steps[4].run, steps[5].run.replace(before, after)].join('\n') });
    expect(() => assertCommands(result.capture)).toThrow();
  });

  it('parses every inline shell without executing external commands', () => {
    for (const step of steps.filter((step) => step.run)) {
      expect(spawnSync('/bin/bash', ['-n'], { input: step.run }).status).toBe(0);
    }
  });
});

function assertWorkflow(value) {
  expect(Object.keys(value).sort()).toEqual(['jobs', 'name', 'on', 'permissions']);
  expect(value.on).toEqual({ push: { branches: ['main'], paths: [workflowPath, helperPath] } });
  expect(value.permissions).toEqual({ contents: 'read' });
  expect(Object.keys(value.jobs)).toEqual(['observe']);

  const current = value.jobs.observe;
  expect(Object.keys(current).sort()).toEqual([
    'defaults',
    'env',
    'environment',
    'if',
    'permissions',
    'runs-on',
    'steps',
    'timeout-minutes',
  ]);
  expect(current.if).toBe(
    "github.event_name == 'push' && github.repository == 'openaxcloud/vibecore' && github.ref == 'refs/heads/main' && github.workflow_ref == 'openaxcloud/vibecore/.github/workflows/observe-manager-terminality.yml@refs/heads/main'",
  );
  expect(current.environment).toBe('production');
  expect(current.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
  expect(current['runs-on']).toBe('ubuntu-latest');
  expect(current['timeout-minutes']).toBe(10);
  expect(current.defaults).toEqual({ run: { shell: 'bash' } });
  expect(current.env).toEqual({
    GCP_PROJECT_ID: 'vibecore-495216',
    FLEET_MEMBERSHIP: 'vibecore-prod-app',
    FLEET_LOCATION: 'europe-west9',
  });
  expect(current.steps).toHaveLength(8);

  const [guard, checkout, auth, sdk, gateway, observation, upload, cleanup] = current.steps;
  expect(guard.id).toBe('context');
  expect(checkout.uses).toBe('actions/checkout@11d5960a326750d5838078e36cf38b85af677262');
  expect(checkout.with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false });
  expect(auth.uses).toBe('google-github-actions/auth@c200f3691d83b41bf9bbd8638997a462592937ed');
  expect(auth.with).toEqual({
    workload_identity_provider: '${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}',
    service_account: '${{ secrets.GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT }}',
    cleanup_credentials: true,
  });
  expect(sdk.uses).toBe('google-github-actions/setup-gcloud@e427ad8a34f8676edf47cf7d7925499adf3eb74f');
  expect(sdk.with).toEqual({ project_id: '${{ env.GCP_PROJECT_ID }}' });
  expect(gateway.id).toBe('gateway');
  expect(observation.id).toBe('observation');
  expect(observation['timeout-minutes']).toBe(2);
  expect(upload.if).toBe("success() && steps.observation.outcome == 'success'");
  expect(upload.uses).toBe('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
  expect(upload.with).toEqual({
    name: 'manager-terminality-${{ github.sha }}',
    path: '${{ runner.temp }}/manager-observer-evidence/manager-terminality.json',
    'if-no-files-found': 'error',
    'retention-days': 1,
  });
  expect(cleanup.if).toBe('always()');

  for (const step of current.steps) {
    const allowed = ['name', ...(step.run ? ['run'] : ['uses', 'with'])];

    if (step === guard || step === gateway || step === observation) {
      allowed.push('id');
    }

    if (step === observation) {
      allowed.push('timeout-minutes');
    }

    if (step === upload || step === cleanup) {
      allowed.push('if');
    }

    expect(Object.keys(step).sort()).toEqual(allowed.sort());
  }
}

describe('workflow security and deployment isolation', () => {
  it('rejects runner expressions at job env, where GitHub cannot evaluate them', () => {
    // https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
    const assertJobEnv = (value) => {
      for (const expression of Object.values(value.env ?? {})) {
        expect(String(expression)).not.toMatch(/\$\{\{[^}]*\brunner(?:\s*\.|\s*\[)/);
      }
    };
    assertJobEnv(job);

    const invalid = structuredClone(job);
    invalid.env.KUBECONFIG = '${{ runner.temp }}/manager-observer-kubeconfig';
    expect(() => assertJobEnv(invalid)).toThrow();
  });

  it.each([4, 5])('routes step %i independently through the exact private kubeconfig', (index) => {
    const result = execute({ script: steps[index].run });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.capture.length).toBeGreaterThan(0);

    const mutant = steps[index].run.replace('export KUBECONFIG="${RUNNER_TEMP}/manager-observer-kubeconfig"', '');
    expect(execute({ script: mutant }).status).not.toBe(0);
  });

  it('removes the exact private kubeconfig in an independent cleanup shell', () => {
    const result = execute({ script: steps[7].run });
    expect(result.status).toBe(0);
    expect(result.kubeconfigExists).toBe(false);
    expect(result.capture).toEqual([]);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');

    const mutant = steps[7].run.replace('export KUBECONFIG="${RUNNER_TEMP}/manager-observer-kubeconfig"', '');
    expect(execute({ script: mutant }).kubeconfigExists).toBe(true);
  });

  it('has only fixed main-push context, existing pins/identity, production approval and success-only upload', () => {
    assertWorkflow(workflow);

    const delivery = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));

    const pins = Object.values(delivery.jobs)
      .flatMap((value) => value.steps ?? [])
      .map((step) => step.uses)
      .filter(Boolean);

    for (const step of steps.filter((step) => step.uses)) {
      expect(pins).toContain(step.uses);
    }
  });

  it('keeps all three additions ignored by deploy-main and outside exact chain paths', () => {
    const delivery = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));
    const chain = parse(readFileSync('.github/workflows/deploy-chain-change.yml', 'utf8'));
    expect(delivery.on.push['paths-ignore']).toContain('.github/**');
    expect(delivery.on.push['paths-ignore']).toContain('**/*.spec.mjs');
    expect(chain.on.push.paths).toEqual([
      '.github/workflows/deploy-main.yml',
      '.github/workflows/deploy-chain-change.yml',
      'scripts/release-gate/declencher-correctif-livraison.mjs',
    ]);

    for (const path of [workflowPath, helperPath, specPath]) {
      expect(path.startsWith('.github/') || path.endsWith('.spec.mjs')).toBe(true);
      expect(chain.on.push.paths).not.toContain(path);
    }
  });

  it.each([
    [
      'dispatch',
      (w) => {
        w.on.workflow_dispatch = {};
      },
    ],
    [
      'pull request',
      (w) => {
        w.on.pull_request = {};
      },
    ],
    [
      'branch',
      (w) => {
        w.on.push.branches = ['other'];
      },
    ],
    [
      'path widening',
      (w) => {
        w.on.push.paths.push('**');
      },
    ],
    [
      'job assertion',
      (w) => {
        w.jobs.observe.if = 'true';
      },
    ],
    [
      'environment',
      (w) => {
        delete w.jobs.observe.environment;
      },
    ],
    [
      'permission',
      (w) => {
        w.jobs.observe.permissions.actions = 'write';
      },
    ],
    [
      'workflow permission',
      (w) => {
        w.permissions['id-token'] = 'write';
      },
    ],
    [
      'project',
      (w) => {
        w.jobs.observe.env.GCP_PROJECT_ID = 'other';
      },
    ],
    [
      'membership',
      (w) => {
        w.jobs.observe.env.FLEET_MEMBERSHIP = 'other';
      },
    ],
    [
      'region',
      (w) => {
        w.jobs.observe.env.FLEET_LOCATION = 'other';
      },
    ],
    [
      'checkout ref',
      (w) => {
        w.jobs.observe.steps[1].with.ref = 'main';
      },
    ],
    [
      'checkout credentials',
      (w) => {
        w.jobs.observe.steps[1].with['persist-credentials'] = true;
      },
    ],
    [
      'unpinned action',
      (w) => {
        w.jobs.observe.steps[2].uses = 'google-github-actions/auth@v2';
      },
    ],
    [
      'provider',
      (w) => {
        w.jobs.observe.steps[2].with.workload_identity_provider = 'other';
      },
    ],
    [
      'identity',
      (w) => {
        w.jobs.observe.steps[2].with.service_account = 'other';
      },
    ],
    [
      'auth cleanup',
      (w) => {
        w.jobs.observe.steps[2].with.cleanup_credentials = false;
      },
    ],
    [
      'auth failure bypass',
      (w) => {
        w.jobs.observe.steps[2]['continue-on-error'] = true;
      },
    ],
    [
      'auth fallback',
      (w) => {
        w.jobs.observe.steps.push(w.jobs.observe.steps[2]);
      },
    ],
    [
      'gateway failure bypass',
      (w) => {
        w.jobs.observe.steps[4]['continue-on-error'] = true;
      },
    ],
    [
      'observation failure bypass',
      (w) => {
        w.jobs.observe.steps[5]['continue-on-error'] = true;
      },
    ],
    [
      'upload on failure',
      (w) => {
        w.jobs.observe.steps[6].if = 'always()';
      },
    ],
    [
      'raw upload',
      (w) => {
        w.jobs.observe.steps[6].with.path = '${{ runner.temp }}/*';
      },
    ],
    [
      'cleanup condition',
      (w) => {
        w.jobs.observe.steps[7].if = 'success()';
      },
    ],
  ])('negative control detects %s', (_label, change) => {
    const mutant = structuredClone(workflow);
    change(mutant);
    expect(() => assertWorkflow(mutant)).toThrow();
  });
});
