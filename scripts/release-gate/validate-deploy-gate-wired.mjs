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
export const RELEASE_GATE_DRYRUN_WORKFLOW = '.github/workflows/release-gate-dryrun.yml';
export const POLICY_FILE = 'scripts/release-gate/required-checks.json';
export const CHART_VALUES = 'infra/helm/platform/values.yaml';
export const SIGNING_BUILD_CONFIG = 'infra/cloudbuild/runtime-tier.yaml';
export const STAGING_WORKFLOW = '.github/workflows/deploy-staging.yml';
export const AR_RETENTION_WORKFLOW = '.github/workflows/ar-protect-images.yml';

/**
 * Parse the deploy workflow's `SERVICES=` line into structured entries.
 * Shape: valuesKey:imageName:tier:chartService:rolled
 */
export function parseServiceMatrix(deployWorkflow) {
  const m = /SERVICES="([^"]+)"/.exec(deployWorkflow);
  if (!m) {
    return null;
  }
  return m[1]
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [key, image, tier, chartService, rolled] = entry.split(':');
      return { key, image, tier, chartService: chartService === 'true', rolled: rolled === 'true' };
    });
}

/**
 * Every service key the chart DEFINES, from values.yaml — not only the ones enabled by
 * default.
 *
 * Enablement is deliberately not the oracle: the live production release carries
 * `screenshotter.enabled: true`, set once with `--set` and frozen by `--reuse-values`,
 * while both values.yaml and values-prod.yaml say false. A matrix checked against
 * chart defaults would have declared that service out of scope and left the only
 * genuinely running one on a mutable tag. The deploy discovers enablement from the
 * cluster (no Deployment => skip); this check only ensures no chart service is missing
 * from the matrix in the first place.
 */
export function parseChartServiceKeys(valuesYaml) {
  const body = valuesYaml.split(/^services:\s*$/m)[1];
  if (body === undefined) {
    return null;
  }
  const keys = [];
  for (const line of body.split('\n')) {
    if (/^\S/.test(line)) {
      break; // left the `services:` block
    }
    const key = /^ {2}([A-Za-z][A-Za-z0-9]*):\s*$/.exec(line);
    if (key) {
      keys.push(key[1]);
    }
  }
  return keys;
}

/** Image names the deploy workflow waits for in its "Verify rollout" step. */
export function parseRolloutWaitList(deployJobText) {
  const m = /for svc in ([^;]+); do/.exec(deployJobText);
  return m ? m[1].trim().split(/\s+/) : null;
}

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

/** External GitHub Actions must be immutable commit pins, never movable tags. */
export function findUnpinnedActionUses(workflow) {
  const problems = [];
  const source = stripComments(workflow);
  const pattern = /^\s*(?:-\s*)?uses:\s*([^\s#]+).*$/gm;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const value = match[1];
    if (value.startsWith('./') || value.startsWith('docker://')) {
      continue;
    }
    const separator = value.lastIndexOf('@');
    const ref = separator >= 0 ? value.slice(separator + 1) : '';
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      problems.push(value);
    }
  }

  return problems;
}

/**
 * Dispatch inputs, repository variables and step outputs are data. They may enter a
 * process via `env`, but interpolating them into a `run:` script lets expression
 * expansion create shell syntax before the shell starts. Treat all three uniformly;
 * otherwise a validated step output can be made unsafe again at its final consumer.
 */
export function findRunInputInterpolations(workflow) {
  const unsafe = [];
  const lines = stripComments(workflow).split('\n');
  const expression = /\$\{\{\s*(?:inputs|github\.event\.inputs|steps|vars)\.[^}]+\}\}/;

  for (let index = 0; index < lines.length; index += 1) {
    const start = /^(\s*)run:\s*(.*)$/.exec(lines[index]);
    if (!start) {
      continue;
    }
    const indent = start[1].length;
    if (expression.test(start[2])) {
      unsafe.push({ line: index + 1, text: lines[index].trim() });
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() && /^\s*/.exec(line)[0].length <= indent) {
        break;
      }
      if (expression.test(line)) {
        unsafe.push({ line: cursor + 1, text: line.trim() });
      }
    }
  }

  return unsafe;
}

/**
 * A workflow_dispatch graph can itself come from a side branch. Require the runner's
 * immutable workflow identity to name main and require every checkout to load the
 * exact commit that supplied that trusted graph.
 */
function validateTrustedWorkflowGraph(problems, label, workflow, workflowPath) {
  if (!workflow) {
    return;
  }

  const expected = `EXPECTED="\${GITHUB_REPOSITORY}/${workflowPath}@refs/heads/main"`;
  const graphIndex = workflow.indexOf(expected);
  const firstAuthIndex = workflow.indexOf('uses: google-github-actions/auth@');

  if (graphIndex < 0 || !/WORKFLOW_REF:\s*\$\{\{\s*github\.workflow_ref\s*\}\}/.test(workflow)) {
    problems.push(`${label}: must pin github.workflow_ref to ${workflowPath}@refs/heads/main`);
  } else if (firstAuthIndex >= 0 && graphIndex > firstAuthIndex) {
    problems.push(`${label}: trusted workflow graph assertion must run before the first WIF exchange`);
  }
  if (!/if \[ "\$\{WORKFLOW_REF\}" != "\$\{EXPECTED\}" \]; then/.test(workflow)) {
    problems.push(`${label}: trusted workflow graph mismatch must fail closed`);
  }
  if (!/WORKFLOW_SHA:\s*\$\{\{\s*github\.workflow_sha\s*\}\}/.test(workflow)) {
    problems.push(`${label}: must bind the trusted graph to github.workflow_sha`);
  }

  const checkoutCount = (workflow.match(/uses:\s*actions\/checkout@[0-9a-f]{40}/g) ?? []).length;
  const pinnedCheckoutCount = (workflow.match(/ref:\s*\$\{\{\s*github\.workflow_sha\s*\}\}/g) ?? []).length;
  if (checkoutCount === 0 || pinnedCheckoutCount !== checkoutCount) {
    problems.push(
      `${label}: every checkout must load the exact github.workflow_sha (${pinnedCheckoutCount}/${checkoutCount} pinned)`,
    );
  }
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
export function checkGateWiring({
  deployWorkflow,
  breakGlassWorkflow,
  dryRunWorkflow,
  policy,
  chartValues,
  signingBuildConfig,
  stagingWorkflow,
  arRetentionWorkflow,
}) {
  const problems = [];
  const { topLevel, jobs } = parseWorkflowRegions(deployWorkflow);
  breakGlassWorkflow = breakGlassWorkflow ? stripComments(breakGlassWorkflow) : breakGlassWorkflow;
  // Same reason as breakGlassWorkflow: this file's own comments EXPLAIN which commands
  // must not be used, and prose naming a command would otherwise read as the command.
  arRetentionWorkflow = arRetentionWorkflow ? stripComments(arRetentionWorkflow) : arRetentionWorkflow;
  stagingWorkflow = stagingWorkflow ? stripComments(stagingWorkflow) : stagingWorkflow;

  // Supply-chain actions in every release-capable workflow are executable code.
  // Major-version tags are mutable and therefore not acceptable pins here.
  for (const [label, workflow] of [
    [DEPLOY_WORKFLOW, deployWorkflow],
    [BREAK_GLASS_WORKFLOW, breakGlassWorkflow],
    [RELEASE_GATE_DRYRUN_WORKFLOW, dryRunWorkflow],
    [STAGING_WORKFLOW, stagingWorkflow],
  ]) {
    if (!workflow) {
      continue;
    }
    for (const action of findUnpinnedActionUses(workflow)) {
      problems.push(`${label}: external action '${action}' must be pinned to a full 40-hex commit`);
    }
    for (const unsafe of findRunInputInterpolations(workflow)) {
      problems.push(
        `${label}:${unsafe.line}: input, step output or repository variable is interpolated directly into run shell source; pass it through env instead`,
      );
    }
  }

  validateTrustedWorkflowGraph(problems, BREAK_GLASS_WORKFLOW, breakGlassWorkflow, BREAK_GLASS_WORKFLOW);
  validateTrustedWorkflowGraph(problems, STAGING_WORKFLOW, stagingWorkflow, STAGING_WORKFLOW);

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
  if (
    !/verify-required-checks\.mjs\s*\\\s*\n\s*--sha/.test(gateJob) &&
    !/verify-required-checks\.mjs --sha/.test(gateJob)
  ) {
    problems.push(`${DEPLOY_WORKFLOW}: release-gate must run the gate with --sha <target>`);
  }

  // --- the target must be a full sha, and free-form image inputs must stay gone ---
  if (/short_sha:\s*\n\s*description:/.test(topLevel)) {
    problems.push(
      `${DEPLOY_WORKFLOW}: the free-form 'short_sha' dispatch input is back — it unbinds the deploy from a commit`,
    );
  }
  if (!/target_sha:/.test(topLevel)) {
    problems.push(`${DEPLOY_WORKFLOW}: expected a 'target_sha' dispatch input bound to a real commit`);
  }
  // Without the ancestor check, `target_sha` is only "a commit that exists" — a
  // dispatcher could deploy a commit that lived on a side branch, reviewed by nobody
  // and merged by nobody, while still satisfying a per-commit check gate.
  if (!/merge-base --is-ancestor/.test(jobs.get('resolve-target'))) {
    problems.push(`${DEPLOY_WORKFLOW}: resolve-target must assert the dispatched sha is an ancestor of origin/main`);
  }
  for (const job of ['release-gate', 'preflight-gates', 'build-and-deploy']) {
    if (!/HEAD_SHA.*!=.*TARGET_SHA|"\$\{HEAD_SHA\}" != "\$\{TARGET_SHA\}"/.test(jobs.get(job))) {
      problems.push(`${DEPLOY_WORKFLOW}: job '${job}' must assert its checkout HEAD equals the target SHA`);
    }
  }

  // --- the rollout must be pinned by digest ---
  const deployJob = jobs.get('build-and-deploy');
  const strictValidation = 'node scripts/validate-production-enterprise.mjs --strict --no-dotenv';
  const validationIndex = deployJob.indexOf(strictValidation);
  const firstCloudAuthIndex = deployJob.indexOf('uses: google-github-actions/auth@');
  if (validationIndex < 0) {
    problems.push(`${DEPLOY_WORKFLOW}: build-and-deploy must run strict production validation with dotenv disabled`);
  } else if (firstCloudAuthIndex >= 0 && validationIndex > firstCloudAuthIndex) {
    problems.push(
      `${DEPLOY_WORKFLOW}: strict production validation must run before the first cloud credential exchange`,
    );
  }
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
  if (!/services\.\$\{service\}\.imageSourceSha=\$\{source_sha\}/.test(deployJob)) {
    problems.push(`${DEPLOY_WORKFLOW}: Helm rollout must persist each manifest sourceSha beside its digest`);
  }

  // --- the service matrix must agree with the chart and with the rollout wait ---
  //
  // Three places encode the same fact and are maintained by hand: the workflow's
  // SERVICES line, the chart's enabled services, and the list the deploy waits on.
  // Drift between them is silent and one-directional-bad: add a service to the chart
  // and forget the matrix, and it deploys by MUTABLE TAG while everything else is
  // digest-pinned — with every check still green, because nothing was looking.
  const matrix = parseServiceMatrix(deployJob);
  const chartKeys = chartValues ? parseChartServiceKeys(chartValues) : null;
  const waitList = parseRolloutWaitList(deployJob);

  if (!matrix) {
    problems.push(`${DEPLOY_WORKFLOW}: could not find the SERVICES matrix`);
  } else {
    if (chartKeys) {
      const pinned = matrix
        .filter((s) => s.chartService)
        .map((s) => s.key)
        .sort();
      const expected = [...chartKeys].sort();
      for (const key of expected) {
        if (!pinned.includes(key)) {
          problems.push(
            `${DEPLOY_WORKFLOW}: chart service '${key}' is defined in ${CHART_VALUES} but is not pinned by digest (missing from SERVICES, or chartService=false) — if it is ever enabled it would be the only service left on a mutable tag`,
          );
        }
      }
      for (const key of pinned) {
        if (!expected.includes(key)) {
          problems.push(
            `${DEPLOY_WORKFLOW}: SERVICES pins '${key}' as a chart service, but ${CHART_VALUES} defines no such service`,
          );
        }
      }
    }

    if (waitList) {
      const rolled = matrix
        .filter((s) => s.rolled)
        .map((s) => s.image)
        .sort();
      const waited = [...waitList].sort();
      if (rolled.join(',') !== waited.join(',')) {
        problems.push(
          `${DEPLOY_WORKFLOW}: services flagged rolled=true [${rolled}] do not match the rollout wait list [${waited}] — one would be waited on without being verified, or verified without being waited on`,
        );
      }
    }
  }

  // --- the verification key must be the key that actually signs ---
  //
  // The workflows named `keyRings/vibecore-supply-chain`, which does not exist in the
  // project (`gcloud kms keyrings list` returns only `ecode-supply-chain`). `cosign
  // verify` could therefore never have succeeded — a gate that fails closed on a
  // typo blocks every deploy, and one that had failed OPEN would have verified
  // nothing. Signing and verification must name the same keyring, always.
  if (signingBuildConfig) {
    const ring = /_KMS_KEYRING:\s*(\S+)/.exec(signingBuildConfig)?.[1];
    const keyName = /_KMS_KEY:\s*(\S+)/.exec(signingBuildConfig)?.[1];
    for (const [label, text] of [
      ['deploy', deployWorkflow],
      ['break-glass', breakGlassWorkflow],
    ]) {
      if (!text) {
        continue;
      }
      const wfRing = /KMS_KEYRING:\s*(\S+)/.exec(text)?.[1];
      const wfKey = /KMS_KEY_NAME:\s*(\S+)/.exec(text)?.[1];
      if (ring && wfRing !== ring) {
        problems.push(
          `${label} workflow verifies with keyring '${wfRing}' but ${SIGNING_BUILD_CONFIG} signs with '${ring}'`,
        );
      }
      if (keyName && wfKey !== keyName) {
        problems.push(
          `${label} workflow verifies with key '${wfKey}' but ${SIGNING_BUILD_CONFIG} signs with '${keyName}'`,
        );
      }
    }
  }

  // --- staging must not be able to become an injectable production path ---
  if (stagingWorkflow) {
    const stagingRegions = parseWorkflowRegions(stagingWorkflow);
    const guardJob = stagingRegions.jobs.get('validate-workflow') ?? '';
    const stagingDeployJob = stagingRegions.jobs.get('deploy-staging') ?? '';
    if (/id-token:\s*write/.test(stagingRegions.topLevel)) {
      problems.push(`${STAGING_WORKFLOW}: id-token: write must not be granted before the graph guard`);
    }
    if (!guardJob || grantsIdToken(guardJob, 4)) {
      problems.push(`${STAGING_WORKFLOW}: trusted graph validation must run without id-token: write`);
    }
    if (!parseNeeds(stagingDeployJob).includes('validate-workflow')) {
      problems.push(`${STAGING_WORKFLOW}: deploy-staging must need the credential-free validate-workflow job`);
    }

    const parameterValidationIndex = stagingDeployJob.indexOf('Resolve and validate staging deployment parameters');
    const stagingAuthIndex = stagingDeployJob.indexOf('uses: google-github-actions/auth@');
    if (parameterValidationIndex < 0 || stagingAuthIndex < 0 || parameterValidationIndex > stagingAuthIndex) {
      problems.push(`${STAGING_WORKFLOW}: tag, cluster and domain validation must run before the first WIF exchange`);
    }
    if (!/\^sha-\[0-9a-f\]\{7\}\$/.test(stagingDeployJob) || /default:\s*latest/.test(stagingWorkflow)) {
      problems.push(
        `${STAGING_WORKFLOW}: manual image tags must be exactly sha-<7 lowercase hex>; latest is forbidden`,
      );
    }
    if (!/DOMAIN_PATTERN=/.test(stagingDeployJob)) {
      problems.push(`${STAGING_WORKFLOW}: app and preview domains must be strictly validated before Helm`);
    }
    if (!/"\$\{TARGET_CLUSTER\}" = "\$\{PROD_CLUSTER\}"/.test(stagingDeployJob)) {
      problems.push(`${STAGING_WORKFLOW}: the validated staging cluster must be rejected when it equals production`);
    }
    if (/cluster_name:\s*\$\{\{\s*vars\./.test(stagingDeployJob)) {
      problems.push(
        `${STAGING_WORKFLOW}: cluster credentials must consume the validated cluster output, not a raw repository variable`,
      );
    }

    const digestResolutionIndex = stagingDeployJob.indexOf('Resolve staging image tags to unique GAR digests');
    const helmUpgradeIndex = stagingDeployJob.indexOf('helm upgrade --install');
    if (
      digestResolutionIndex < stagingAuthIndex ||
      digestResolutionIndex < 0 ||
      helmUpgradeIndex < 0 ||
      digestResolutionIndex > helmUpgradeIndex
    ) {
      problems.push(`${STAGING_WORKFLOW}: GAR tags must resolve to digests after WIF and before Helm`);
    }
    if (
      !/gcloud artifacts docker images describe/.test(stagingDeployJob) ||
      !/\$\{#digests\[@\]\}" -ne 1/.test(stagingDeployJob) ||
      !/\^sha256:\[0-9a-f\]\{64\}\$/.test(stagingDeployJob)
    ) {
      problems.push(`${STAGING_WORKFLOW}: every staging tag must resolve to exactly one valid sha256 digest`);
    }
    if (
      !/services\.\$\{key\}\.imageDigest=\$\{digest\}/.test(stagingDeployJob) ||
      !/workspaceAgentImage=\$\{IMAGE_REGISTRY\}\/\$\{image\}@\$\{digest\}/.test(stagingDeployJob)
    ) {
      problems.push(`${STAGING_WORKFLOW}: Helm and workspace-agent staging references must consume resolved digests`);
    }
  }

  // Downloaded security tooling is executable supply-chain input. A TLS download
  // without a fixed digest only moves trust from the repository to release hosting.
  const gitleaksDownload = deployWorkflow.indexOf('gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz');
  const gitleaksChecksum = deployWorkflow.indexOf(
    'GITLEAKS_SHA256=5bc41815076e6ed6ef8fbecc9d9b75bcae31f39029ceb55da08086315316e3ba',
  );
  const gitleaksVerify = deployWorkflow.indexOf('echo "${GITLEAKS_SHA256}  /tmp/gitleaks.tgz" | sha256sum -c -');
  const gitleaksExtract = deployWorkflow.indexOf('tar -xzf /tmp/gitleaks.tgz -C /tmp gitleaks');
  if (
    gitleaksDownload < 0 ||
    gitleaksChecksum < 0 ||
    gitleaksVerify < gitleaksDownload ||
    gitleaksExtract < gitleaksVerify
  ) {
    problems.push(`${DEPLOY_WORKFLOW}: gitleaks 8.21.2 must be checksum-verified before extraction and execution`);
  }

  // --- retention must still protect DIGEST-pinned images ---
  //
  // Artifact Registry deletes images older than 7 days unless they carry a
  // `running-*` / `helm-active-*` protection tag, and ar-protect-images.yml applies
  // those tags. Its package-name parsing used `${pkg%%:*}`, which cuts at the FIRST
  // colon: for `api@sha256:…` that yields `api@sha256` and no tag is applied. Now that
  // production is pinned by digest, every running image takes that path — retention
  // would collect images production is actively running.
  //
  // La règle porte sur la PROPRIÉTÉ, pas sur un nom de variable : quelle que
  // soit la variable employée, une coupe au premier `:` doit être accompagnée
  // d'une coupe au `@`. L'implémentation retenue nomme la sienne `ref` ; exiger
  // littéralement `pkg` refusait une version pourtant correcte.
  //
  // L'interdiction de `helm get values -o json` est remplacée par l'invariant
  // qu'elle protégeait réellement. Sa justification d'origine — « JSON invalide
  // sur la vraie release » — a été VÉRIFIÉE contre la production le 2026-08-28
  // et ne tient pas : la commande rend 9 373 octets de JSON valide et la
  // requête jq en extrait bien les huit services de la plateforme avec leurs
  // tags. Le vrai risque est ailleurs : dériver l'ensemble protégé des valeurs
  // Helm ne fonctionne QUE tant que `imageTag` y est ré-affirmé à chaque
  // upgrade. Épinglé par digest sans ré-affirmer le tag, le filtre jq ne
  // renverrait plus rien et la rétention supprimerait des images en cours
  // d'exécution — en silence. C'est donc cette ré-affirmation qui est exigée.
  if (arRetentionWorkflow) {
    if (/\$\{\w+%%:\*\}/.test(arRetentionWorkflow) && !/\$\{\w+%%@\*\}/.test(arRetentionWorkflow)) {
      problems.push(
        `${AR_RETENTION_WORKFLOW}: package parsing must strip the digest (\${...%%@*}) before the tag, or digest-pinned images get no protection tag`,
      );
    }
    if (
      /helm .*get values .*-o json/.test(arRetentionWorkflow) &&
      !/services\.\$\{?\w+\}?\.imageTag=/.test(deployWorkflow ?? '')
    ) {
      problems.push(
        `${AR_RETENTION_WORKFLOW}: derives the protected set from \`helm get values\`, which only holds while the deploy re-asserts services.<name>.imageTag on every upgrade — it no longer does; read the live Deployments instead`,
      );
    }
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
    problems.push(
      `${BREAK_GLASS_WORKFLOW}: missing — there is no sanctioned bypass, so an unsanctioned one will be used`,
    );
  } else {
    const breakGlassRegions = parseWorkflowRegions(breakGlassWorkflow);
    const validateRequestJob = breakGlassRegions.jobs.get('validate-request') ?? '';
    const approvalOneJob = breakGlassRegions.jobs.get('approval-1') ?? '';
    const restoreJob = breakGlassRegions.jobs.get('restore') ?? '';
    if (!validateRequestJob.includes(`.github/workflows/deploy-break-glass.yml@refs/heads/main`)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: graph pin must run inside the credential-free validate-request job`);
    }
    if (grantsIdToken(validateRequestJob, 4)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: validate-request must not receive id-token: write`);
    }
    if (
      !parseNeeds(approvalOneJob).includes('validate-request') ||
      !parseNeeds(restoreJob).includes('validate-request')
    ) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: both approval/restore paths must depend on the trusted graph validation`);
    }
    if (
      !/environment:\s*\n\s*#[^\n]*\n?\s*name:\s*production-break-glass|name:\s*production-break-glass/.test(
        breakGlassWorkflow,
      )
    ) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must run in the production-break-glass environment`);
    }
    // Counting configured reviewers is not a quorum — GitHub requires ONE of N. The
    // property that must survive is: two sequential environments, and a runtime proof
    // that two DIFFERENT people approved.
    for (const env of ['production-break-glass-1', 'production-break-glass-2']) {
      if (!breakGlassWorkflow.includes(env)) {
        problems.push(`${BREAK_GLASS_WORKFLOW}: missing sequential approval environment '${env}'`);
      }
    }
    if (!/actions\/runs\/\$\{GITHUB_RUN_ID\}\/approvals/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must read this run's approvals to prove who approved`);
    }
    if (!/TWO DIFFERENT approvers|distinct approvers/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must reject two approvals from the same person`);
    }
    if (/gcloud builds submit/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must not build images — it may only restore already-signed digests`);
    }
    if (!/cosign verify/.test(breakGlassWorkflow)) {
      problems.push(`${BREAK_GLASS_WORKFLOW}: must cosign-verify every digest it restores`);
    }

    const cosignDownload = breakGlassWorkflow.indexOf('cosign-linux-amd64');
    const cosignChecksum = breakGlassWorkflow.indexOf(
      'COSIGN_SHA256=caaad125acef1cb81d58dcdc454a1e429d09a750d1e9e2b3ed1aed8964454708',
    );
    const cosignVerify = breakGlassWorkflow.indexOf('echo "${COSIGN_SHA256}  /tmp/cosign" | sha256sum -c -');
    const cosignInstall = breakGlassWorkflow.indexOf('sudo install /tmp/cosign /usr/local/bin/cosign');
    if (cosignDownload < 0 || cosignChecksum < 0 || cosignVerify < cosignDownload || cosignInstall < cosignVerify) {
      problems.push(
        `${BREAK_GLASS_WORKFLOW}: cosign 2.4.3 must be checksum-verified before installation and execution`,
      );
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------

function selfTest() {
  const deployWorkflow = fs.readFileSync(DEPLOY_WORKFLOW, 'utf8');
  const breakGlassWorkflow = fs.readFileSync(BREAK_GLASS_WORKFLOW, 'utf8');
  const dryRunWorkflow = fs.readFileSync(RELEASE_GATE_DRYRUN_WORKFLOW, 'utf8');
  const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
  const chartValues = fs.readFileSync(CHART_VALUES, 'utf8');
  const signingBuildConfig = fs.readFileSync(SIGNING_BUILD_CONFIG, 'utf8');
  const stagingWorkflow = fs.readFileSync(STAGING_WORKFLOW, 'utf8');
  const arRetentionWorkflow = fs.readFileSync(AR_RETENTION_WORKFLOW, 'utf8');

  // Prove the validator can actually FAIL — a checker that only ever passes is
  // indistinguishable from no checker at all.
  const mutations = [
    [
      'deploy job no longer needs the gate',
      () => ({
        deployWorkflow: deployWorkflow.replace(
          'needs: [resolve-target, release-gate, preflight-gates]',
          'needs: [resolve-target, preflight-gates]',
        ),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'id-token granted workflow-wide',
      () => ({
        deployWorkflow: deployWorkflow.replace(
          'permissions:\n  contents: read',
          'permissions:\n  contents: read\n  id-token: write',
        ),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'production Action changed back to a movable tag',
      () => ({
        deployWorkflow: deployWorkflow.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v4'),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'dispatch input interpolated into shell source',
      () => ({
        deployWorkflow: deployWorkflow.replace(
          '          set -euo pipefail\n          EXPECTED=',
          '          set -euo pipefail\n          echo "${{ inputs.target_sha }}"\n          EXPECTED=',
        ),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'staging step output interpolated into shell source',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow: stagingWorkflow.replace(
          '--set-string "global.imageTag=${IMAGE_TAG}"',
          '--set-string "global.imageTag=${{ steps.parameters.outputs.image_tag }}"',
        ),
        arRetentionWorkflow,
      }),
    ],
    [
      'staging graph allowed from a side branch',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow: stagingWorkflow.replace(
          '.github/workflows/deploy-staging.yml@refs/heads/main',
          '.github/workflows/deploy-staging.yml@refs/heads/feature',
        ),
        arRetentionWorkflow,
      }),
    ],
    [
      'break-glass graph allowed from a side branch',
      () => ({
        deployWorkflow,
        breakGlassWorkflow: breakGlassWorkflow.replace(
          '.github/workflows/deploy-break-glass.yml@refs/heads/main',
          '.github/workflows/deploy-break-glass.yml@refs/heads/feature',
        ),
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'break-glass cosign checksum removed',
      () => ({
        deployWorkflow,
        breakGlassWorkflow: breakGlassWorkflow.replace(
          'echo "${COSIGN_SHA256}  /tmp/cosign" | sha256sum -c -',
          'echo checksum-disabled',
        ),
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'gitleaks checksum removed',
      () => ({
        deployWorkflow: deployWorkflow.replace(
          'echo "${GITLEAKS_SHA256}  /tmp/gitleaks.tgz" | sha256sum -c -',
          'echo checksum-disabled',
        ),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'strict production validation removed',
      () => ({
        deployWorkflow: deployWorkflow.replace(
          'node scripts/validate-production-enterprise.mjs --strict --no-dotenv',
          'echo validation-disabled',
        ),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'E2E dropped from the policy',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy: {
          ...policy,
          requiredWorkflows: policy.requiredWorkflows.filter((w) => w.displayName !== 'Production E2E'),
        },
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'verification keyring drifting from the signing keyring',
      () => ({
        deployWorkflow: deployWorkflow.replace('KMS_KEYRING: ecode-supply-chain', 'KMS_KEYRING: vibecore-supply-chain'),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'break-glass losing its second approval gate',
      () => ({
        deployWorkflow,
        breakGlassWorkflow: breakGlassWorkflow.replace(/production-break-glass-1/g, 'production-break-glass-2'),
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'staging losing its refuse-production-cluster guard',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow: stagingWorkflow.replace(
          'if [ "${TARGET_CLUSTER}" = "${PROD_CLUSTER}" ]; then',
          'if false; then',
        ),
      }),
    ],
    [
      'staging Helm falling back to a mutable tag',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow: stagingWorkflow.replace(
          'services.${key}.imageDigest=${digest}',
          'services.${key}.imageTag=${IMAGE_TAG}',
        ),
        arRetentionWorkflow,
      }),
    ],
    [
      'staging accepting ambiguous GAR digest resolution',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow: stagingWorkflow.replace('"${#digests[@]}" -ne 1', '"${#digests[@]}" -lt 1'),
        arRetentionWorkflow,
      }),
    ],
    [
      'retention losing digest-safe package parsing',
      () => ({
        deployWorkflow,
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        // La variable ASSIGNÉE et celle LUE diffèrent dans l'implémentation réelle
        // (`pkg="${ref%%@*}"`). Une mutation qui exige le même nom des deux côtés
        // ne retire donc rien, et l'auto-test échoue en croyant que la règle ne
        // détecte plus la régression — alors que c'est la mutation qui rate sa cible.
        arRetentionWorkflow: arRetentionWorkflow.replace(/\w+="\$\{\w+%%@\*\}"; /g, ''),
      }),
    ],
    [
      'break-glass allowed to build',
      () => ({
        deployWorkflow,
        breakGlassWorkflow: `${breakGlassWorkflow}\n          gcloud builds submit .\n`,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'a chart service left out of the digest matrix',
      () => ({
        deployWorkflow: deployWorkflow.replace('api:api:runtime:true:true ', ''),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
    [
      'a service waited on but no longer verified',
      () => ({
        deployWorkflow: deployWorkflow.replace('for svc in web admin api', 'for svc in web api'),
        breakGlassWorkflow,
        policy,
        chartValues,
        signingBuildConfig,
        stagingWorkflow,
        arRetentionWorkflow,
      }),
    ],
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

  const clean = checkGateWiring({
    deployWorkflow,
    breakGlassWorkflow,
    dryRunWorkflow,
    policy,
    chartValues,
    signingBuildConfig,
    stagingWorkflow,
    arRetentionWorkflow,
  });
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
    dryRunWorkflow: fs.existsSync(RELEASE_GATE_DRYRUN_WORKFLOW)
      ? fs.readFileSync(RELEASE_GATE_DRYRUN_WORKFLOW, 'utf8')
      : '',
    policy: JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')),
    chartValues: fs.existsSync(CHART_VALUES) ? fs.readFileSync(CHART_VALUES, 'utf8') : null,
    signingBuildConfig: fs.existsSync(SIGNING_BUILD_CONFIG) ? fs.readFileSync(SIGNING_BUILD_CONFIG, 'utf8') : null,
    stagingWorkflow: fs.existsSync(STAGING_WORKFLOW) ? fs.readFileSync(STAGING_WORKFLOW, 'utf8') : null,
    arRetentionWorkflow: fs.existsSync(AR_RETENTION_WORKFLOW) ? fs.readFileSync(AR_RETENTION_WORKFLOW, 'utf8') : null,
  });

  if (problems.length > 0) {
    for (const p of problems) {
      console.error(`::error::${p}`);
    }
    console.error(
      `\n${problems.length} release-gate wiring problem(s) — the production deploy path is not gated as designed.`,
    );
    return 1;
  }
  console.log('✅ exact-SHA release gate is wired into the production deploy path');
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('validate-deploy-gate-wired.mjs')) {
  process.exit(main());
}
