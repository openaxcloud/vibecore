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

import { evaluateRequiredChecks, selfTestCases, validateWaiver } from './verify-required-checks.mjs';
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

    // A waived workflow is legitimately absent — that is what the waiver means. The
    // property under test is that every NON-waived one is still load-bearing.
    for (const wf of policy.requiredWorkflows.filter((w) => !w.waivedUntil)) {
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
    const runs = greenRuns().filter((r) => r.path !== '.github/workflows/ci.yml');
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
      nowMs: Date.parse('2026-08-13T12:00:00Z'),
    });
    expect(result.verdict).toBe('WAIT'); // and the CLI converts WAIT-at-deadline into REFUSE
    expect(result.waiting.join('\n')).toMatch(/Production CI/);
  });

  it('holds E2E to the same bar as the rest, now that the suite can actually be green', () => {
    // E2E was waived at THIS level while the suite had never once passed. It passes now,
    // and carries its own bounded waiver for the tests that still flap
    // (tests/e2e/e2e-waivers.json). An E2E failure that is not on that inner list is a
    // real regression — a waiver here would swallow it. So: absent E2E is not a pass.
    const runs = greenRuns().filter((r) => r.path !== '.github/workflows/e2e.yml');
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
      nowMs: Date.parse('2026-08-13T12:00:00Z'),
    });
    expect(result.verdict).not.toBe('PASS');
    expect(result.workflows.find((w) => w.displayName === 'Production E2E').state).not.toBe('WAIVED');
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

  it('does not let an unrelated successful staging run authorise production', () => {
    const unrelatedStagingRun = {
      id: 424242,
      workflow_id: 999999,
      path: '.github/workflows/staging-runtime-validation.yml',
      head_sha: OTHER_SHA,
      head_branch: 'stable',
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      run_attempt: 1,
      html_url: 'https://example.invalid/run/424242',
    };
    const result = evaluateRequiredChecks({
      policy,
      targetSha: SHA,
      workflowRuns: [unrelatedStagingRun],
      jobsByRunId: new Map([[unrelatedStagingRun.id, [{ name: 'validate-runtime', conclusion: 'success' }]]]),
    });

    expect(result.verdict).not.toBe('PASS');
    expect(result.workflows.every((workflow) => workflow.state !== 'PASS')).toBe(true);
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

describe('release gate — waivers are bounded, loud, and fail closed on expiry', () => {
  const NOW = Date.parse('2026-08-12T12:00:00Z');

  function waived(extra = {}) {
    const wf = policy.requiredWorkflows.find((w) => w.displayName === 'Production E2E');
    return {
      ...policy,
      requiredWorkflows: policy.requiredWorkflows.map((w) =>
        w.id === wf.id
          ? {
              ...w,
              waivedUntil: '2026-09-01',
              waiverReason: 'the E2E suite is red for reasons unrelated to release integrity',
              waiverTicket: 'BUG-E2E-001',
              ...extra,
            }
          : w,
      ),
    };
  }

  it('lets a live waiver authorise a release without that check — and says so loudly', () => {
    const runs = greenRuns().filter((r) => r.path !== '.github/workflows/e2e.yml');
    const result = evaluateRequiredChecks({
      policy: waived(),
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
      nowMs: NOW,
    });
    expect(result.verdict).toBe('PASS');
    expect(result.warnings.join('\n')).toMatch(/Production E2E.*WAIVED until 2026-09-01/);
    expect(result.workflows.find((w) => w.displayName === 'Production E2E').state).toBe('WAIVED');
  });

  it('requires the check again the moment the waiver expires — no deploy rides a stale waiver', () => {
    const runs = greenRuns().filter((r) => r.path !== '.github/workflows/e2e.yml');
    const result = evaluateRequiredChecks({
      policy: waived(),
      targetSha: SHA,
      workflowRuns: runs,
      jobsByRunId: greenJobs(runs),
      nowMs: Date.parse('2026-09-02T00:00:01Z'),
    });
    expect(result.verdict).not.toBe('PASS');
    expect(result.warnings.join('\n')).toMatch(/waiver EXPIRED/);
    expect(result.waiting.join('\n')).toMatch(/Production E2E/);
  });

  it('refuses a waiver with no reason, no ticket or a malformed date', () => {
    for (const bad of [
      { waiverReason: 'because' },
      { waiverTicket: undefined },
      { waivedUntil: 'soon' },
      { waivedUntil: '01/09/2026' },
    ]) {
      const runs = greenRuns();
      const result = evaluateRequiredChecks({
        policy: waived(bad),
        targetSha: SHA,
        workflowRuns: runs,
        jobsByRunId: greenJobs(runs),
        nowMs: NOW,
      });
      expect(result.verdict, JSON.stringify(bad)).toBe('REFUSE');
    }
  });

  it('rejects a far-future waiver — a 26,804-day "temporary" exception is a disabled check', () => {
    const p = validateWaiver({ waivedUntil: '2099-12-31', waiverReason: 'x'.repeat(30), waiverTicket: 'T-1' }, NOW);
    expect(p.join('\n')).toMatch(/days away; the ceiling is 30 days/);
  });

  it('rejects calendar dates that do not exist instead of silently rolling them over', () => {
    // Date.UTC turns 2026-02-31 into 2026-03-03 and 2026-13-01 into 2027-01-01, so a
    // typo used to be accepted as a completely different date.
    for (const bad of ['2026-02-31', '2026-02-30', '2026-13-01', '2026-04-31']) {
      const p = validateWaiver({ waivedUntil: bad, waiverReason: 'x'.repeat(30), waiverTicket: 'T-1' }, NOW);
      expect(p.join('\n'), bad).toMatch(/is not a real calendar date/);
    }
  });

  it('accepts a waiver inside the ceiling, and one already expired (it simply no longer applies)', () => {
    expect(
      validateWaiver({ waivedUntil: '2026-08-26', waiverReason: 'x'.repeat(30), waiverTicket: 'T-1' }, NOW),
    ).toEqual([]);
    expect(
      validateWaiver({ waivedUntil: '2026-01-01', waiverReason: 'x'.repeat(30), waiverTicket: 'T-1' }, NOW),
    ).toEqual([]);
  });

  it('measures the ceiling against NOW, not against a self-declared field', () => {
    const p = validateWaiver(
      { waivedUntil: '2026-09-30', waiverReason: 'x'.repeat(30), waiverTicket: 'T-1', waiverMaxDays: 9999 },
      NOW,
    );
    expect(p.join('\n')).toMatch(/the ceiling is 30 days/);
  });

  it('every waiver that ships is valid and inside the ceiling — no permanent exception can be committed', () => {
    const waived = policy.requiredWorkflows.filter((w) => w.waivedUntil);
    for (const wf of waived) {
      // Validated against the waiver's OWN authoring window, so this test does not start
      // failing merely because the date passed — an expired waiver is legitimate, it just
      // stops applying and the check becomes required again.
      const authored = Date.parse(`${wf.waivedUntil}T00:00:00Z`) - 29 * 86_400_000;
      expect(validateWaiver(wf, authored), `${wf.displayName} waiver`).toEqual([]);
      expect(wf.waiverTicket, `${wf.displayName} needs a ticket`).toBeTruthy();
    }
  });

  it('ships with NO waiver at all — all four pipelines are unconditionally required', () => {
    // The mechanism above stays tested, and stays available for a pipeline that breaks
    // for reasons unrelated to release integrity. What must not happen quietly is a
    // waiver riding along in the committed policy: this fails the moment one appears.
    const waived = policy.requiredWorkflows.filter((w) => w.waivedUntil).map((w) => w.displayName);
    expect(waived).toEqual([]);
  });
});

describe('release gate — built-in self-test', () => {
  // The CLI ships a dependency-free --self-test so the gate can prove itself on a
  // runner with no node_modules. Run the same cases here so the two never drift.
  it.each(selfTestCases().map((c) => [c.name, c]))('%s', (_name, testCase) => {
    expect(testCase.run().verdict).toBe(testCase.expect);
  });
});
