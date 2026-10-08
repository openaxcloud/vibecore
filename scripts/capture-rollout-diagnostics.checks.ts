import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { capture, summarize, type Snapshot } from './capture-rollout-diagnostics.js';

function temporary<T>(action: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'rollout-diagnostics-'));
  return action(directory).finally(() => rmSync(directory, { recursive: true, force: true }));
}

test('only selected status fields of release resources are retained', () => {
  const result = summarize(
    [
      {
        kind: 'Pod',
        metadata: { name: 'vibecore-vibecore-platform-api-123', annotations: { secret: 'PRIVATE' } },
        spec: { containers: [{ env: [{ value: 'PRIVATE' }] }] },
        status: {
          phase: 'Running',
          conditions: [{ type: 'Ready', status: 'False', message: 'PRIVATE' }],
          containerStatuses: [
            {
              name: 'api',
              ready: false,
              restartCount: 3,
              state: { waiting: { reason: 'CrashLoopBackOff', message: 'PRIVATE' } },
              lastState: { terminated: { reason: 'OOMKilled', exitCode: 137, message: 'PRIVATE' } },
            },
          ],
        },
      },
      { kind: 'Pod', metadata: { name: 'other-api' }, status: { phase: 'PRIVATE' } },
    ],
    'vibecore',
  );
  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(result[0].containers[0].lastState.terminated.reason, 'OOMKilled');
});

test('migration, init containers and malformed API fields are handled', () => {
  const result = summarize(
    [
      {
        kind: 'Job',
        metadata: { name: 'vibecore-vibecore-platform-prisma-migrate' },
        status: { failed: 1, conditions: [{ type: 'Failed', status: 'True', reason: 'DeadlineExceeded' }] },
      },
      {
        kind: 'Pod',
        metadata: { name: 'vibecore-vibecore-platform-api-123' },
        status: {
          initContainerStatuses: [{ name: 'init', state: { terminated: { exitCode: 1 } } }],
          phase: { secret: 'PRIVATE' },
        },
      },
      null,
    ],
    'vibecore',
  );
  assert.equal(result[0].conditions[0].reason, 'DeadlineExceeded');
  assert.equal(result[1].containers[0].state.terminated.exitCode, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

for (const code of [0, 1, 23]) {
  test(`real child exit ${code} and evidence predating rollback are preserved`, () =>
    temporary(async (directory) => {
      const output = join(directory, 'status.jsonl');
      let calls = 0;
      const snapshot = async (): Promise<Snapshot> => {
        calls += 1;
        return {
          resources:
            calls === 2
              ? [{ kind: 'Pod', name: 'failed-api', status: { phase: 'Pending' }, conditions: [], containers: [] }]
              : [],
        };
      };
      const result = await capture({
        command: [process.execPath, '-e', `setTimeout(() => process.exit(${code}), 80)`],
        namespace: 'vibecore',
        release: 'vibecore',
        output,
        snapshot,
        intervalMs: 10,
      });
      const evidence = readFileSync(output, 'utf8');
      assert.equal(result, code);
      assert.match(evidence, /failed-api/);
      assert.match(evidence, new RegExp(`"commandExitCode":${code}`));
      assert.match(evidence, /"evidenceComplete":true/);
      assert.match(evidence, /"commandStarted":true/);
    }));

  test(`disk failure after spawn still waits for real Helm exit ${code}`, () =>
    temporary(async (directory) => {
      const sentinel = join(directory, 'helm-finished');
      let writes = 0;
      const warnings: string[] = [];
      const result = await capture({
        command: [
          process.execPath,
          '-e',
          'setTimeout(() => { require("fs").writeFileSync(process.argv[1], "finished"); process.exit(Number(process.argv[2])); }, 80)',
          sentinel,
          String(code),
        ],
        namespace: 'vibecore',
        release: 'vibecore',
        output: join(directory, 'status.jsonl'),
        intervalMs: 10,
        snapshot: async () => ({ resources: [] }),
        write: (fd, value) => {
          if (++writes >= 3) throw new Error('simulated disk full');
          writeFileSync(fd, value);
        },
        warn: (value) => warnings.push(value),
      });
      assert.equal(result, code);
      assert.equal(readFileSync(sentinel, 'utf8'), 'finished');
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /waiting for Helm/);
    }));
}

test('unwritable initial evidence prevents starting Helm', () =>
  temporary(async (directory) => {
    const sentinel = join(directory, 'should-not-exist');
    await assert.rejects(
      capture({
        command: [process.execPath, '-e', 'require("fs").writeFileSync(process.argv[1], "started")', sentinel],
        namespace: 'vibecore',
        release: 'vibecore',
        output: directory,
      }),
    );
    assert.throws(() => readFileSync(sentinel));
  }));

test('snapshot errors after spawn cannot detach a running child', () =>
  temporary(async (directory) => {
    let calls = 0;
    const output = join(directory, 'status.jsonl');
    const code = await capture({
      command: [process.execPath, '-e', 'setTimeout(() => process.exit(23), 80)'],
      namespace: 'vibecore',
      release: 'vibecore',
      output,
      intervalMs: 10,
      snapshot: async () => {
        if (++calls > 1) throw new Error('PRIVATE');
        return { resources: [] };
      },
    });
    assert.equal(code, 23);
    const evidence = readFileSync(output, 'utf8');
    assert.match(evidence, /SnapshotFailed/);
    assert.equal(evidence.includes('PRIVATE'), false);
  }));

test('workflow captures the atomic upgrade and uploads on failure', () => {
  const workflow = readFileSync('.github/workflows/deploy-main.yml', 'utf8');
  const upgrade = workflow
    .split('- name: Helm upgrade (all services pinned by digest)')[1]
    .split('- name: Verify rollout')[0];
  assert.match(upgrade, /node scripts\/capture-rollout-diagnostics\.bundle\.mjs/);
  assert.match(upgrade, /--atomic/);
  assert.match(upgrade, /--timeout 10m/);
  const upload = workflow.split('- name: Upload rollout status evidence')[1].split('- name:')[0];
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /\$\{\{ runner.temp \}\}\/rollout-status.jsonl/);
  assert.match(workflow, /node --test scripts\/capture-rollout-diagnostics.checks.bundle.mjs/);
});
