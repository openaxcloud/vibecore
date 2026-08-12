#!/usr/bin/env node
/**
 * PIPELINE POLICY — asserts that the exact-SHA release gate is still wired into the
 * production deploy workflow.
 *
 * A gate is only worth what its wiring is worth. Every property below is one that,
 * if silently removed, leaves a workflow that still passes CI, still deploys, still
 * looks correct in review — and no longer gates anything:
 *
 *   * delete `needs: [release-gate]` and the deploy runs beside the gate, not behind it
 *   * move `id-token: write` back to the workflow level and the gate job holds a
 *     WIF-exchangeable credential, so "refuses before any cloud credential" stops
 *     being true even though the gate still runs
 *   * re-add a free-form sha/tag dispatch input and a dispatcher can deploy an
 *     arbitrary image again
 *   * drop `--set services.*.imageDigest` and the rollout silently returns to
 *     mutable tags while every other check still passes
 *
 * So the assertions live here, in a check that fails loudly, rather than in a
 * comment that asks people to remember.
 *
 * Deliberately parses the YAML structurally (indentation-aware, no dependency) and
 * NOT with greps over the whole file: a grep for `id-token: write` cannot tell the
 * workflow level from a job level, which is the exact distinction that matters.
 *
 * Usage: node scripts/release-gate/validate-deploy-gate-wired.mjs [--self-test]
 */

import fs from 'node:fs';
import process from 'node:process';

export const DEPLOY_WORKFLOW = '.github/workflows/deploy-main.yml';
export const BREAK_GLASS_WORKFLOW = '.github/workflows/deploy-break-glass.yml';
export const POLICY_FILE = 'scripts/release-gate/required-checks.json';

/**
 * Split a workflow file into: the top-level (pre-`jobs:`) region, and one region per
 * job. Enough structure for the assertions below, without a YAML dependency.
 *
 * @param {string} text
 * @returns {{topLevel: string, jobs: Map<string, string>}}
 */
/**
 * Drop whole-line comments (YAML `#` and shell `#` alike).
 *
 * Required for correctness, not tidiness: this file's own assertions are about
 * whether a permission or a command is PRESENT, and prose that mentions
 * `id-token: write` — including the comment in deploy-main.yml explaining why it is
 * deliberately absent — would otherwise read as the thing itself. A commented-out
 * `cosign verify` must likewise not count as a verification.
 *
 * Only lines whose first non-space character is `#` are removed, so `echo "#..."`
 * inside a run block survives.
 */
export function stripComments(text) {
  return text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

export function parseWorkflowRegions(text) {
  const lines = stripComments(text).split('\n');
  const jobsStart = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsStart === -1) {
    throw new Error('no top-level `jobs:` key found');
  }

  const topLevel = lines.slice(0, jobsStart).join('\n');

  const jobs = new Map();
  let current = null;
  let buffer = [];
  for (const line of lines.slice(jobsStart + 1)) {
    // A job header is exactly two spaces of indentation followed by `name:`.
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      if (current) {
        jobs.set(current, buffer.join('\n'));
      }
      current = m[1];
      buffer = [];
      continue;
    }
    if (current) {
      buffer.push(line);
    }
  }
  if (current) {
    jobs.set(current, buffer.join('\n'));
  }

  return { topLevel, jobs };
}

/** `needs: [a, b]` or a block list — returns the job names. */
export function parseNeeds(jobText) {
  const inline = /^ {4}needs:\s*\[([^\]]*)\]\s*$/m.exec(jobText);
  if (inline) {
    return inline[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = /^ {4}needs:\s*([A-Za-z0-9_-]+)\s*$/m.exec(jobText);
  if (single) {
    return [single[1]];
  }
  const block = /^ {4}needs:\s*\n((?: {6}- .*\n?)+)/m.exec(jobText);
  if (block) {
    return block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

/** Does this region declare `id-token: write` inside its own `permissions:` block? */
export function grantsIdToken(region, indent) {
  const re = new RegExp(`^${' '.repeat(indent)}permissions:\\s*\\n((?:${' '.repeat(indent + 2)}.*\\n?)+)`, 'm');
  const m = re.exec(`${region}\n`);
  return m ? /id-token:\s*write/.test(m[1]) : false;
}

/**
 * @param {{deployWorkflow: string, breakGlassWorkflow: string, policy: object}} files
 * @returns {string[]} problems (empty = wired correctly)
 */
export function checkGateWiring({ deployWorkflow, breakGlassWorkflow, policy }) {
  const problems = [];
  const { topLevel, jobs } = parseWorkflowRegions(deployWorkflow);
  breakGlassWorkflow = breakGlassWorkflow ? stripComments(breakGlassWorkflow) : breakGlassWorkflow;

  // --- the jobs must exist at all ---
  for (const job of ['resolve-target', 'release-gate', 'preflight-gates', 'build-and-deploy']) {
    if (!jobs.has(job)) {
      problems.push(`${DEPLOY_WORKFLOW}: job '${job}' is missing`);
    }
  }
  if (problems.length > 0) {
    return problems; // the rest of the assertions would be noise
  }

  // --- the deploy must run BEHIND the gate, not beside it ---
  const deployNeeds = parseNeeds(jobs.get('build-and-deploy'));
  for (const required of ['resolve-target', 'release-gate', 'preflight-gates']) {
    if (!deployNeeds.includes(required)) {
      problems.push(`${DEPLOY_WORKFLOW}: build-and-deploy must declare 'needs: ${required}' (has [${deployNeeds}])`);
    }
  }
  if (!parseNeeds(jobs.get('release-gate')).includes('resolve-target')) {
    problems.push(`${DEPLOY_WORKFLOW}: release-gate must need resolve-target`);
  }

  // --- refusal must happen before any cloud credential exists ---
  if (/id-token:\s*write/.test(topLevel)) {
    problems.push(
      `${DEPLOY_WORKFLOW}: id-token: write is granted at the WORKFLOW level — the gate job would hold a WIF-exchangeable token`,
    );
  }
  if (grantsIdToken(jobs.get('release-gate'), 4)) {
    problems.push(`${DEPLOY_WORKFLOW}: the release-gate job must not be granted id-token: write`);
  }
  if (grantsIdToken(jobs.get('resolve-target'), 4)) {
    problems.push(`${DEPLOY_WORKFLOW}: the resolve-target job must not be granted id-token: write`);
  }
  if (!grantsIdToken(jobs.get('build-and-deploy'), 4)) {
    problems.push(`${DEPLOY_WORKFLOW}: build-and-deploy needs its own id-token: write (it authenticates to GCP)`);
  }

  // --- the gate must actually be invoked, and self-tested first ---
  const gateJob = jobs.get('release-gate');
  if (!/verify-required-checks\.mjs\s+--self-test/.test(gateJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: release-gate must self-test the engine before trusting it`);
  }
  if (!/verify-required-checks\.mjs\s*\\\s*\n\s*--sha/.test(gateJob) && !/verify-required-checks\.mjs --sha/.test(gateJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: release-gate must run the gate with --sha <target>`);
  }

  // --- the target must be a full sha, and free-form image inputs must stay gone ---
  if (/short_sha:\s*\n\s*description:/.test(topLevel)) {
    problems.push(`${DEPLOY_WORKFLOW}: the free-form 'short_sha' dispatch input is back — it unbinds the deploy from a commit`);
  }
  if (!/target_sha:/.test(topLevel)) {
    problems.push(`${DEPLOY_WORKFLOW}: expected a 'target_sha' dispatch input bound to a real commit`);
  }
  for (const job of ['release-gate', 'preflight-gates', 'build-and-deploy']) {
    if (!/HEAD_SHA.*!=.*TARGET_SHA|"\$\{HEAD_SHA\}" != "\$\{TARGET_SHA\}"/.test(jobs.get(job))) {
      problems.push(`${DEPLOY_WORKFLOW}: job '${job}' must assert its checkout HEAD equals the target SHA`);
    }
  }

  // --- the rollout must be pinned by digest ---
  const deployJob = jobs.get('build-and-deploy');
  if (!/services\.\$\{service\}\.imageDigest=/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: helm upgrade must set services.<svc>.imageDigest for every service`);
  }
  if (/--set "services\.[a-zA-Z]+\.imageTag=\$\{SHORT_SHA\}"/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: helm upgrade still pins services by mutable tag alone`);
  }
  if (!/release-manifest\.mjs verify-imageids/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: the rollout must be proven against running imageIDs`);
  }
  if (!/release-manifest\.mjs build/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: the deploy must produce a release manifest`);
  }
  if (!/cosign verify/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: image signatures must be verified before the rollout`);
  }

  // --- the policy must still require the four pipelines ---
  const names = (policy.requiredWorkflows ?? []).map((w) => w.displayName);
  for (const required of ['Production CI', 'Production E2E', 'Security Analysis', 'Code Quality']) {
    if (!names.includes(required)) {
      problems.push(`${POLICY_FILE}: '${required}' is no longer a required check`);
    }
  }
  for (const wf of policy.requiredWorkflows ?? []) {
    if (!Number.isInteger(wf.id) || !wf.path || !(wf.requiredJobs ?? []).length) {
      problems.push(`${POLICY_FILE}: '${wf.displayName}' must pin a numeric id, a path and at least one job`);
    }
  }
  if ((policy.allowedEvents ?? []).join(',') !== 'push' || policy.requiredHeadBranch !== 'main') {
    problems.push(`${POLICY_FILE}: required checks must come from push runs on main only`);
  }

  // --- break-glass must stay double-approved and unable to ship new code ---
  if (!breakGlassWorkflow) {
    problems.push(`${BREAK_GLASS_WORKFLOW}: missing — there is no sanctioned bypass, so an unsanctioned one will be used`);
  } else {
    if (!/environment:\s*\n\s*#[^\n]*\n?\s*name:\s*production-break-glass|name:\s*production-break-glass/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must run in the production-break-glass environment`);
    }
    if (!/required_reviewers/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must assert the environment requires reviewers`);
    }
    if (/gcloud builds submit/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must not build images — it may only restore already-signed digests`);
    }
    if (!/cosign verify/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must cosign-verify every digest it restores`);
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------

function selfTest() {
  const deployWorkflow = fs.readFileSync(DEPLOY_WORKFLOW, 'utf8');
  const breakGlassWorkflow = fs.readFileSync(BREAK_GLASS_WORKFLOW, 'utf8');
  const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));

  // Prove the validator can actually FAIL — a checker that only ever passes is
  // indistinguishable from no checker at all.
  const mutations = [
    ['deploy job no longer needs the gate', () => ({
      deployWorkflow: deployWorkflow.replace(
        'needs: [resolve-target, release-gate, preflight-gates]',
        'needs: [resolve-target, preflight-gates]',
      ),
      breakGlassWorkflow,
      policy,
    })],
    ['id-token granted workflow-wide', () => ({
      deployWorkflow: deployWorkflow.replace('permissions:\n  contents: read', 'permissions:\n  contents: read\n  id-token: write'),
      breakGlassWorkflow,
      policy,
    })],
    ['E2E dropped from the policy', () => ({
      deployWorkflow,
      breakGlassWorkflow,
      policy: { ...policy, requiredWorkflows: policy.requiredWorkflows.filter((w) => w.displayName !== 'Production E2E') },
    })],
    ['break-glass allowed to build', () => ({
      deployWorkflow,
      breakGlassWorkflow: `${breakGlassWorkflow}\n          gcloud builds submit .\n`,
      policy,
    })],
  ];

  let failures = 0;
  for (const [label, mutate] of mutations) {
    const problems = checkGateWiring(mutate());
    const caught = problems.length > 0;
    console.log(`${caught ? 'ok  ' : 'FAIL'}  detects: ${label}`);
    if (!caught) {
      failures += 1;
    }
  }

  const clean = checkGateWiring({ deployWorkflow, breakGlassWorkflow, policy });
  console.log(`${clean.length === 0 ? 'ok  ' : 'FAIL'}  accepts the real, unmutated workflow`);
  if (clean.length > 0) {
    clean.forEach((p) => console.log(`        ${p}`));
    failures += 1;
  }
  return failures === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--self-test')) {
    return selfTest();
  }

  const problems = checkGateWiring({
    deployWorkflow: fs.readFileSync(DEPLOY_WORKFLOW, 'utf8'),
    breakGlassWorkflow: fs.existsSync(BREAK_GLASS_WORKFLOW) ? fs.readFileSync(BREAK_GLASS_WORKFLOW, 'utf8') : '',
    policy: JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')),
  });

  if (problems.length > 0) {
    for (const p of problems) {
      console.error(`::error::${p}`);
    }
    console.error(`\n${problems.length} release-gate wiring problem(s) — the production deploy path is not gated as designed.`);
    return 1;
  }
  console.log('✅ exact-SHA release gate is wired into the production deploy path');
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('validate-deploy-gate-wired.mjs')) {
  process.exit(main());
}
