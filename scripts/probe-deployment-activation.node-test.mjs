import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts/probe-deployment-activation.sh');
const SCRIPT_SOURCE = readFileSync(SCRIPT_PATH, 'utf8');
const WORKFLOW_SOURCE = readFileSync(join(REPO_ROOT, '.github/workflows/deploy-main.yml'), 'utf8');

function parseOutputs(text) {
  return Object.fromEntries(
    text
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function runProbe({ stdout = '', stderr = '', status = 0, cleanupStatus = 0, source = SCRIPT_SOURCE } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sec9-probe-test-'));

  try {
    const script = join(directory, 'probe.sh');
    const kubectl = join(directory, 'kubectl');
    const output = join(directory, 'github-output');
    const calls = join(directory, 'kubectl-calls');
    writeFileSync(script, source);
    writeFileSync(output, '');
    writeFileSync(calls, '');
    writeFileSync(
      kubectl,
      `#!/bin/sh
printf '%s\\n' "$*" >>"\${FAKE_CALLS}"
case " $* " in
  *" run "*)
    printf '%s' "\${FAKE_STDOUT}"
    printf '%s' "\${FAKE_STDERR}" >&2
    exit "\${FAKE_STATUS}"
    ;;
  *" delete pod "*) exit "\${FAKE_CLEANUP_STATUS}" ;;
  *) exit 97 ;;
esac
`,
    );
    chmodSync(kubectl, 0o755);

    const result = spawnSync('bash', [script], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        FAKE_CALLS: calls,
        FAKE_STDOUT: stdout,
        FAKE_STDERR: stderr,
        FAKE_STATUS: String(status),
        FAKE_CLEANUP_STATUS: String(cleanupStatus),
        GITHUB_OUTPUT: output,
        GITHUB_RUN_ID: '33099868198',
        GITHUB_RUN_ATTEMPT: '2',
        HELM_NAMESPACE: 'vibecore',
        HELM_RELEASE: 'vibecore',
      },
    });

    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      outputs: parseOutputs(readFileSync(output, 'utf8')),
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function hasExactCleanup(result) {
  const deletes = result.calls.filter((call) => call.includes(' delete pod '));
  return (
    deletes.length === 1 &&
    deletes[0].includes('delete pod sec9-probe-33099868198-2 ') &&
    !deletes[0].includes('--all') &&
    !deletes[0].includes(' -l ') &&
    !deletes[0].includes('--selector')
  );
}

test('a real non-2xx response is conclusive, armable and cleaned up by exact pod name', () => {
  const result = runProbe({ stdout: '403\n' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.outputs, { armable: 'true', result: 'refused', http_code: '403' });
  assert.match(result.stdout, /command status: 0/u);
  assert.match(result.stdout, /refused activation with HTTP 403/u);
  assert.equal(hasExactCleanup(result), true);
});

test('a real 2xx response is a blocking security failure and never armable', () => {
  const result = runProbe({ stdout: '204\n' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.outputs, {
    armable: 'false',
    result: 'unsafe-success',
    http_code: '204',
  });
  assert.match(result.stderr, /PHASE-1 PROBE FAILED/u);
  assert.equal(hasExactCleanup(result), true);
});

test('the live non-zero kubectl outcome is explicit, inconclusive and non-fatal to rollout', () => {
  const result = runProbe({
    status: 1,
    stderr: 'error: timed out waiting for the condition\n',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.outputs, {
    armable: 'false',
    result: 'inconclusive',
    http_code: '',
  });
  assert.match(result.stdout, /command status: 1/u);
  assert.match(result.stdout, /PROBE INCONCLUSIVE/u);
  assert.match(result.stderr, /timed out waiting/u);
  assert.equal(hasExactCleanup(result), true);
});

test('HTTP 000 and malformed output are inconclusive even when kubectl exits zero', () => {
  for (const output of ['000\n', '', '403\npod/sec9-probe']) {
    const result = runProbe({ stdout: output });
    assert.equal(result.status, 0, `output ${JSON.stringify(output)} must not fail the rollout`);
    assert.equal(result.outputs.armable, 'false');
    assert.equal(result.outputs.result, 'inconclusive');
  }
});

test('cleanup failure cannot overwrite a conclusive safe refusal', () => {
  const result = runProbe({ stdout: '503\n', cleanupStatus: 1 });
  assert.equal(result.status, 0);
  assert.equal(result.outputs.armable, 'true');
  assert.equal(hasExactCleanup(result), true);
});

test('mutation guards prove status capture, 2xx rejection, fail-closed output and exact cleanup are load-bearing', () => {
  const mutations = [
    {
      name: 'remove set-e suspension around kubectl',
      source: SCRIPT_SOURCE.replace('set +e\nkubectl ', 'kubectl '),
      scenario: { status: 1, stderr: 'attach failed' },
      accepted: (result) => result.status === 0 && result.outputs.armable === 'false',
    },
    {
      name: 'stop recognising 2xx',
      source: SCRIPT_SOURCE.replace('  2*)', '  9*)'),
      scenario: { stdout: '204\n' },
      accepted: (result) => result.status !== 0 && result.outputs.armable === 'false',
    },
    {
      name: 'arm after an inconclusive probe',
      source: SCRIPT_SOURCE.replace("publish_result 'false' 'inconclusive'", "publish_result 'true' 'inconclusive'"),
      scenario: { status: 1 },
      accepted: (result) => result.status === 0 && result.outputs.armable === 'false',
    },
    {
      name: 'replace exact cleanup with global deletion',
      source: SCRIPT_SOURCE.replace('delete pod "${PROBE_POD_NAME}"', 'delete pod --all'),
      scenario: { stdout: '403\n' },
      accepted: hasExactCleanup,
    },
  ];

  for (const mutation of mutations) {
    assert.notEqual(mutation.source, SCRIPT_SOURCE, `${mutation.name} fixture must match`);

    const baseline = runProbe(mutation.scenario);
    assert.equal(mutation.accepted(baseline), true, `${mutation.name}: baseline contract`);

    const mutant = runProbe({ ...mutation.scenario, source: mutation.source });
    assert.equal(mutation.accepted(mutant), false, `${mutation.name}: mutant must be killed`);
  }
});

function workflowProbeProblems(source) {
  const problems = [];

  const probe = source.match(
    /^      - name: Runtime probe — deployed api refuses activation in phase 1 \(SEC-9\)\n(?<body>[\s\S]*?)(?=^      - name: Drain barrier)/mu,
  )?.groups?.body;
  const phase2 = source.match(
    /^      - name: Phase 2 — arm password activation \(SEC-8\)\n(?<body>[\s\S]*?)(?=^      # D2)/mu,
  )?.groups?.body;
  const verify = source.match(
    /^      - name: Verify the activation interlock state \(SEC-8\)\n(?<body>[\s\S]*?)(?=^      # Notifications)/mu,
  )?.groups?.body;

  if (!probe || !/        id: phase1-probe\n/u.test(probe)) {
    problems.push('runtime probe must publish phase1-probe outputs');
  }

  if (!probe || !/run: bash scripts\/probe-deployment-activation\.sh/u.test(probe)) {
    problems.push('workflow must execute the tested probe script');
  }

  if (!phase2 || !/steps\.phase1-probe\.outputs\.armable == 'true'/u.test(phase2)) {
    problems.push('phase 2 must require a conclusive SEC-9 refusal');
  }

  if (!phase2 || !/steps\.barrier\.outputs\.armable == 'true'/u.test(phase2)) {
    problems.push('phase 2 must retain the SEC-10 binding');
  }

  if (
    !verify ||
    !/steps\.phase1-probe\.outputs\.armable/u.test(verify) ||
    !/steps\.barrier\.outputs\.armable/u.test(verify) ||
    !/WANT='0'/u.test(verify)
  ) {
    problems.push('inconclusive SEC-9/10 outcomes must verify activation remains zero');
  }

  if (!/node --test scripts\/probe-deployment-activation\.node-test\.mjs/u.test(source)) {
    problems.push('preflight must run the probe mutation tests');
  }

  return problems;
}

test('workflow wiring makes SEC-9 armability load-bearing without weakening SEC-10', () => {
  assert.deepEqual(workflowProbeProblems(WORKFLOW_SOURCE), []);

  const mutations = [
    ['probe id', '        id: phase1-probe', '        id: ignored-probe'],
    ['SEC-9 phase2 guard', " && steps.phase1-probe.outputs.armable == 'true'", ''],
    ['SEC-10 phase2 guard', " && steps.barrier.outputs.armable == 'true'", ''],
    ['fail-closed final state', "            WANT='0'", "            WANT='1'"],
  ];

  for (const [label, needle, replacement] of mutations) {
    const mutated = WORKFLOW_SOURCE.replace(needle, replacement);
    assert.notEqual(mutated, WORKFLOW_SOURCE, `${label} mutation fixture must match`);
    assert.ok(workflowProbeProblems(mutated).length > 0, `${label} mutation must be caught`);
  }
});
