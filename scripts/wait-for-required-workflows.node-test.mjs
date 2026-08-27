import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_WORKFLOWS,
  ReleaseGateDecisionError,
  evaluateRequiredWorkflows,
  listWorkflowRunsForSha,
  parseArguments,
  waitForRequiredWorkflows,
} from './wait-for-required-workflows.mjs';

const SHA = '468da135ab35e11f9db0b59bc74e214a38eee497';
const OTHER_SHA = '39b861c49a5d138966004939c05b22f364533415';
const CURRENT_RUN_ID = 999_999;

function runFor(workflow, index, overrides = {}) {
  return {
    id: 10_000 + index,
    workflow_id: workflow.workflowId,
    name: workflow.name,
    path: workflow.path,
    head_sha: SHA,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    created_at: `2026-08-27T19:${String(index).padStart(2, '0')}:00Z`,
    html_url: `https://github.example/runs/${10_000 + index}`,
    ...overrides,
  };
}

function successfulRuns() {
  return REQUIRED_WORKFLOWS.map((workflow, index) => runFor(workflow, index));
}

function evaluate(runs) {
  return evaluateRequiredWorkflows({
    runs,
    targetSha: SHA,
    currentRunId: CURRENT_RUN_ID,
  });
}

test('the policy pins the five requested workflows by id, path and exact name', () => {
  assert.deepEqual(
    REQUIRED_WORKFLOWS.map(({ workflowId, name, path }) => ({ workflowId, name, path })),
    [
      {
        workflowId: 271139572,
        name: 'Production CI',
        path: '.github/workflows/ci.yml',
      },
      {
        workflowId: 335198723,
        name: 'E2E Runtime',
        path: '.github/workflows/e2e-runtime.yml',
      },
      {
        workflowId: 327846292,
        name: 'French i18n live audit',
        path: '.github/workflows/i18n-live-audit.yml',
      },
      {
        workflowId: 271139585,
        name: 'Security Analysis',
        path: '.github/workflows/security.yaml',
      },
      {
        workflowId: 314432726,
        name: 'Parity registries',
        path: '.github/workflows/parity-registries.yml',
      },
    ],
  );
});

function pushTriggerBlock(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === '  push:');

  if (start < 0) {
    return '';
  }

  const body = [];

  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith('    ')) {
      break;
    }

    body.push(line);
  }

  return body.join('\n');
}

function inlinePushBranches(pushBlock) {
  const body = /branches:\s*\[([^\]]*)\]/u.exec(pushBlock)?.[1] ?? '';

  return body.split(',').map((branch) => branch.trim().replace(/^['"]|['"]$/gu, ''));
}

test('every required workflow is configured to run on every push to main', () => {
  for (const workflow of REQUIRED_WORKFLOWS) {
    const source = readFileSync(new URL(`../${workflow.path}`, import.meta.url), 'utf8');

    assert.match(source, new RegExp(`^name: ${workflow.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'mu'));

    const push = pushTriggerBlock(source);

    assert.notEqual(push, '', `${workflow.name} must have a push trigger`);
    assert.ok(inlinePushBranches(push).includes('main'), `${workflow.name} must run on main`);
    assert.doesNotMatch(push, /^    paths(?:-ignore)?:/mu, `${workflow.name} push must not be path-filtered`);

    const mutatedPush = push.replace(/(\[\s*|,\s*)main(?=\s*(?:,|\]))/u, '$1not-main');

    assert.notEqual(mutatedPush, push, `${workflow.name} trigger mutation fixture must match`);
    assert.equal(inlinePushBranches(mutatedPush).includes('main'), false);
  }
});

test('all five exact-SHA success conclusions pass', () => {
  const result = evaluate(successfulRuns());
  assert.equal(result.verdict, 'PASS');
  assert.ok(result.workflows.every((workflow) => workflow.state === 'PASS'));
});

test('missing or identity-mutated runs can never substitute for an exact run', () => {
  const mutations = [
    ['missing', () => []],
    ['workflow id', (run) => [{ ...run, workflow_id: run.workflow_id + 1 }]],
    ['display name', (run) => [{ ...run, name: `${run.name} lookalike` }]],
    ['workflow path', (run) => [{ ...run, path: '.github/workflows/lookalike.yml' }]],
    ['head SHA', (run) => [{ ...run, head_sha: OTHER_SHA }]],
    ['event', (run) => [{ ...run, event: 'pull_request' }]],
    ['head branch', (run) => [{ ...run, head_branch: 'feature/not-main' }]],
  ];

  for (const [label, mutate] of mutations) {
    const runs = successfulRuns();
    const original = runs.shift();
    runs.push(...mutate(original));

    const result = evaluate(runs);
    assert.equal(result.verdict, 'WAIT', `${label} mutation must not pass`);
    assert.equal(result.workflows[0].state, 'WAIT', `${label} must be reported absent`);
  }
});

test('every terminal conclusion other than success rejects immediately', () => {
  for (const conclusion of [
    'failure',
    'cancelled',
    'skipped',
    'timed_out',
    'action_required',
    'neutral',
    'stale',
    'startup_failure',
  ]) {
    const runs = successfulRuns();
    runs[0] = { ...runs[0], conclusion };

    const result = evaluate(runs);
    assert.equal(result.verdict, 'REJECT', `${conclusion} must reject`);
    assert.equal(result.workflows[0].state, 'REJECT');
  }
});

test('queued and in-progress runs wait, while unknown or ambiguous terminal states reject', () => {
  for (const status of ['queued', 'in_progress', 'pending', 'requested', 'waiting']) {
    const runs = successfulRuns();
    runs[0] = { ...runs[0], status, conclusion: null };
    assert.equal(evaluate(runs).verdict, 'WAIT', `${status} must wait`);
  }

  const completedWithoutConclusion = successfulRuns();
  completedWithoutConclusion[0] = {
    ...completedWithoutConclusion[0],
    status: 'completed',
    conclusion: null,
  };
  assert.equal(evaluate(completedWithoutConclusion).verdict, 'REJECT');

  const unknownStatus = successfulRuns();
  unknownStatus[0] = { ...unknownStatus[0], status: 'mystery', conclusion: null };
  assert.equal(evaluate(unknownStatus).verdict, 'REJECT');
});

test('the newest exact run decides instead of an older green run', () => {
  const [workflow] = REQUIRED_WORKFLOWS;
  const otherRuns = successfulRuns().slice(1);

  const oldSuccess = runFor(workflow, 0, {
    id: 20_000,
    created_at: '2026-08-27T18:00:00Z',
  });
  const newRunning = runFor(workflow, 0, {
    id: 20_001,
    created_at: '2026-08-27T19:00:00Z',
    status: 'in_progress',
    conclusion: null,
  });
  assert.equal(evaluate([...otherRuns, oldSuccess, newRunning]).verdict, 'WAIT');

  const newFailure = { ...newRunning, status: 'completed', conclusion: 'failure' };
  assert.equal(evaluate([...otherRuns, oldSuccess, newFailure]).verdict, 'REJECT');

  const newSuccess = { ...newRunning, status: 'completed', conclusion: 'success' };
  const oldFailure = { ...oldSuccess, conclusion: 'failure' };
  assert.equal(evaluate([...otherRuns, oldFailure, newSuccess]).verdict, 'PASS');
});

test('the current deploy run is ignored even if its payload mimics a required workflow', () => {
  const validRuns = successfulRuns();

  const ownRun = runFor(REQUIRED_WORKFLOWS[0], 59, {
    id: CURRENT_RUN_ID,
    created_at: '2026-08-27T19:59:00Z',
    conclusion: 'failure',
  });
  assert.equal(evaluate([...validRuns, ownRun]).verdict, 'PASS');

  validRuns.shift();

  const withoutIndependentRun = evaluate([...validRuns, ownRun]);
  assert.equal(withoutIndependentRun.verdict, 'WAIT');
  assert.equal(withoutIndependentRun.workflows[0].runId, null);
});

test('polling is deterministic and passes only after the absent and running phases', async () => {
  const snapshots = [
    successfulRuns().slice(1),
    successfulRuns().map((run, index) => (index === 0 ? { ...run, status: 'in_progress', conclusion: null } : run)),
    successfulRuns(),
  ];

  let clock = 0;
  let loads = 0;

  const sleeps = [];

  const result = await waitForRequiredWorkflows({
    targetSha: SHA,
    currentRunId: CURRENT_RUN_ID,
    loadRuns: async () => snapshots[Math.min(loads++, snapshots.length - 1)],
    timeoutMs: 5_000,
    pollIntervalMs: 1_000,
    now: () => clock,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      clock += milliseconds;
    },
    log: () => {},
  });

  assert.equal(result.verdict, 'PASS');
  assert.equal(loads, 3);
  assert.deepEqual(sleeps, [1_000, 1_000]);
});

test('an absent workflow reaches a bounded deterministic timeout', async () => {
  let clock = 0;
  let loads = 0;

  const sleeps = [];

  await assert.rejects(
    waitForRequiredWorkflows({
      targetSha: SHA,
      currentRunId: CURRENT_RUN_ID,
      loadRuns: async () => {
        loads += 1;
        return successfulRuns().slice(1);
      },
      timeoutMs: 2_500,
      pollIntervalMs: 1_000,
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      log: () => {},
    }),
    (error) =>
      error instanceof ReleaseGateDecisionError &&
      error.evaluation.verdict === 'WAIT' &&
      /did not all succeed/u.test(error.message),
  );

  assert.equal(loads, 4);
  assert.deepEqual(sleeps, [1_000, 1_000, 500]);
});

test('a cancelled run fails fast without sleeping for the timeout', async () => {
  const runs = successfulRuns();
  runs[0] = { ...runs[0], conclusion: 'cancelled' };

  let slept = false;

  await assert.rejects(
    waitForRequiredWorkflows({
      targetSha: SHA,
      currentRunId: CURRENT_RUN_ID,
      loadRuns: async () => runs,
      timeoutMs: 5_000,
      pollIntervalMs: 1_000,
      now: () => 0,
      sleep: async () => {
        slept = true;
      },
      log: () => {},
    }),
    ReleaseGateDecisionError,
  );
  assert.equal(slept, false);
});

test('the API loader follows bounded pagination and sends the token only in a header', async () => {
  const requested = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));

  const fetchImpl = async (url, options) => {
    requested.push({ url: String(url), options });

    const page = new URL(url).searchParams.get('page');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_count: 101,
        workflow_runs: page === '1' ? firstPage : [{ id: 101 }],
      }),
    };
  };

  const runs = await listWorkflowRunsForSha({
    repository: 'openaxcloud/vibecore',
    targetSha: SHA,
    token: 'test-token',
    fetchImpl,
  });
  assert.equal(runs.length, 101);
  assert.equal(requested.length, 2);
  assert.match(requested[0].url, new RegExp(`head_sha=${SHA}`, 'u'));
  assert.doesNotMatch(requested[0].url, /test-token/u);
  assert.equal(requested[0].options.headers.authorization, 'Bearer test-token');
});

test('the API loader retries transient server errors but not an authorization refusal', async () => {
  let transientAttempts = 0;

  const retrySleeps = [];

  const runs = await listWorkflowRunsForSha({
    repository: 'openaxcloud/vibecore',
    targetSha: SHA,
    token: 'test-token',
    fetchImpl: async () => {
      transientAttempts += 1;

      if (transientAttempts === 1) {
        return { ok: false, status: 503 };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ total_count: 0, workflow_runs: [] }),
      };
    },
    sleep: async (milliseconds) => retrySleeps.push(milliseconds),
  });
  assert.deepEqual(runs, []);
  assert.equal(transientAttempts, 2);
  assert.deepEqual(retrySleeps, [1_000]);

  let forbiddenAttempts = 0;
  await assert.rejects(
    listWorkflowRunsForSha({
      repository: 'openaxcloud/vibecore',
      targetSha: SHA,
      token: 'test-token',
      fetchImpl: async () => {
        forbiddenAttempts += 1;
        return { ok: false, status: 403 };
      },
      sleep: async () => assert.fail('403 must not be retried'),
    }),
    /HTTP 403/u,
  );
  assert.equal(forbiddenAttempts, 1);
});

test('CLI parsing refuses mutable short SHAs and unbounded polling values', () => {
  assert.throws(
    () => parseArguments(['--sha', SHA.slice(0, 10), '--repository', 'openaxcloud/vibecore', '--current-run-id', '1']),
    /full lowercase 40-hex/u,
  );
  assert.throws(
    () =>
      parseArguments([
        '--sha',
        SHA,
        '--repository',
        'openaxcloud/vibecore',
        '--current-run-id',
        '1',
        '--timeout-seconds',
        '999999',
      ]),
    /timeout seconds/u,
  );
});

function workflowWiringProblems(source) {
  const problems = [];
  const topPermissions = source.match(/^permissions:\n(?<body>(?: {2}.+\n)+)/mu)?.groups?.body ?? '';
  const firstJob = source.match(/^jobs:\n(?:(?:  #.*)?\n)*  (?<name>[a-z0-9-]+):/mu)?.groups?.name;
  const dispatch = source.match(/^  workflow_dispatch:\n(?<body>[\s\S]*?)(?=^permissions:)/mu)?.groups?.body;
  const releaseGate = source.match(/^  release-gate:\n(?<body>[\s\S]*?)(?=^  preflight-gates:)/mu)?.groups?.body;
  const preflight = source.match(/^  preflight-gates:\n(?<body>[\s\S]*?)(?=^  build-and-deploy:)/mu)?.groups?.body;
  const deploy = source.match(/^  build-and-deploy:\n(?<body>[\s\S]*)/mu)?.groups?.body;

  if (firstJob !== 'release-gate') {
    problems.push('release-gate must be the first job');
  }

  if (/id-token:\s*write/u.test(topPermissions)) {
    problems.push('workflow-wide OIDC is forbidden');
  }

  if (!dispatch || !/target_sha:/u.test(dispatch) || /\n      short_sha:/u.test(dispatch)) {
    problems.push('dispatch must accept only a full target_sha');
  }

  if (!releaseGate) {
    problems.push('release-gate job is missing');
  } else {
    if (!/permissions:\n      actions: read\n      contents: read/u.test(releaseGate)) {
      problems.push('release-gate needs read-only GitHub permissions');
    }

    if (/id-token:\s*write|google-github-actions\/auth|\bgcloud\b|\bhelm\b|\bkubectl\b/u.test(releaseGate)) {
      problems.push('release-gate must not have cloud credentials or commands');
    }

    if (!/node scripts\/wait-for-required-workflows\.mjs/u.test(releaseGate)) {
      problems.push('release-gate does not execute the exact-SHA waiter');
    }
  }

  if (!preflight || !/needs: \[release-gate\]/u.test(preflight)) {
    problems.push('preflight must wait for release-gate');
  }

  if (!deploy || !/needs: \[release-gate, preflight-gates\]/u.test(deploy)) {
    problems.push('deploy must directly wait for release-gate and preflight');
  }

  if (!deploy || !/permissions:\n      contents: read\n      id-token: write/u.test(deploy)) {
    problems.push('only deploy receives the OIDC permission');
  }

  const pinnedCheckouts =
    source.match(/ref: \$\{\{ (?:steps\.target|needs\.release-gate)\.outputs\.target_sha \}\}/gu) ?? [];

  if (pinnedCheckouts.length !== 3) {
    problems.push('all three jobs must check out the bound target SHA');
  }

  if (!/SHORT_SHA: \$\{\{ needs\.release-gate\.outputs\.short_sha \}\}/u.test(deploy ?? '')) {
    problems.push('deploy image tag must come from the gate output');
  }

  return problems;
}

test('the production workflow structurally wires the credential-free first gate', () => {
  const source = readFileSync(new URL('../.github/workflows/deploy-main.yml', import.meta.url), 'utf8');
  assert.deepEqual(workflowWiringProblems(source), []);

  const mutations = [
    ['first job', '  release-gate:', '  renamed-release-gate:'],
    ['workflow OIDC', 'permissions:\n  contents: read', 'permissions:\n  contents: read\n  id-token: write'],
    ['gate dependency', 'needs: [release-gate, preflight-gates]', 'needs: [preflight-gates]'],
    ['immutable checkout', 'ref: ${{ needs.release-gate.outputs.target_sha }}', 'ref: main'],
    ['derived tag', 'SHORT_SHA: ${{ needs.release-gate.outputs.short_sha }}', 'SHORT_SHA: latest'],
  ];

  for (const [label, needle, replacement] of mutations) {
    const mutated = source.replace(needle, replacement);
    assert.notEqual(mutated, source, `${label} mutation fixture must match`);
    assert.ok(workflowWiringProblems(mutated).length > 0, `${label} mutation must be caught`);
  }
});
