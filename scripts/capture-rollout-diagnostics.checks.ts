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
  /*
   * CE QUI EST PROTÉGÉ ICI, C'EST L'ORDRE DES TROIS HORLOGES — PAS LA VALEUR 10.
   *
   * L'assertion valait `/--timeout 10m/`. Elle a été remplacée le 2026-10-11 parce
   * qu'elle épinglait un nombre là où la propriété qui compte est une RELATION :
   *
   *     hook de migration  <  délai de progrès K8s  <  budget Helm
   *
   * Si deux de ces horloges expirent ensemble, celle qui rend l'erreur n'est pas
   * celle qui connaît la cause ; et si le budget expire AVANT le délai de progrès,
   * `--atomic` annule un rollout que Kubernetes considère encore comme en cours.
   * C'est mesuré : le 2026-09-04 (run 1453), hook et Helm étaient tous deux à 600 s,
   * et le rollback atomique a emporté le Job de migration avant que quiconque puisse
   * lire pourquoi.
   *
   * Un littéral rougit donc à chaque ajustement LÉGITIME du budget — c'est arrivé le
   * 2026-10-11 en portant la grâce des pods à 600 s pour qu'un tour d'agent en cours
   * (2 à 4 min) finisse avant que son pod disparaisse. Les trois valeurs sont lues
   * depuis leur source, de sorte que le garde suive les ajustements et n'accepte
   * jamais un ordre incohérent.
   */
  const secondes = (v: string): number =>
    v.endsWith('m') ? Number(v.slice(0, -1)) * 60 : Number(v.replace(/s$/u, ''));

  const budgetBrut = /--timeout (\d+[ms])/u.exec(upgrade);
  assert.ok(budgetBrut, 'le budget de l’upgrade atomique doit rester explicite');
  const budget = secondes(budgetBrut[1]!);

  const hookBrut = /activeDeadlineSeconds:\s*(\d+)/u.exec(
    readFileSync('infra/helm/platform/templates/migrations-job.yaml', 'utf8'),
  );
  assert.ok(hookBrut, 'le hook de migration doit garder un activeDeadlineSeconds');
  const hook = Number(hookBrut[1]);

  const progresBrut = /progressDeadlineSeconds:[^\n]*?default (\d+)/u.exec(
    readFileSync('infra/helm/platform/templates/deployments.yaml', 'utf8'),
  );
  assert.ok(progresBrut, 'les Deployments doivent garder un progressDeadlineSeconds explicite');
  const progres = Number(progresBrut[1]);

  assert.ok(
    hook < progres,
    `le hook (${hook}s) doit expirer AVANT le délai de progrès (${progres}s), sinon l’erreur rendue n’est pas celle qui connaît la cause`,
  );
  assert.ok(
    progres < budget,
    `le délai de progrès (${progres}s) doit expirer AVANT le budget Helm (${budget}s), sinon --atomic annule un rollout encore en cours`,
  );
  const upload = workflow.split('- name: Upload rollout status evidence')[1].split('- name:')[0];
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /\$\{\{ runner.temp \}\}\/rollout-status.jsonl/);
  assert.match(workflow, /node --test scripts\/capture-rollout-diagnostics.checks.bundle.mjs/);
});
