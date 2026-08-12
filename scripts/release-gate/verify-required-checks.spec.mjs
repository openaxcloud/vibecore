/**
 * Tests for the exact-SHA release gate decision engine.
 *
 * These are the regression net for a gate whose whole job is to say NO. Every case
 * below is a way a commit could have reached production without a green pipeline —
 * three of them (failure, cancelled, and a required check that never ran) actually
 * did, on 113c17e8 / 9fc8a243 / 3a53b439.
 *
 * The engine is pure by construction, so nothing here touches the network.
 */
import { describe, expect, it } from 'vitest';

import { evaluateRequiredChecks, selfTestCases } from './verify-required-checks.mjs';
import policy from './required-checks.json';

const SHA = '113c17e877d50f40a0a8ba5c2e68aaa027337985';
const OTHER_SHA = '9fc8a243fa1baa61d3f33e2aa6a66c88625ba878';

/** A run for every workflow the shipped policy requires, all green. */
function greenRuns(sha = SHA) {
  return policy.requiredWorkflows.map((wf, i) => ({
    id: 9000 + i,
    workflow_id: wf.id,
    path: wf.path,
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    html_url: `https://example.invalid/run/${9000 + i}`,
  }));
}

function greenJobs(runs) {
  return new Map(
    runs.map((run) => {
      const wf = policy.requiredWorkflows.find((w) => w.id === run.workflow_id);
      return [run.id, wf.requiredJobs.map((name) => ({ name, conclusion: 'success' }))];
    }),
  );
}

describe('release gate — shipped policy', () => {
  it('authorises a commit whose every required workflow and job is green', () => {
    const runs = greenRuns();
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('PASS');
    expect(result.refusals).toEqual([]);
  });

  it('requires CI, E2E, Security and Quality — dropping any one of them is not a PASS', () => {
    const names = policy.requiredWorkflows.map((w) => w.displayName);
    expect(names).toEqual(
      expect.arrayContaining(['Production CI', 'Production E2E', 'Security Analysis', 'Code Quality']),
    );

    for (const wf of policy.requiredWorkflows) {
      const runs = greenRuns().filter((r) => r.workflow_id !== wf.id);
      const result = evaluateRequiredChecks({
        policy,
        targetSha: SHA,
        workflowRuns: runs,
        jobsByRunId: greenJobs(runs),
      });
      expect(result.verdict, `missing ${wf.displayName} must not pass`).not.toBe('PASS');
    }
  });

  it('pins every required workflow by numeric id and file path, never by name alone', () => {
    for (const wf of policy.requiredWorkflows) {
      expect(Number.isInteger(wf.id), `${wf.displayName} needs a numeric workflow id`).toBe(true);
      expect(wf.path).toMatch(/^\.github\/workflows\/.+\.ya?ml$/);
      expect(wf.requiredJobs.length, `${wf.displayName} needs at least one pinned job`).toBeGreaterThan(0);
    }
  });

  it('only accepts push runs on main, so a side-branch or dispatch run cannot authorise a deploy', () => {
    expect(policy.allowedEvents).toEqual(['push']);
    expect(policy.requiredHeadBranch).toBe('main');
  });
});

describe('release gate — the three commits that actually shipped red', () => {
  it('refuses a commit whose CI concluded failure (113c17e8, 9fc8a243)', () => {
    const runs = greenRuns();
    runs[0] = { ...runs[0], conclusion: 'failure' };
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('REFUSE');
    expect(result.refusals.join('\n')).toMatch(/Production CI.*failure/);
  });

  it('refuses a commit whose CI was cancelled (3a53b439)', () => {
    const runs = greenRuns();
    runs[0] = { ...runs[0], conclusion: 'cancelled' };
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('REFUSE');
    expect(result.refusals.join('\n')).toMatch(/cancelled/);
  });

  it('never treats a check that simply never ran as green', () => {
    const runs = greenRuns().filter((r) => r.path !== '.github/workflows/e2e.yml');
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('WAIT'); // and the CLI converts WAIT-at-deadline into REFUSE
    expect(result.waiting.join('\n')).toMatch(/Production E2E/);
  });
});

describe('release gate — cross-commit and tampering defences', () => {
  it('does not let a neighbouring commit green pipeline authorise this commit', () => {
    const runs = greenRuns(OTHER_SHA);
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).not.toBe('PASS');
    expect(result.workflows.every((w) => w.state !== 'PASS')).toBe(true);
  });

  it('refuses when the pinned workflow id executes a different file', () => {
    const runs = greenRuns();
    runs[0] = { ...runs[0], path: '.github/workflows/always-green.yml' };
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('REFUSE');
    expect(result.refusals.join('\n')).toMatch(/workflow identity changed/);
  });

  it('refuses a green run whose required job was deleted (gutted workflow)', () => {
    const runs = greenRuns();
    const jobs = greenJobs(runs);
    jobs.set(runs[0].id, [{ name: 'noop', conclusion: 'success' }]);
    const result = evaluateRequiredChecks({ policy, targetSha: SHA, workflowRuns: runs, jobsByRunId: jobs });
    expect(result.verdict).toBe('REFUSE');
    expect(result.refusals.join('\n')).toMatch(/is absent from the run/);
  });

  it('lets the newest attempt decide, so a re-run into failure revokes an earlier green', () => {
    const runs = greenRuns();
    const stale = runs[0];
    runs.push({ ...stale, id: stale.id + 5000, conclusion: 'failure' });
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
    });
    expect(result.verdict).toBe('REFUSE');
  });

  it('refuses anything that is not a full 40-hex sha', () => {
    for (const bad of ['113c17e8', '', 'HEAD', 'main', 'A'.repeat(40)]) {
      const runs = greenRuns();
      const result = evaluateRequiredChecks({
        policy,
        targetSha: bad,
        workflowRuns: runs,
        jobsByRunId: greenJobs(runs),
      });
      expect(result.verdict, `'${bad}' must be refused`).toBe('REFUSE');
    }
  });
});

describe('release gate — built-in self-test', () => {
  // The CLI ships a dependency-free --self-test so the gate can prove itself on a
  // runner with no node_modules. Run the same cases here so the two never drift.
  it.each(selfTestCases().map((c) => [c.name, c]))('%s', (_name, testCase) => {
    expect(testCase.run().verdict).toBe(testCase.expect);
  });
});
