#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const IN_FLIGHT_STATUSES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);

export const REQUIRED_WORKFLOWS = Object.freeze(
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
  ].map(Object.freeze),
);

export class ReleaseGateDecisionError extends Error {
  constructor(message, evaluation) {
    super(message);
    this.name = 'ReleaseGateDecisionError';
    this.evaluation = evaluation;
  }
}

function requirePositiveInteger(value, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}; got '${value}'`);
  }

  return parsed;
}

export function validateRequiredWorkflows(requiredWorkflows = REQUIRED_WORKFLOWS) {
  if (!Array.isArray(requiredWorkflows) || requiredWorkflows.length === 0) {
    throw new Error('at least one required workflow must be configured');
  }

  const ids = new Set();
  const paths = new Set();
  const names = new Set();

  for (const workflow of requiredWorkflows) {
    const workflowId = requirePositiveInteger(workflow.workflowId, 'workflowId');

    if (typeof workflow.name !== 'string' || workflow.name.length === 0) {
      throw new Error(`workflow ${workflowId} must have an exact display name`);
    }

    if (typeof workflow.path !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(workflow.path)) {
      throw new Error(`workflow ${workflowId} has an invalid path '${workflow.path}'`);
    }

    if (ids.has(workflowId) || paths.has(workflow.path) || names.has(workflow.name)) {
      throw new Error(`required workflow identity must be unique: ${workflow.name}`);
    }

    ids.add(workflowId);
    paths.add(workflow.path);
    names.add(workflow.name);
  }
}

function parseRunId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Return the newest run. A re-run keeps its database id, so run_attempt breaks
 * ties after creation time and id.
 */
export function selectNewestRun(runs) {
  return [...runs].sort((left, right) => {
    const createdDifference = timestamp(right.created_at) - timestamp(left.created_at);

    if (createdDifference !== 0) {
      return createdDifference;
    }

    const idDifference = (parseRunId(right.id) ?? 0) - (parseRunId(left.id) ?? 0);

    if (idDifference !== 0) {
      return idDifference;
    }

    return Number(right.run_attempt ?? 0) - Number(left.run_attempt ?? 0);
  })[0];
}

function runMatchesWorkflow(run, workflow, targetSha, currentRunId) {
  return (
    parseRunId(run.id) !== currentRunId &&
    Number(run.workflow_id) === workflow.workflowId &&
    run.name === workflow.name &&
    run.path === workflow.path &&
    run.head_sha === targetSha &&
    run.event === 'push' &&
    run.head_branch === 'main'
  );
}

function classifyRun(run) {
  if (run.status === 'completed' && run.conclusion === 'success') {
    return { state: 'PASS', reason: 'completed with conclusion success' };
  }

  if (run.conclusion !== null && run.conclusion !== undefined && run.conclusion !== '') {
    return {
      state: 'REJECT',
      reason: `terminal conclusion '${run.conclusion}' is not success`,
    };
  }

  if (run.status === 'completed') {
    return { state: 'REJECT', reason: 'completed run has no success conclusion' };
  }

  if (IN_FLIGHT_STATUSES.has(run.status)) {
    return { state: 'WAIT', reason: `run is ${run.status}` };
  }

  return { state: 'REJECT', reason: `unrecognised run status '${run.status}'` };
}

/**
 * Pure exact-SHA decision engine. Only the newest run with the complete immutable
 * identity (numeric workflow id + path + display name + head SHA) may vote. A
 * PR, schedule or manual run cannot stand in for the push-to-main run.
 */
export function evaluateRequiredWorkflows({ runs, targetSha, currentRunId, requiredWorkflows = REQUIRED_WORKFLOWS }) {
  validateRequiredWorkflows(requiredWorkflows);

  if (!SHA_PATTERN.test(targetSha)) {
    throw new Error(`target SHA must be full lowercase 40-hex; got '${targetSha}'`);
  }

  const parsedCurrentRunId = requirePositiveInteger(currentRunId, 'current run id');

  if (!Array.isArray(runs)) {
    throw new Error('workflow runs payload must be an array');
  }

  const workflows = requiredWorkflows.map((workflow) => {
    const candidates = runs.filter((run) => runMatchesWorkflow(run, workflow, targetSha, parsedCurrentRunId));
    const run = selectNewestRun(candidates);

    if (!run) {
      return {
        ...workflow,
        state: 'WAIT',
        reason: 'no exact-identity run exists for the target SHA',
        runId: null,
        url: null,
      };
    }

    return {
      ...workflow,
      ...classifyRun(run),
      runId: parseRunId(run.id),
      url: typeof run.html_url === 'string' ? run.html_url : null,
    };
  });

  const verdict = workflows.some((workflow) => workflow.state === 'REJECT')
    ? 'REJECT'
    : workflows.some((workflow) => workflow.state === 'WAIT')
      ? 'WAIT'
      : 'PASS';

  return { verdict, targetSha, workflows };
}

export function formatEvaluation(evaluation) {
  return [
    `target=${evaluation.targetSha} verdict=${evaluation.verdict}`,
    ...evaluation.workflows.map(
      (workflow) =>
        `${workflow.state.padEnd(6)} ${workflow.name} ` +
        `(workflow_id=${workflow.workflowId}, run_id=${workflow.runId ?? 'absent'}): ${workflow.reason}`,
    ),
  ].join('\n');
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function githubJsonRequest({
  url,
  token,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  requestTimeoutMs = 15_000,
  maxAttempts = 3,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('this script requires Node.js with global fetch support');
  }

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    timer.unref?.();

    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'user-agent': 'vibecore-exact-sha-release-gate',
          'x-github-api-version': '2022-11-28',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.json();
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastError = new Error(`GitHub Actions API returned HTTP ${response.status}`);
      lastError.retryable = retryable;

      if (!retryable || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.retryable === false || attempt === maxAttempts) {
        throw lastError;
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(1_000 * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error('GitHub Actions API request failed');
}

/** List every Actions run reported for one SHA, following bounded pagination. */
export async function listWorkflowRunsForSha({
  repository,
  targetSha,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  requestTimeoutMs = 15_000,
  maxPages = 10,
}) {
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new Error(`repository must be owner/name; got '${repository}'`);
  }

  if (!SHA_PATTERN.test(targetSha)) {
    throw new Error(`target SHA must be full lowercase 40-hex; got '${targetSha}'`);
  }

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required to read workflow runs');
  }

  const parsedMaxPages = requirePositiveInteger(maxPages, 'max pages', { maximum: 100 });
  const [owner, name] = repository.split('/').map(encodeURIComponent);
  const runs = [];

  for (let page = 1; page <= parsedMaxPages; page += 1) {
    const url = new URL(`${apiUrl.replace(/\/$/u, '')}/repos/${owner}/${name}/actions/runs`);
    url.searchParams.set('head_sha', targetSha);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const payload = await githubJsonRequest({
      url,
      token,
      fetchImpl,
      sleep,
      requestTimeoutMs,
    });

    if (!Array.isArray(payload.workflow_runs)) {
      throw new Error('GitHub Actions API response has no workflow_runs array');
    }

    runs.push(...payload.workflow_runs);

    const totalCount = Number(payload.total_count);

    if (
      payload.workflow_runs.length < 100 ||
      (Number.isSafeInteger(totalCount) && totalCount >= 0 && runs.length >= totalCount)
    ) {
      return runs;
    }
  }

  throw new Error(`workflow run listing exceeded the safety limit of ${parsedMaxPages * 100} runs`);
}

export async function waitForRequiredWorkflows({
  targetSha,
  currentRunId,
  loadRuns,
  timeoutMs,
  pollIntervalMs,
  now = Date.now,
  sleep = defaultSleep,
  log = console.log,
  requiredWorkflows = REQUIRED_WORKFLOWS,
}) {
  if (typeof loadRuns !== 'function') {
    throw new Error('loadRuns must be a function');
  }

  const parsedTimeoutMs = requirePositiveInteger(timeoutMs, 'timeout milliseconds');
  const parsedPollIntervalMs = requirePositiveInteger(pollIntervalMs, 'poll interval milliseconds');
  const startedAt = now();

  let previousSummary = '';

  for (;;) {
    const runs = await loadRuns();

    const evaluation = evaluateRequiredWorkflows({
      runs,
      targetSha,
      currentRunId,
      requiredWorkflows,
    });

    const summary = formatEvaluation(evaluation);

    if (summary !== previousSummary) {
      log(summary);
      previousSummary = summary;
    }

    if (evaluation.verdict === 'PASS') {
      return evaluation;
    }

    if (evaluation.verdict === 'REJECT') {
      throw new ReleaseGateDecisionError('required workflow reached a non-success terminal state', evaluation);
    }

    const elapsedMs = now() - startedAt;

    if (elapsedMs >= parsedTimeoutMs) {
      throw new ReleaseGateDecisionError(
        `required workflows did not all succeed within ${parsedTimeoutMs}ms`,
        evaluation,
      );
    }

    await sleep(Math.min(parsedPollIntervalMs, parsedTimeoutMs - elapsedMs));
  }
}

function usage() {
  return [
    'Usage: node scripts/wait-for-required-workflows.mjs --sha <40-hex> [options]',
    '',
    'Options:',
    '  --repository <owner/name>      defaults to GITHUB_REPOSITORY',
    '  --current-run-id <id>          defaults to GITHUB_RUN_ID',
    '  --timeout-seconds <seconds>    defaults to 9900 (165 minutes)',
    '  --poll-seconds <seconds>       defaults to 45',
    '  --help',
  ].join('\n');
}

export function parseArguments(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      return { help: true };
    }

    if (!argument.startsWith('--')) {
      throw new Error(`unexpected positional argument '${argument}'`);
    }

    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for ${argument}`);
    }

    if (Object.hasOwn(values, argument)) {
      throw new Error(`duplicate argument ${argument}`);
    }

    values[argument] = value;
    index += 1;
  }

  const allowed = new Set(['--sha', '--repository', '--current-run-id', '--timeout-seconds', '--poll-seconds']);

  for (const argument of Object.keys(values)) {
    if (!allowed.has(argument)) {
      throw new Error(`unknown argument ${argument}`);
    }
  }

  const targetSha = values['--sha'];

  if (!SHA_PATTERN.test(targetSha ?? '')) {
    throw new Error(`--sha must be a full lowercase 40-hex commit SHA; got '${targetSha ?? ''}'`);
  }

  const repository = values['--repository'] ?? process.env.GITHUB_REPOSITORY;

  if (!REPOSITORY_PATTERN.test(repository ?? '')) {
    throw new Error(`--repository must be owner/name; got '${repository ?? ''}'`);
  }

  return {
    help: false,
    targetSha,
    repository,
    currentRunId: requirePositiveInteger(values['--current-run-id'] ?? process.env.GITHUB_RUN_ID, 'current run id'),
    timeoutMs:
      requirePositiveInteger(values['--timeout-seconds'] ?? 9_900, 'timeout seconds', {
        maximum: 21_600,
      }) * 1_000,
    pollIntervalMs:
      requirePositiveInteger(values['--poll-seconds'] ?? 45, 'poll seconds', {
        minimum: 5,
        maximum: 300,
      }) * 1_000,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  await waitForRequiredWorkflows({
    ...options,
    loadRuns: () =>
      listWorkflowRunsForSha({
        repository: options.repository,
        targetSha: options.targetSha,
        token,
        apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
      }),
  });
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((error) => {
    if (error instanceof ReleaseGateDecisionError && error.evaluation) {
      console.error(`::error::${error.message}`);
      console.error(formatEvaluation(error.evaluation));
      process.exitCode = 2;

      return;
    }

    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
