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

const ownershipPath = '.github/scripts/observe-manager-ownership.mjs';
const { projectOwnership, observeOwnership, failureReceipt } = await import(pathToFileURL(resolve(ownershipPath)).href);
const namespace = 'vibecore';
const managerName = 'vibecore-vibecore-platform-workspace-manager';
const revisionKey = 'deployment.kubernetes.io/revision';
const metadata = (name, uid) => ({ name, uid, namespace, resourceVersion: '1' });

const ownerRef = (kind, value) => ({
  apiVersion: 'apps/v1',
  kind,
  name: value.metadata.name,
  uid: value.metadata.uid,
  controller: true,
});
const deploymentFixture = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { ...metadata(managerName, 'dep'), generation: 1, annotations: { [revisionKey]: '2' } },
  spec: { replicas: 1, template: { metadata: { labels: {} }, spec: { containers: [{ image: 'private-canary' }] } } },
  status: { observedGeneration: 1, updatedReplicas: 1, readyReplicas: 1, availableReplicas: 1 },
};
const rsFixture = {
  apiVersion: 'apps/v1',
  kind: 'ReplicaSet',
  metadata: {
    ...metadata('rs', 'rs-id'),
    annotations: { [revisionKey]: '2' },
    ownerReferences: [ownerRef('Deployment', deploymentFixture)],
  },
  spec: { replicas: 1, template: deploymentFixture.spec.template },
};

function ownershipFixture(items = [pod()]) {
  const before = structuredClone(deploymentFixture);

  const setsBefore = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSetList',
    metadata: { resourceVersion: '2' },
    items: [structuredClone(rsFixture)],
  };

  return {
    before,
    setsBefore,
    pods: {
      apiVersion: 'v1',
      kind: 'PodList',
      metadata: { resourceVersion: '3' },
      items: items.map((item, i) => ({
        ...item,
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: { ...metadata('pod-' + i, 'pod-id-' + i), ownerReferences: [ownerRef('ReplicaSet', rsFixture)] },
      })),
    },
    setsAfter: structuredClone(setsBefore),
    after: structuredClone(before),
  };
}

// Exact kubectl printGeneric envelope, unlike the typed API response fixtures above.
function genericFixture() {
  const input = ownershipFixture();

  for (const key of ['setsBefore', 'pods', 'setsAfter']) {
    input[key].kind = 'List';
    input[key].apiVersion = 'v1';
    input[key].metadata = { resourceVersion: '' };
  }

  return input;
}

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
    put(ownershipPath, options.ownershipSource ?? readFileSync(ownershipPath));
    put('deployment.json', JSON.stringify(deploymentFixture));
    put('sets.json', JSON.stringify(genericFixture().setsBefore));
    put('payload.json', options.payload ?? JSON.stringify(genericFixture().pods));
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
  process.stdout.write(fs.readFileSync(args.includes('deployment') ? 'deployment.json' : args.includes('replicasets') ? 'sets.json' : process.env.PAYLOAD));
  if (args.includes(process.env.FAIL_AT)) process.exit(1);
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
      GITHUB_OUTPUT: join(dir, 'output.txt'),
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
      failure: existsSync(join(dir, 'temp/manager-observer-evidence/manager-ownership-failure.json'))
        ? JSON.parse(readFileSync(join(dir, 'temp/manager-observer-evidence/manager-ownership-failure.json'), 'utf8'))
        : null,
      outputs: existsSync(env.GITHUB_OUTPUT) ? readFileSync(env.GITHUB_OUTPUT, 'utf8') : '',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertCommands(capture) {
  const gets = capture.filter((command) => command.includes('get'));
  expect(gets).toEqual(
    ['deployment', 'replicasets', 'pods', 'replicasets', 'deployment'].map((kind) => [
      'kubectl',
      '--context=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app',
      '-n',
      'vibecore',
      'get',
      kind,
      ...(kind === 'deployment'
        ? [managerName]
        : ['-l', 'app.kubernetes.io/name=workspace-manager,app.kubernetes.io/instance=vibecore']),
      '--request-timeout=15s',
      '-o',
      'json',
    ]),
  );
  expect(capture.filter((command) => command[0] === 'kubectl' && command[1] === 'config')).toHaveLength(10);
  expect(capture.filter((command) => command[0] === 'gcloud')).toHaveLength(12);
}

describe('fixed read-only command and authoritative target checks', () => {
  it('runs five bounded GETs, after verified project/membership/context, and never leaks raw/stderr output', () => {
    const result = execute();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    assertCommands(result.capture);
    expect(JSON.parse(result.artifact)).toEqual(projectOwnership(ownershipFixture()));
  });

  it.each(['plugin', 'credentials', 'project', 'membership', 'context', 'server', 'deployment', 'replicasets', 'pods'])(
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
      expect(gets).toHaveLength({ deployment: 1, replicasets: 2, pods: 3 }[boundary] ?? 0);
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
    ['namespace', "const namespace = 'vibecore'", "const namespace = 'other'"],
    ['name', "const name = 'vibecore-vibecore-platform-workspace-manager'", "const name = 'other'"],
    ['verb', "'get',", "'delete',"],
    ['selector', 'app.kubernetes.io/instance=vibecore', 'app.kubernetes.io/instance=other'],
    ['budget', '--request-timeout=15s', '--request-timeout=300s'],
    ['format', "'json',", "'yaml',"],
    ['target', "'prod-gateway',", "'prod-direct',"],
  ])('negative control detects broadened %s command', (_name, before, after) => {
    const original = readFileSync(ownershipPath, 'utf8');
    expect(original).toContain(before);

    const result = execute({ ownershipSource: original.replace(before, after) });
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
  expect(value.on).toEqual({ push: { branches: ['main'], paths: [workflowPath, helperPath, ownershipPath] } });
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
  expect(current.steps).toHaveLength(9);

  const [guard, checkout, auth, sdk, gateway, observation, upload, cleanup, refusalUpload] = current.steps;
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
  expect(refusalUpload.if).toBe(
    "failure() && steps.observation.outcome == 'failure' && steps.observation.outputs.failure_receipt == 'true'",
  );
  expect(refusalUpload.uses).toBe(upload.uses);
  expect(refusalUpload.with).toEqual({
    name: 'manager-ownership-refusal-${{ github.sha }}',
    path: '${{ runner.temp }}/manager-observer-evidence/manager-ownership-failure.json',
    'if-no-files-found': 'error',
    'retention-days': 1,
  });

  for (const step of current.steps) {
    const allowed = ['name', ...(step.run ? ['run'] : ['uses', 'with'])];

    if (step === guard || step === gateway || step === observation) {
      allowed.push('id');
    }

    if (step === observation) {
      allowed.push('timeout-minutes');
    }

    if (step === upload || step === cleanup || step === refusalUpload) {
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

  it('keeps every diagnostic path ignored by deploy-main and outside exact chain paths', () => {
    const delivery = parse(readFileSync('.github/workflows/deploy-main.yml', 'utf8'));
    const chain = parse(readFileSync('.github/workflows/deploy-chain-change.yml', 'utf8'));
    expect(delivery.on.push['paths-ignore']).toContain('.github/**');
    expect(delivery.on.push['paths-ignore']).toContain('**/*.spec.mjs');
    expect(chain.on.push.paths).toEqual([
      '.github/workflows/deploy-main.yml',
      '.github/workflows/deploy-chain-change.yml',
      'scripts/release-gate/declencher-correctif-livraison.mjs',
    ]);

    for (const path of [
      workflowPath,
      helperPath,
      ownershipPath,
      '.github/scripts/MANAGER-OWNERSHIP-OBSERVATION.md',
      specPath,
    ]) {
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

describe('anonymous controller bracket', () => {
  it('reports the current UID chain without declaring a Failed pod terminal or historical', () => {
    const input = ownershipFixture();
    input.pods.items[0].status = { phase: 'Failed' };

    const result = projectOwnership(input);
    expect(result.ownership.currentControllerUnique).toBe(true);
    expect(result.pods[0].ownership.relation).toBe('current-controller');
    expect(result.pods[0].terminal).toBe(false);
    expect(result.ownership.priorPodIdentityProven).toBe(false);
    expect(result.ownership.atomicSnapshot).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /private-canary|rs-id|pod-id|resourceVersion|annotations|image|uid|\"name\"/,
    );
  });

  it('distinguishes another owned revision but does not exclude any pod', () => {
    const input = ownershipFixture();
    const previous = structuredClone(rsFixture);
    previous.metadata.uid = 'old-id';
    previous.metadata.name = 'old';
    previous.metadata.annotations[revisionKey] = '1';
    previous.spec.template.spec.containers[0].image = 'old-image';
    input.setsBefore.items.push(previous);
    input.setsAfter = structuredClone(input.setsBefore);
    input.pods.items[0].metadata.ownerReferences = [ownerRef('ReplicaSet', previous)];
    input.pods.items[0].status = { phase: 'Failed' };

    const result = projectOwnership(input);
    expect(result.pods[0].ownership.relation).toBe('other-owned-controller');
    expect(result.total).toBe(1);
    expect(result.terminal).toBe(0);
  });

  it.each([
    (x) => {
      delete x.pods.items[0].metadata.ownerReferences;
    },
    (x) => {
      x.pods.items[0].metadata.ownerReferences[0].uid = 'wrong';
    },
    (x) => {
      x.pods.items[0].metadata.ownerReferences[0].name = 'wrong';
    },
    (x) => {
      x.pods.items[0].metadata.ownerReferences[0].controller = false;
    },
    (x) => {
      x.pods.items[0].metadata.ownerReferences.push(x.pods.items[0].metadata.ownerReferences[0]);
    },
    (x) => {
      delete x.setsBefore.items[0].metadata.ownerReferences;
    },
    (x) => {
      x.setsBefore.items[0].metadata.ownerReferences[0].uid = 'different-deployment';
    },
    (x) => {
      x.setsBefore.items[0].metadata.annotations[revisionKey] = '3';
    },
    (x) => {
      x.setsBefore.items[0].spec.template.spec.containers[0].image = 'different';
    },
    (x) => {
      x.before.status.observedGeneration = 0;
    },
    (x) => {
      delete x.before.metadata.annotations;
    },
    (x) => {
      x.before.metadata.deletionTimestamp = 'now';
    },
    (x) => {
      x.setsBefore.items[0].metadata.deletionTimestamp = 'now';
    },
    (x) => {
      const second = structuredClone(x.setsBefore.items[0]);
      second.metadata.uid = 'second';
      second.metadata.name = 'second';
      x.setsBefore.items.push(second);
    },
  ])('retains uncertainty for missing or conflicting identity/revision evidence %#', (mutate) => {
    const input = ownershipFixture();
    mutate(input);
    input.after = structuredClone(input.before);
    input.setsAfter = structuredClone(input.setsBefore);
    expect(projectOwnership(input).pods[0].ownership.relation).toBe('unknown');
  });

  it.each([
    (x) => {
      x.after.metadata.uid = 'recreated';
    },
    (x) => {
      x.after.metadata.resourceVersion = 'new';
    },
    (x) => {
      x.after.metadata.generation++;
    },
    (x) => {
      x.after.spec.replicas++;
    },
    (x) => {
      x.setsAfter.items[0].metadata.resourceVersion = 'new';
    },
    (x) => {
      x.setsAfter.items = [];
    },
    (x) => {
      x.setsBefore.metadata.continue = 'page';
    },
    (x) => {
      x.pods.metadata.continue = 'page';
    },
    (x) => {
      x.pods.items[0].metadata.namespace = 'other';
    },
    (x) => {
      x.before.metadata.name = 'other';
    },
    (x) => {
      x.pods.items.push(structuredClone(x.pods.items[0]));
    },
    (x) => {
      x.pods.items = Array.from({ length: 257 }, () => x.pods.items[0]);
    },
  ])('refuses temporal changes, incomplete lists, duplicate identities and wrong scope %#', (mutate) => {
    const input = ownershipFixture();
    mutate(input);
    expect(() => projectOwnership(input)).toThrow('MANAGER_OWNERSHIP_UNAVAILABLE');
  });

  it('does not compare resourceVersions across distinct resource kinds or list snapshots', () => {
    const input = ownershipFixture();
    input.setsAfter.metadata.resourceVersion = '999';
    expect(projectOwnership(input).ownership.controllerBracketStable).toBe(true);
  });

  it('ignores only the controller-injected template hash for template equality', () => {
    const input = ownershipFixture();
    input.setsBefore.items[0].spec.template.metadata.labels['pod-template-hash'] = 'hash';
    input.setsAfter = structuredClone(input.setsBefore);
    expect(projectOwnership(input).ownership.currentControllerUnique).toBe(true);
  });

  it('limits rows without dropping aggregate counts or claiming complete detail', () => {
    const input = ownershipFixture(Array.from({ length: 17 }, pod));
    const result = projectOwnership(input);
    expect(result.pods).toHaveLength(16);
    expect(result.omitted).toBe(1);
    expect(result.ownership.counts['current-controller']).toBe(17);
  });

  it('stops at every refused GET without retry, provider text or partial output', async () => {
    const { observeOwnership } = await import(pathToFileURL(resolve(ownershipPath)).href);

    for (let failAt = 0; failAt < 5; failAt++) {
      const input = ownershipFixture();
      const replies = [input.before, input.setsBefore, input.pods, input.setsAfter, input.after];

      let calls = 0;
      expect(() =>
        observeOwnership((_bin, _args, options) => {
          expect(options.timeout).toBe(20000);
          expect(options.maxBuffer).toBe(1024 * 1024);

          const index = calls++;

          if (index === failAt) {
            throw new Error('PRIVATE_PROVIDER_CANARY');
          }

          return Buffer.from(JSON.stringify(replies[index]));
        }),
      ).toThrow();
      expect(calls).toBe(failAt + 1);
    }
  });
});

describe('node assignment is observation only', () => {
  it.each([
    [undefined, 'absent'],
    ['', 'empty'],
    ['node.example', 'valid'],
    ['node..example', 'invalid'],
    ['a'.repeat(64), 'invalid'],
    [42, 'invalid'],
    ['PRIVATE_CANARY', 'invalid'],
  ])('projects %j without inferring whether the pod ever ran', (value, expected) => {
    const input = ownershipFixture();
    input.pods.items[0].spec.nodeName = value;

    const output = projectOwnership(input);
    expect(output.pods[0].ownership.nodeName).toBe(expected);
    expect(output.ownership.priorPodIdentityProven).toBe(false);
    expect(JSON.stringify(output)).not.toContain('node.example');
    expect(JSON.stringify(output)).not.toContain('PRIVATE_CANARY');
  });
});

it('stops at the pod GET when terminality structure is malformed', async () => {
  const { observeOwnership } = await import(pathToFileURL(resolve(ownershipPath)).href);
  const input = ownershipFixture();
  input.pods.items[0].status.conditions = [null];

  const replies = [input.before, input.setsBefore, input.pods, input.setsAfter, input.after];

  let calls = 0;
  expect(() => observeOwnership(() => Buffer.from(JSON.stringify(replies[calls++])))).toThrow();
  expect(calls).toBe(3);
});

describe('kubectl generic envelope and fixed refusal receipts', () => {
  const sequence = (input) => [input.before, input.setsBefore, input.pods, input.setsAfter, input.after];

  const run = (input, mutate) => {
    let calls = 0;

    try {
      const output = observeOwnership((_bin, _args, _options) => {
        const index = calls++;
        return mutate ? mutate(index, sequence(input)[index]) : Buffer.from(JSON.stringify(sequence(input)[index]));
      });
      return { output, calls };
    } catch (error) {
      return { failure: failureReceipt(error), calls };
    }
  };

  it('accepts the official List/v1/empty-RV rendering while preserving all item checks', () => {
    const generic = genericFixture();
    expect(projectOwnership(generic)).toEqual(projectOwnership(ownershipFixture()));
    expect(run(generic).calls).toBe(5);
    expect(run(generic).output.ownership.currentControllerUnique).toBe(true);

    const shell = execute();
    expect(shell.status).toBe(0);
    expect(shell.failure).toBeNull();
    expect(shell.outputs).toBe('');
    expect(JSON.parse(shell.artifact)).toEqual(projectOwnership(generic));
  });

  it.each([
    (x) => {
      x.setsBefore.apiVersion = 'apps/v1';
    },
    (x) => {
      x.setsBefore.kind = 'OtherList';
    },
    (x) => {
      x.setsBefore.metadata = null;
    },
    (x) => {
      delete x.setsBefore.metadata.resourceVersion;
    },
    (x) => {
      x.setsBefore.metadata.resourceVersion = 0;
    },
    (x) => {
      x.setsBefore.metadata.continue = 'page';
    },
    (x) => {
      x.setsBefore.metadata.continue = false;
    },
    (x) => {
      x.setsBefore.metadata.remainingItemCount = 1;
    },
    (x) => {
      x.setsBefore.metadata.remainingItemCount = '0';
    },
    (x) => {
      x.setsBefore.items[0].kind = 'Pod';
    },
    (x) => {
      x.setsBefore.items[0].apiVersion = 'v1';
    },
    (x) => {
      delete x.setsBefore.items[0].metadata.uid;
    },
    (x) => {
      x.setsBefore.items[0].metadata.resourceVersion = '';
    },
    (x) => {
      x.setsBefore.items.push(structuredClone(x.setsBefore.items[0]));
    },
  ])('refuses malformed generic envelopes and items at GET2 %#', (mutate) => {
    const input = genericFixture();
    mutate(input);
    expect(run(input)).toEqual({
      calls: 2,
      failure: { schemaVersion: 1, outcome: 'refused', stage: 'replicasets-before', index: 2, category: 'shape' },
    });
  });

  it('retains the typed API-list nonempty resourceVersion requirement', () => {
    const input = ownershipFixture();
    input.setsBefore.metadata.resourceVersion = '';
    expect(run(input).failure.category).toBe('shape');
  });

  it('accepts complete zero continuation and zero remaining metadata, not partial pages', () => {
    const input = genericFixture();
    input.setsBefore.metadata.continue = '';
    input.setsBefore.metadata.remainingItemCount = 0;
    expect(run(input).output).toBeDefined();
  });

  it.each(['setsBefore', 'pods'])('keeps wrong namespace classified as scope for %s', (key) => {
    const input = genericFixture();
    input[key].items[0].metadata.namespace = 'private-canary';
    expect(run(input).failure.category).toBe('scope');
    expect(JSON.stringify(run(input))).not.toContain('private-canary');
  });

  it.each([0, 1, 2, 3, 4])('retains stage/index for every parse failure at GET%i without continuing', (failAt) => {
    const result = run(genericFixture(), (index, value) =>
      index === failAt ? Buffer.from('PRIVATE_BAD_JSON') : Buffer.from(JSON.stringify(value)),
    );
    expect(result.calls).toBe(failAt + 1);
    expect(result.failure.index).toBe(failAt + 1);
    expect(result.failure.category).toBe('parse');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BAD_JSON');
  });

  it.each([0, 1, 2, 3, 4])('refuses nonzero exit even with complete valid JSON stdout at GET%i', (failAt) => {
    const result = run(genericFixture(), (index, value) => {
      if (index === failAt) {
        throw Object.assign(new Error('PRIVATE_PROVIDER'), {
          status: 1,
          stdout: Buffer.from(JSON.stringify(value)),
          stderr: Buffer.from('PRIVATE_STDERR'),
        });
      }

      return Buffer.from(JSON.stringify(value));
    });
    expect(result.calls).toBe(failAt + 1);
    expect(result.failure.category).toBe('command');
    expect(result.failure.index).toBe(failAt + 1);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|stdout|stderr/);
  });

  it.each([
    ['Error from server (Forbidden): PRIVATE_CANARY\n', 1, 'access-denied'],
    ['Error from server (Unauthorized): PRIVATE_CANARY\n', 1, 'access-denied'],
    ['ERROR: (gcloud.container.fleet.memberships.describe) PERMISSION_DENIED: PRIVATE_CANARY\n', 1, 'access-denied'],
    ['prefix Error from server (Forbidden): PRIVATE_CANARY\n', 1, 'command'],
    ['Error from server (Forbidden): PRIVATE_CANARY\nsecond line', 1, 'command'],
    ['Error from server (NotFound): PRIVATE_CANARY\n', 1, 'command'],
    ['PERMISSION_DENIED PRIVATE_CANARY', 1, 'command'],
    ['Error from server (Forbidden): PRIVATE_CANARY\n', 0, 'command'],
  ])('classifies only exact denial forms without retaining text %#', (stderr, status, category) => {
    const result = run(genericFixture(), () => {
      throw { status, stderr, message: 'PRIVATE_MESSAGE' };
    });
    expect(result.failure.category).toBe(category);
    expect(result.calls).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|stderr|message/);
  });

  it('reports controller bracket changes without identities or versions', () => {
    const input = genericFixture();
    input.after.metadata.resourceVersion = 'PRIVATE_CHANGED';
    expect(run(input).failure).toEqual({
      schemaVersion: 1,
      outcome: 'refused',
      stage: 'projection',
      index: 6,
      category: 'change',
    });
  });

  it('writes only a fixed failure receipt, deletes partial observation and signals the dedicated upload', () => {
    const result = execute({ payload: '{PRIVATE_JSON' });
    expect(result.status).not.toBe(0);
    expect(result.artifact).toBeNull();
    expect(result.failure).toEqual({
      schemaVersion: 1,
      outcome: 'refused',
      stage: 'pods',
      index: 3,
      category: 'parse',
    });
    expect(result.outputs).toBe('failure_receipt=true\n');
    expect(JSON.stringify(result.failure)).not.toContain('PRIVATE');
  });

  it('does not mark a stale directory or pre-helper failure for refusal upload', () => {
    for (const options of [{ staleOutput: true }, { env: { FAIL_AT: 'credentials' } }]) {
      const result = execute(options);
      expect(result.outputs).toBe('');
      expect(result.failure).toBeNull();
    }
  });

  it('cannot fabricate receipt categories from thrown provider objects', () => {
    expect(failureReceipt({ stage: 'pods', category: 'access-denied', message: 'PRIVATE_CANARY' })).toEqual({
      schemaVersion: 1,
      outcome: 'refused',
      stage: 'setup',
      index: 0,
      category: 'shape',
    });
  });

  it.each([
    (w) => {
      w.jobs.observe.steps[8].if = 'always()';
    },
    (w) => {
      w.jobs.observe.steps[8].with.path = '${{ runner.temp }}/*';
    },
    (w) => {
      w.jobs.observe.steps[8].with.path = '${{ runner.temp }}/manager-observer-evidence/manager-terminality.json';
    },
  ])('detects broadened failure upload %#', (mutate) => {
    const changed = structuredClone(workflow);
    mutate(changed);
    expect(() => assertWorkflow(changed)).toThrow();
  });
});
