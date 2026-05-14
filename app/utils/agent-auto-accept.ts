export type AgentAutoAcceptRun = {
  name?: unknown;
  workflowName?: unknown;
  script?: unknown;
  command?: unknown;
  status?: unknown;
  exitCode?: unknown;
  finishedAt?: unknown;
  startedAt?: unknown;
};

export type AgentAutoAcceptBackendState = {
  workflowsState?: {
    runs?: AgentAutoAcceptRun[];
  };
  terminalState?: {
    scriptRuns?: AgentAutoAcceptRun[];
  };
  packagesState?: {
    runs?: AgentAutoAcceptRun[];
  };
};

export type AgentAutoAcceptDecision = {
  ok: boolean;
  reason: string;
  latestTestRun?: AgentAutoAcceptRun;
};

const TEST_RUN_PATTERN = /\b(test|tests|vitest|jest|playwright|e2e|unit)\b/i;
const GREEN_STATUSES = new Set(['success', 'succeeded', 'passed', 'pass', 'completed', 'ok']);

function runLabel(run: AgentAutoAcceptRun): string {
  return [run.name, run.workflowName, run.script, run.command].filter(Boolean).join(' ');
}

function isTestRun(run: AgentAutoAcceptRun): boolean {
  return TEST_RUN_PATTERN.test(runLabel(run));
}

function runTime(run: AgentAutoAcceptRun): number {
  const value =
    typeof run.finishedAt === 'string' ? run.finishedAt : typeof run.startedAt === 'string' ? run.startedAt : '';

  const time = Date.parse(value);

  return Number.isFinite(time) ? time : 0;
}

export function collectAgentValidationRuns(state: AgentAutoAcceptBackendState): AgentAutoAcceptRun[] {
  return [
    ...(state.workflowsState?.runs ?? []),
    ...(state.terminalState?.scriptRuns ?? []),
    ...(state.packagesState?.runs ?? []),
  ]
    .filter(isTestRun)
    .sort((left, right) => runTime(right) - runTime(left));
}

export function isGreenAgentValidationRun(run: AgentAutoAcceptRun): boolean {
  const status = String(run.status ?? '').toLowerCase();

  if (GREEN_STATUSES.has(status)) {
    return true;
  }

  return status === '' && Number(run.exitCode) === 0;
}

export function shouldAutoAcceptAgentProposals(input: {
  autoAcceptEnabled: boolean;
  diagnosticsErrors: number;
  backendState: AgentAutoAcceptBackendState;
  requiredAfter?: string | number | Date | null;
}): AgentAutoAcceptDecision {
  if (!input.autoAcceptEnabled) {
    return { ok: false, reason: 'Auto-accept is disabled.' };
  }

  if (input.diagnosticsErrors > 0) {
    return { ok: false, reason: `${input.diagnosticsErrors} diagnostic error(s) must be fixed first.` };
  }

  const [latestTestRun] = collectAgentValidationRuns(input.backendState);

  if (!latestTestRun) {
    return { ok: false, reason: 'Run a real test command before auto-accept can apply all proposals.' };
  }

  const requiredAfterTime =
    input.requiredAfter instanceof Date
      ? input.requiredAfter.getTime()
      : typeof input.requiredAfter === 'number'
        ? input.requiredAfter
        : typeof input.requiredAfter === 'string'
          ? Date.parse(input.requiredAfter)
          : 0;

  if (Number.isFinite(requiredAfterTime) && requiredAfterTime > 0 && runTime(latestTestRun) < requiredAfterTime) {
    return {
      ok: false,
      reason: 'Run tests again after the latest AI proposal before auto-accept can continue.',
      latestTestRun,
    };
  }

  if (!isGreenAgentValidationRun(latestTestRun)) {
    return {
      ok: false,
      reason: `Latest test run is ${String(latestTestRun.status ?? 'not successful')}.`,
      latestTestRun,
    };
  }

  return { ok: true, reason: 'Latest test run passed.', latestTestRun };
}
