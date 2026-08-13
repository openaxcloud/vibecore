/*
 * P104 / SEC-8 — replayable proof of the DEPLOY WORKFLOW's activation decision.
 *
 * The barrier itself is proven in deploy-cache-window.spec.mjs. This file proves
 * the thing that decides whether the barrier runs at all — and it does so by
 * EXECUTING THE ACTUAL SHELL out of .github/workflows/deploy-main.yml at this
 * commit, not a paraphrase of it. The step's `run:` block is parsed straight from
 * the YAML and run under bash against a fake `kubectl` and a fake source tree, so
 * the assertions below are bound to the shipped workflow: edit the step and these
 * tests move with it or fail.
 *
 * Also asserts the surrounding wiring the decision depends on (step order, `if:`
 * guards, the `--set-string` that carries the phase-1 value), because a correct
 * decision plugged in at the wrong point in the job proves nothing.
 *
 * Run: pnpm vitest --run scripts/deploy-activation-sequencing.spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/deploy-main.yml');

const workflow = parseYaml(readFileSync(WORKFLOW_PATH, 'utf8'));
const steps = workflow.jobs['build-and-deploy'].steps;
const stepByName = (name) => steps.find((s) => s.name === name);
const indexOfStep = (name) => steps.findIndex((s) => s.name === name);

const CUTOVER_STEP = 'Detect password-activation cutover (SEC-8)';
const BARRIER_STEP = 'Drain barrier — outlast the legacy public max-age (SEC-8)';
const PHASE2_STEP = 'Phase 2 — arm password activation (SEC-8)';
const UPGRADE_STEP = 'Helm upgrade (web + runtime image tags)';
const VERIFY_STEP = 'Verify the activation interlock state (SEC-8)';

/**
 * Run the real `run:` script of the cutover step in a sandbox.
 *
 * @param {object} o
 * @param {string|null} o.liveFlag  what `kubectl get configmap` prints; null = the
 *                                  command fails outright (no such configmap).
 * @param {boolean} o.codeHasInterlock  whether the fake services/api/src mentions it.
 * @returns {{outputs: Record<string,string>, stdout: string}}
 */
function runCutoverStep({ liveFlag, codeHasInterlock, shaMismatch = false, interlockOnlyInSpec = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'sec8-cutover-'));

  try {
    /*
     * A REAL miniature repo, not a stub: the step now runs
     * scripts/verify-prod-interlock.mjs, which walks the production module graph
     * from services/api/src/server.ts and needs a git HEAD for its exact-SHA
     * gate. Filler modules put the graph over the verifier's plausibility floor
     * so the fixture exercises the real check rather than tripping the floor.
     */
    const src = join(dir, 'services/api/src');
    mkdirSync(join(src, 'tests'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(
      join(REPO_ROOT, 'scripts/verify-prod-interlock.mjs'),
      join(dir, 'scripts/verify-prod-interlock.mjs'),
    );

    const FILLERS = 60;

    for (let i = 0; i < FILLERS; i += 1) {
      writeFileSync(join(src, `m${i}.ts`), `export const m${i} = ${i};\n`);
    }

    writeFileSync(join(src, 'server.ts'), "import { buildApiApp } from './app.js';\nbuildApiApp();\n");
    writeFileSync(
      join(src, 'app.ts'),
      [
        ...Array.from({ length: FILLERS }, (_, i) => `import './m${i}.js';`),
        'export function buildApiApp() {',
        codeHasInterlock
          ? "  if (process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED !== '1') { return 503; }"
          : '  // pre-cutover api code, no interlock at all',
        '}',
      ].join('\n'),
    );

    /*
     * The reported defect: the token present ONLY in a spec file. The old grep
     * matched it; the production-graph verifier must not.
     */
    writeFileSync(
      join(src, 'tests/deployment-password.spec.ts'),
      interlockOnlyInSpec
        ? "it('x', () => { process.env.DEPLOYMENT_ACCESS_ACTIVATION_ENABLED = '1'; });\n"
        : "it('x', () => {});\n",
    );

    for (const cmd of [
      ['init', '-q'],
      ['config', 'user.email', 'sec9@test'],
      ['config', 'user.name', 'sec9'],
      ['add', '-A'],
      ['commit', '-qm', 'fixture'],
    ]) {
      execFileSync('git', cmd, { cwd: dir, stdio: 'ignore' });
    }

    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const shortSha = shaMismatch ? 'deadbeef01' : headSha.slice(0, 10);

    // Fake kubectl: prints the live flag, or exits non-zero to model an absent key.
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const kubectl = join(bin, 'kubectl');
    writeFileSync(
      kubectl,
      liveFlag === null ? '#!/bin/sh\nexit 1\n' : `#!/bin/sh\nprintf '%s' '${liveFlag}'\n`,
    );
    chmodSync(kubectl, 0o755);

    const outputFile = join(dir, 'github_output');
    writeFileSync(outputFile, '');

    const script = stepByName(CUTOVER_STEP).run;
    const stdout = execFileSync('bash', ['-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_OUTPUT: outputFile,
        HELM_NAMESPACE: 'vibecore',
        HELM_RELEASE: 'vibecore',
        SHORT_SHA: shortSha,
        RUNNER_TEMP: dir,
      },
    });

    const outputs = Object.fromEntries(
      readFileSync(outputFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const eq = line.indexOf('=');
          return [line.slice(0, eq), line.slice(eq + 1)];
        }),
    );

    return { outputs, stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('deploy-main.yml — SEC-8 activation decision (real step, executed)', () => {
  it('THE CUTOVER: post-cutover code + flag never set -> barrier runs, phase 1 closed, ends armed', () => {
    const { outputs } = runCutoverStep({ liveFlag: '', codeHasInterlock: true });

    expect(outputs).toMatchObject({ barrier: 'true', phase1_flag: '0', final_flag: '1' });
  });

  it('configmap key entirely absent (kubectl fails) is treated as NOT armed, not as an error', () => {
    const { outputs } = runCutoverStep({ liveFlag: null, codeHasInterlock: true });

    expect(outputs).toMatchObject({ barrier: 'true', phase1_flag: '0', final_flag: '1' });
  });

  it("RE-ARM: flag explicitly '0' (post-rollback) runs the barrier again", () => {
    const { outputs } = runCutoverStep({ liveFlag: '0', codeHasInterlock: true });

    expect(outputs).toMatchObject({ barrier: 'true', phase1_flag: '0', final_flag: '1' });
  });

  it("STEADY STATE: flag already '1' skips the barrier but RE-ASSERTS the value", () => {
    const { outputs } = runCutoverStep({ liveFlag: '1', codeHasInterlock: true });

    // phase1_flag must be '1', not empty: --reuse-values would otherwise freeze
    // whatever the release stores, which is how an interlock silently rots.
    expect(outputs).toMatchObject({ barrier: 'false', phase1_flag: '1', final_flag: '1' });
  });

  it('SEC-9 THE REPORTED DEFECT: interlock only in the SPEC must NOT count as present', () => {
    /*
     * Production route stripped of the interlock, spec file still carrying the
     * string. The old `grep -rq ... services/api/src` matched and reported
     * "steady state" — arming activation against an api with no interlock. The
     * production-graph verifier must see through it and DISARM instead.
     */
    const { outputs, stdout } = runCutoverStep({
      liveFlag: '1',
      codeHasInterlock: false,
      interlockOnlyInSpec: true,
    });

    expect(outputs).toMatchObject({ barrier: 'false', phase1_flag: '0', final_flag: '0' });
    expect(stdout).toContain('PRODUCTION BUNDLE');
    expect(stdout).not.toContain('Steady state');
  });

  it('SEC-9 exact-SHA gate: a tree that is not the deployed image cannot certify anything', () => {
    const { outputs, stdout } = runCutoverStep({ liveFlag: '1', codeHasInterlock: true, shaMismatch: true });

    // Interlock genuinely present, but we cannot prove it for the image being
    // deployed -> fail closed rather than trust a verdict about another tree.
    expect(outputs).toMatchObject({ barrier: 'false', phase1_flag: '0', final_flag: '0' });
    expect(stdout).toContain('exact-SHA gate');
  });

  it('deploying PRE-cutover code disarms the flag and warns loudly', () => {
    const { outputs, stdout } = runCutoverStep({ liveFlag: '1', codeHasInterlock: false });

    // Never leave the flag armed for code that ignores it and re-emits max-age=60,
    // and make sure the next post-cutover deploy is treated as a fresh cutover.
    expect(outputs).toMatchObject({ barrier: 'false', phase1_flag: '0', final_flag: '0' });
    expect(stdout).toContain('::warning::');
    expect(stdout).toContain('reverts the deployment-password cache fix');
  });

  it('never emits final_flag=1 without either a barrier this run or one already done', () => {
    const cases = [
      { liveFlag: '', codeHasInterlock: true },
      { liveFlag: null, codeHasInterlock: true },
      { liveFlag: '0', codeHasInterlock: true },
      { liveFlag: '1', codeHasInterlock: true },
      { liveFlag: '1', codeHasInterlock: false },
      { liveFlag: 'garbage', codeHasInterlock: true },
    ];

    for (const c of cases) {
      const { outputs } = runCutoverStep(c);

      if (outputs.final_flag === '1') {
        // Armed => the barrier ran now, or the live flag was already '1' (which
        // only a previous run's barrier could have produced).
        expect(outputs.barrier === 'true' || c.liveFlag === '1').toBe(true);
      }

      // Phase 1 may never be MORE open than the end state.
      expect(Number(outputs.phase1_flag)).toBeLessThanOrEqual(Number(outputs.final_flag));
    }
  });
});

describe('deploy-main.yml — SEC-8 wiring', () => {
  it('orders the steps so activation is armed only after rollout AND barrier', () => {
    const order = [UPGRADE_STEP, 'Verify rollout', BARRIER_STEP, PHASE2_STEP, VERIFY_STEP].map(indexOfStep);

    expect(order.every((i) => i >= 0)).toBe(true);
    expect(indexOfStep(CUTOVER_STEP)).toBeLessThan(indexOfStep(UPGRADE_STEP));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('runs the barrier and phase 2 under the SAME guard, so neither can run alone', () => {
    const guard = "steps.cutover.outputs.barrier == 'true'";

    expect(stepByName(BARRIER_STEP).if).toBe(guard);
    expect(stepByName(PHASE2_STEP).if).toBe(guard);
  });

  it('passes the phase-1 value into the first helm upgrade explicitly', () => {
    expect(stepByName(UPGRADE_STEP).run).toContain(
      'platformEnv.runtime.deploymentAccessActivationEnabled=${{ steps.cutover.outputs.phase1_flag }}',
    );
  });

  it('arms the flag ONLY in phase 2, and nowhere else in the job', () => {
    const arming = steps.filter((s) => typeof s.run === 'string' && s.run.includes('deploymentAccessActivationEnabled=1'));

    expect(arming.map((s) => s.name)).toEqual([PHASE2_STEP]);
  });

  it('verifies the interlock against the live cluster unconditionally', () => {
    const verify = stepByName(VERIFY_STEP);

    expect(verify.if).toBeUndefined();
    expect(verify.run).toContain('DEPLOYMENT_ACCESS_ACTIVATION_ENABLED');
    expect(verify.run).toContain('steps.cutover.outputs.final_flag');
  });

  it('SEC-10: refuses to arm unless the running api image is the certified commit', () => {
    /*
     * The barrier compares pods against "the image the Deployment wants", which on
     * a run that did not rebuild the runtime tier can still be PRE-cutover code.
     * It would then find nothing older, clear, and phase 2 would arm activation
     * against an api with no interlock. Executing the guard rather than trusting
     * the comment: run the step's shell against a fake kubectl that reports a
     * mismatched image, and require a non-zero exit.
     */
    const dir = mkdtempSync(join(tmpdir(), 'sec10-'));

    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      const kubectl = join(bin, 'kubectl');
      // Reports an api image built from a DIFFERENT commit than SHORT_SHA.
      writeFileSync(kubectl, '#!/bin/sh\nprintf "%s" "eu.pkg.dev/p/r/api:oldsha0000"\n');
      chmodSync(kubectl, 0o755);

      const script = stepByName(BARRIER_STEP).run;
      let code = 0;
      let out = '';

      try {
        out = execFileSync('bash', ['-c', script], {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            HELM_NAMESPACE: 'vibecore',
            HELM_RELEASE: 'vibecore',
            SHORT_SHA: 'newsha1234',
          },
        });
      } catch (error) {
        code = error.status ?? 1;
        out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      }

      expect(code).not.toBe(0);
      expect(out).toContain('SEC-10');
      expect(out).toMatch(/not built from the commit whose production bundle was certified/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('waits longer than the legacy max-age it has to outlast', () => {
    const barrier = stepByName(BARRIER_STEP);

    expect(Number(barrier.env.LEGACY_MAX_AGE_SECONDS)).toBe(60);
    expect(Number(barrier.env.SAFETY_MARGIN_SECONDS)).toBeGreaterThan(0);
    expect(Number(barrier.env.LEGACY_MAX_AGE_SECONDS) + Number(barrier.env.SAFETY_MARGIN_SECONDS)).toBeGreaterThan(60);
    // The barrier must be able to give up (and stay fail-closed) inside the job.
    expect(Number(barrier.env.MAX_WAIT_SECONDS)).toBeLessThan(workflow.jobs['build-and-deploy']['timeout-minutes'] * 60);
  });

  it('blocks the deploy on the chart render test for the interlock', () => {
    const render = stepByName('Helm render test — password-activation interlock (blocking)');

    expect(render.run).toContain('scripts/validate-helm-access-activation-flag.mjs');
    expect(indexOfStep('Helm render test — password-activation interlock (blocking)')).toBeLessThan(indexOfStep(UPGRADE_STEP));
  });
});
