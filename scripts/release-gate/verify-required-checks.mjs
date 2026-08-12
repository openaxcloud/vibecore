#!/usr/bin/env node
/**
 * EXACT-SHA RELEASE GATE — decides whether a commit is allowed to be built and
 * rolled out to production.
 *
 * Context (the defect this exists to close): `deploy-main.yml` used to build and
 * `helm upgrade` on every push to `main` with no relationship to that commit's
 * test results. Verified against the GitHub API on 2026-08-12, three commits
 * reached production with a red or cancelled pipeline:
 *
 *   113c17e8  Production CI = failure    -> deployed
 *   9fc8a243  Production CI = failure    -> deployed
 *   3a53b439  Production CI = cancelled  -> deployed
 *
 * and `Production E2E` had never run on ANY of them, because e2e.yml did not
 * trigger on push to main at all — so "E2E is green" was vacuously true.
 *
 * DESIGN RULES (each one exists because its absence is a hole):
 *
 * 1. The gate answers about ONE commit: the full 40-hex `targetSha`. Every run it
 *    considers must carry that exact `head_sha`. "Latest green run on main" is not
 *    an acceptable substitute — that is how a red commit rides a neighbour's green.
 *
 * 2. Workflows are matched by numeric id + file path, never by display name. See
 *    required-checks.json for why.
 *
 * 3. When several runs exist for the same (workflow, sha) — re-runs, re-dispatches —
 *    the NEWEST one decides. A success that was later re-run into a failure must not
 *    be able to authorise a deploy.
 *
 * 4. Anything that is not an unambiguous, terminal, all-required-jobs-green success
 *    is a REFUSAL: missing, queued, in_progress, skipped, cancelled, timed_out,
 *    action_required, neutral, stale, wrong sha, wrong branch, wrong event, wrong
 *    path, or a required job that no longer exists in the run.
 *
 * 5. WAIT vs REFUSE. CI and the deploy workflow both start on the same push, so a
 *    check that is still running is NOT yet a verdict. The gate polls while checks
 *    are legitimately in flight and refuses at the deadline. But a check that has
 *    already reached a bad terminal state fails FAST — there is nothing to wait for.
 *
 * The decision engine (`evaluateRequiredChecks`) is a pure function over API
 * payloads so it can be unit-tested against every refusal class without network.
 *
 * Usage:
 *   node scripts/release-gate/verify-required-checks.mjs --sha <40-hex> [options]
 *     --policy <path>       default scripts/release-gate/required-checks.json
 *     --repo <owner/name>   default: policy.repository, or $GITHUB_REPOSITORY
 *     --timeout-seconds <n> override policy.waitTimeoutSeconds
 *     --no-wait             single evaluation, no polling (audit / forensics mode)
 *     --json <path>         write the machine-readable verdict here
 *     --self-test           prove the engine on built-in fixtures, then exit
 *
 * Exit codes: 0 = PASS (deploy authorised), 2 = REFUSE, 1 = usage/transport error.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SHA_RE = /^[0-9a-f]{40}$/;

/** Conclusions that are terminal and not a pass. Everything here refuses immediately. */
const TERMINAL_BAD = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'neutral',
  'stale',
  'skipped',
  'startup_failure',
]);

/**
 * Pure decision engine.
 *
 * @param {object} args
 * @param {object} args.policy                 parsed required-checks.json
 * @param {string} args.targetSha              full 40-hex commit sha
 * @param {Array<object>} args.workflowRuns    GitHub `workflow_runs` entries (any subset)
 * @param {Map<number, Array<object>>} args.jobsByRunId  run id -> that run's `jobs`
 * @returns {{verdict: 'PASS'|'REFUSE'|'WAIT', workflows: Array<object>, refusals: string[], waiting: string[]}}
 */
export function evaluateRequiredChecks({ policy, targetSha, workflowRuns, jobsByRunId, nowMs }) {
  if (!SHA_RE.test(String(targetSha ?? ''))) {
    return {
      verdict: 'REFUSE',
      workflows: [],
      refusals: [`targetSha is not a full 40-hex commit sha: '${targetSha}'`],
      waiting: [],
      warnings: [],
    };
  }

  const allowedEvents = new Set(policy.allowedEvents ?? ['push']);
  const requiredBranch = policy.requiredHeadBranch ?? null;
  const now = nowMs ?? Date.now();

  const workflows = [];
  const refusals = [];
  const waiting = [];
  const warnings = [];

  for (const wf of policy.requiredWorkflows) {
    const label = `${wf.displayName} (id=${wf.id}, ${wf.path})`;

    // A waiver lets a check be temporarily not-required — for a pipeline that is
    // broken for reasons unrelated to release integrity, where making it required
    // today would block every deploy forever rather than gate anything.
    //
    // It EXPIRES, and expiry fails closed: past the date the check is required again
    // and deploys start refusing. That is deliberate. A waiver with no deadline is
    // just a deleted check with extra steps, and the reason this gate exists at all
    // is that "Production E2E" was effectively waived — by never running — with
    // nobody noticing for months.
    if (wf.waivedUntil) {
      const problems = validateWaiver(wf);
      if (problems.length > 0) {
        workflows.push({ ...summaryOf(wf), state: 'REFUSE', detail: problems.join('; ') });
        refusals.push(`${label}: ${problems.join('; ')}`);
        continue;
      }
      const expiry = Date.parse(`${wf.waivedUntil}T23:59:59Z`);
      if (now <= expiry) {
        const days = Math.ceil((expiry - now) / 86_400_000);
        const detail = `WAIVED until ${wf.waivedUntil} (${days}d left) — ${wf.waiverReason}`;
        workflows.push({ ...summaryOf(wf), state: 'WAIVED', detail });
        warnings.push(`${label}: ${detail}`);
        continue;
      }
      warnings.push(`${label}: waiver EXPIRED on ${wf.waivedUntil} — this check is required again`);
    }

    // Rule 1+2: the run must belong to this pinned workflow id AND carry the exact sha.
    const sameWorkflow = workflowRuns.filter((r) => r.workflow_id === wf.id);
    const candidates = sameWorkflow.filter((r) => r.head_sha === targetSha);

    if (candidates.length === 0) {
      // No run yet for this commit. Legitimately possible while the push is fresh
      // (queued runs can take a moment to appear), so this WAITS rather than refuses;
      // the caller turns a still-missing check into a refusal at the deadline.
      workflows.push({ ...summaryOf(wf), state: 'MISSING', detail: 'no run found for this commit' });
      waiting.push(`${label}: no run for ${targetSha} yet`);
      continue;
    }

    // Rule 3: newest attempt decides.
    const run = [...candidates].sort(byNewest)[0];
    const base = { ...summaryOf(wf), runId: run.id, runUrl: run.html_url, runAttempt: run.run_attempt };

    // Identity of the run itself. A mismatch here means the pinned id is executing a
    // different file, or the run was produced by an event/branch we do not trust
    // (e.g. a dispatch on a side branch that happens to point at this sha).
    if (run.path !== wf.path) {
      const detail = `run executed '${run.path}', policy pins '${wf.path}' — workflow identity changed`;
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }
    if (!allowedEvents.has(run.event)) {
      const detail = `run event '${run.event}' is not in allowedEvents [${[...allowedEvents].join(', ')}]`;
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }
    if (requiredBranch !== null && run.head_branch !== requiredBranch) {
      const detail = `run head_branch '${run.head_branch}' != required '${requiredBranch}'`;
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }

    // Rule 5: still in flight -> not a verdict yet.
    if (run.status !== 'completed') {
      workflows.push({ ...base, state: 'PENDING', detail: `run status '${run.status}'` });
      waiting.push(`${label}: run ${run.id} is '${run.status}'`);
      continue;
    }

    // Rule 4: any non-success terminal conclusion refuses, fast.
    if (run.conclusion !== 'success') {
      const known = TERMINAL_BAD.has(run.conclusion) ? '' : ' (unrecognised conclusion — treated as failure)';
      const detail = `run concluded '${run.conclusion}'${known}`;
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }

    // Anti-gutting: the named jobs must still exist and be green in this run.
    const jobs = jobsByRunId.get(run.id);
    if (!jobs) {
      const detail = `job list unavailable for run ${run.id} — cannot prove required jobs ran`;
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }
    const byName = new Map(jobs.map((j) => [j.name, j]));
    const jobProblems = [];
    for (const jobName of wf.requiredJobs ?? []) {
      const job = byName.get(jobName);
      if (!job) {
        jobProblems.push(`required job '${jobName}' is absent from the run`);
      } else if (job.conclusion !== 'success') {
        jobProblems.push(`required job '${jobName}' concluded '${job.conclusion}'`);
      }
    }
    if (jobProblems.length > 0) {
      const detail = jobProblems.join('; ');
      workflows.push({ ...base, state: 'REFUSE', detail });
      refusals.push(`${label}: ${detail}`);
      continue;
    }

    workflows.push({
      ...base,
      state: 'PASS',
      detail: `success (${(wf.requiredJobs ?? []).length} required job(s) green)`,
    });
  }

  const verdict = refusals.length > 0 ? 'REFUSE' : waiting.length > 0 ? 'WAIT' : 'PASS';
  return { verdict, workflows, refusals, waiting, warnings };
}

/**
 * A waiver must be auditable and bounded. Anything less is a permanent hole that
 * merely looks temporary, so a malformed one REFUSES rather than being ignored.
 */
export function validateWaiver(wf, maxDays = 30) {
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wf.waivedUntil)) {
    problems.push(`waivedUntil must be YYYY-MM-DD (got '${wf.waivedUntil}')`);
    return problems;
  }
  const expiry = Date.parse(`${wf.waivedUntil}T23:59:59Z`);
  if (Number.isNaN(expiry)) {
    problems.push(`waivedUntil '${wf.waivedUntil}' is not a real date`);
  }
  if (!wf.waiverReason || String(wf.waiverReason).trim().length < 20) {
    problems.push('waiverReason must say WHY, in at least 20 characters');
  }
  if (!wf.waiverTicket) {
    problems.push('waiverTicket must reference the work that removes the waiver');
  }
  if (typeof wf.waiverMaxDays === 'number' && wf.waiverMaxDays > maxDays) {
    problems.push(`waiverMaxDays ${wf.waiverMaxDays} exceeds the ${maxDays}-day ceiling`);
  }
  return problems;
}

function summaryOf(wf) {
  return { id: wf.id, path: wf.path, displayName: wf.displayName, requiredJobs: wf.requiredJobs ?? [] };
}

/** Newest first: prefer the later run id (monotonic per repo), then the later attempt. */
function byNewest(a, b) {
  if (a.id !== b.id) {
    return b.id - a.id;
  }
  return (b.run_attempt ?? 1) - (a.run_attempt ?? 1);
}

// ---------------------------------------------------------------------------
// GitHub transport
// ---------------------------------------------------------------------------

async function ghFetch(url, token) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'vibecore-release-gate',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}: ${(await res.text()).slice(0, 400)}`);
  }
  return res.json();
}

async function fetchRunsForSha({ repo, sha, token }) {
  const runs = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100&page=${page}`;
    const body = await ghFetch(url, token);
    runs.push(...(body.workflow_runs ?? []));
    if ((body.workflow_runs ?? []).length < 100) {
      break;
    }
  }
  return runs;
}

async function fetchJobs({ repo, runId, token }) {
  const jobs = [];
  for (let page = 1; page <= 10; page += 1) {
    // `filter=latest` (the default) returns the jobs of the LATEST attempt, which is
    // the attempt whose conclusion the run reports — the two must not disagree.
    const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`;
    const body = await ghFetch(url, token);
    jobs.push(...(body.jobs ?? []));
    if ((body.jobs ?? []).length < 100) {
      break;
    }
  }
  return jobs;
}

/** One full evaluation round: fetch what the policy needs, then decide. */
async function evaluateOnce({ policy, repo, targetSha, token }) {
  const runs = await fetchRunsForSha({ repo, sha: targetSha, token });

  // Only fetch jobs for the runs the engine will actually consider — one request per
  // required workflow, not one per run in the repo.
  const jobsByRunId = new Map();
  for (const wf of policy.requiredWorkflows) {
    const candidates = runs.filter((r) => r.workflow_id === wf.id && r.head_sha === targetSha);
    if (candidates.length === 0) {
      continue;
    }
    const run = [...candidates].sort(byNewest)[0];
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      continue; // engine refuses/waits before it looks at jobs
    }
    jobsByRunId.set(run.id, await fetchJobs({ repo, runId: run.id, token }));
  }

  return evaluateRequiredChecks({ policy, targetSha, workflowRuns: runs, jobsByRunId });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function renderReport({ verdict, workflows, refusals, waiting, warnings }, { targetSha, repo }) {
  const lines = [];
  lines.push(`Release gate — repo ${repo}, target commit ${targetSha}`);
  lines.push('');
  for (const w of workflows) {
    const icon = w.state === 'PASS' ? '✅' : w.state === 'REFUSE' ? '❌' : w.state === 'WAIVED' ? '⚠️ ' : '⏳';
    lines.push(`${icon} ${w.state.padEnd(7)} ${w.displayName} [id=${w.id}] — ${w.detail}`);
    if (w.runUrl) {
      lines.push(`             ${w.runUrl}`);
    }
  }
  lines.push('');
  if (refusals.length > 0) {
    lines.push('REFUSALS:');
    refusals.forEach((r) => lines.push(`  - ${r}`));
  }
  if (waiting.length > 0) {
    lines.push('STILL WAITING ON:');
    waiting.forEach((r) => lines.push(`  - ${r}`));
  }
  if ((warnings ?? []).length > 0) {
    lines.push('⚠️  WAIVERS IN EFFECT (this release was NOT fully gated):');
    warnings.forEach((r) => lines.push(`  - ${r}`));
  }
  lines.push('');
  lines.push(`VERDICT: ${verdict}`);
  return lines.join('\n');
}

function writeStepSummary(text) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) {
    return;
  }
  fs.appendFileSync(file, `## Exact-SHA release gate\n\n\`\`\`\n${text}\n\`\`\`\n`);
}

// ---------------------------------------------------------------------------
// Self-test — proves the engine's refusal classes without touching the network.
// Kept in-process (not only in the vitest spec) so the gate can prove itself on a
// runner that has no dev dependencies installed, before it is trusted to decide.
// ---------------------------------------------------------------------------

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function fixturePolicy() {
  return {
    repository: 'openaxcloud/vibecore',
    allowedEvents: ['push'],
    requiredHeadBranch: 'main',
    requiredWorkflows: [
      { id: 1, path: '.github/workflows/ci.yml', displayName: 'Production CI', requiredJobs: ['Install, test, build, scan'] },
    ],
  };
}

function fixtureRun(overrides = {}) {
  return {
    id: 1000,
    workflow_id: 1,
    path: '.github/workflows/ci.yml',
    head_sha: SHA_A,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    html_url: 'https://example.invalid/run/1000',
    ...overrides,
  };
}

const GREEN_JOBS = [{ name: 'Install, test, build, scan', conclusion: 'success' }];

export function selfTestCases() {
  const policy = fixturePolicy();
  const jobs = (runId = 1000, list = GREEN_JOBS) => new Map([[runId, list]]);

  return [
    {
      name: 'all green -> PASS',
      expect: 'PASS',
      run: () => evaluateRequiredChecks({ policy, targetSha: SHA_A, workflowRuns: [fixtureRun()], jobsByRunId: jobs() }),
    },
    {
      name: 'no run for the commit -> WAIT (refused at deadline)',
      expect: 'WAIT',
      run: () => evaluateRequiredChecks({ policy, targetSha: SHA_A, workflowRuns: [], jobsByRunId: new Map() }),
    },
    {
      name: 'run still in progress -> WAIT',
      expect: 'WAIT',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ status: 'in_progress', conclusion: null })],
          jobsByRunId: new Map(),
        }),
    },
    {
      name: 'failure -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ conclusion: 'failure' })],
          jobsByRunId: new Map(),
        }),
    },
    {
      name: 'cancelled -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ conclusion: 'cancelled' })],
          jobsByRunId: new Map(),
        }),
    },
    {
      name: 'skipped -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ conclusion: 'skipped' })],
          jobsByRunId: new Map(),
        }),
    },
    {
      name: 'green run belongs to a DIFFERENT commit -> WAIT, never PASS',
      expect: 'WAIT',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_B,
          workflowRuns: [fixtureRun({ head_sha: SHA_A })],
          jobsByRunId: jobs(),
        }),
    },
    {
      name: 'pinned id now executes a different file (usurpation) -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ path: '.github/workflows/noop.yml' })],
          jobsByRunId: jobs(),
        }),
    },
    {
      name: 'green run produced by a non-allowed event -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ event: 'workflow_dispatch' })],
          jobsByRunId: jobs(),
        }),
    },
    {
      name: 'green run from another branch -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ head_branch: 'attacker' })],
          jobsByRunId: jobs(),
        }),
    },
    {
      name: 'required job deleted from an otherwise green run (gutted CI) -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun()],
          jobsByRunId: jobs(1000, [{ name: 'noop', conclusion: 'success' }]),
        }),
    },
    {
      name: 'required job present but red inside a green run -> REFUSE',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun()],
          jobsByRunId: jobs(1000, [{ name: 'Install, test, build, scan', conclusion: 'failure' }]),
        }),
    },
    {
      name: 'older green + newer failed re-run -> REFUSE (newest decides)',
      expect: 'REFUSE',
      run: () =>
        evaluateRequiredChecks({
          policy,
          targetSha: SHA_A,
          workflowRuns: [fixtureRun({ id: 1000 }), fixtureRun({ id: 1001, conclusion: 'failure' })],
          jobsByRunId: jobs(),
        }),
    },
    {
      name: 'short sha as target -> REFUSE (exact 40-hex only)',
      expect: 'REFUSE',
      run: () => evaluateRequiredChecks({ policy, targetSha: 'a3f40f6a', workflowRuns: [fixtureRun()], jobsByRunId: jobs() }),
    },
  ];
}

function runSelfTest() {
  let failed = 0;
  for (const c of selfTestCases()) {
    const got = c.run().verdict;
    const ok = got === c.expect;
    if (!ok) {
      failed += 1;
    }
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name} (expected ${c.expect}, got ${got})`);
  }
  console.log(`\nself-test: ${selfTestCases().length - failed}/${selfTestCases().length} passed`);
  return failed === 0 ? 0 : 2;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { wait: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    switch (a) {
      case '--sha':
        out.sha = next();
        break;
      case '--policy':
        out.policy = next();
        break;
      case '--repo':
        out.repo = next();
        break;
      case '--timeout-seconds':
        out.timeoutSeconds = Number(next());
        break;
      case '--json':
        out.json = next();
        break;
      case '--no-wait':
        out.wait = false;
        break;
      case '--self-test':
        out.selfTest = true;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    process.exit(runSelfTest());
  }

  const policyPath = args.policy ?? path.join('scripts', 'release-gate', 'required-checks.json');
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const repo = args.repo ?? policy.repository ?? process.env.GITHUB_REPOSITORY;
  const targetSha = args.sha ?? process.env.TARGET_SHA;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  if (!repo) {
    throw new Error('no repository: pass --repo owner/name or set policy.repository');
  }
  if (!SHA_RE.test(String(targetSha ?? ''))) {
    // Refuse loudly rather than silently resolving something: a gate that accepts a
    // short sha or a ref name is a gate that can be pointed at the wrong commit.
    console.error(`::error::--sha must be a full 40-hex commit sha (got '${targetSha}')`);
    process.exit(2);
  }

  const timeoutSeconds = args.timeoutSeconds ?? policy.waitTimeoutSeconds ?? 5400;
  const pollSeconds = policy.pollIntervalSeconds ?? 30;
  const deadline = Date.now() + timeoutSeconds * 1000;

  let result;
  for (;;) {
    result = await evaluateOnce({ policy, repo, targetSha, token });

    // Fail fast on a real refusal — a red check will not become green by waiting,
    // and holding a deploy job open for 90 minutes to say "no" wastes the runner
    // and delays the signal to whoever pushed.
    if (result.verdict !== 'WAIT') {
      break;
    }
    if (!args.wait || Date.now() >= deadline) {
      // Deadline reached with checks still missing/pending: that is a refusal.
      result = {
        ...result,
        verdict: 'REFUSE',
        refusals: [
          ...result.refusals,
          ...result.waiting.map((w) => `${w} — still not green at the gate deadline`),
        ],
      };
      break;
    }
    console.log(
      `[gate] waiting on ${result.waiting.length} check(s); ` +
        `${Math.round((deadline - Date.now()) / 1000)}s left — re-checking in ${pollSeconds}s`,
    );
    await new Promise((r) => setTimeout(r, pollSeconds * 1000));
  }

  const report = renderReport(result, { targetSha, repo });
  console.log(report);
  writeStepSummary(report);

  if (args.json) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    fs.writeFileSync(
      args.json,
      `${JSON.stringify({ repository: repo, targetSha, generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`,
    );
  }

  if (result.verdict !== 'PASS') {
    console.error('::error::Release gate REFUSED this commit — no build and no rollout will run.');
    process.exit(2);
  }
}

// Only run the CLI when executed directly, so the spec can import the engine.
if (process.argv[1] && process.argv[1].endsWith('verify-required-checks.mjs')) {
  main().catch((err) => {
    console.error(`::error::release gate transport/usage error: ${err.message}`);
    process.exit(1);
  });
}
