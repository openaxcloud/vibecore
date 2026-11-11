/** Strict projection at the agent trust boundary; never spread the remote object. */
export function packageExecutionDiagnostic(
  requestedBudgetMs: unknown,
  result: {
    code?: unknown;
    signal?: unknown;
    timedOut?: unknown;
    executionDiagnostic?: unknown;
  },
) {
  const record = result.executionDiagnostic;
  const source = record && typeof record === 'object' ? (record as Record<string, unknown>) : {};

  const bounded = (value: unknown, max: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
  const category = (value: unknown, allowed: readonly string[]) =>
    typeof value === 'string' && allowed.includes(value) ? value : 'unknown';

  return {
    event: 'package.install.execution',
    requestedBudgetMs: bounded(requestedBudgetMs, 600_000),
    effectiveBudgetMs: bounded(source.effectiveBudgetMs, 86_400_000),
    elapsedMs: bounded(source.elapsedMs, 86_400_000),
    stdoutBytes: bounded(source.stdoutBytes, 1_073_741_824),
    stderrBytes: bounded(source.stderrBytes, 1_073_741_824),
    observedPhase: category(source.observedPhase, ['fetch', 'extract', 'lifecycle']),
    errorCode: category(source.errorCode, [
      'EAI_AGAIN',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOSPC',
      'EACCES',
      'ERESOLVE',
      'E404',
      'E401',
      'E403',
    ]),
    timedOut: typeof result.timedOut === 'boolean' ? result.timedOut : null,
    signal:
      result.signal === null
        ? null
        : category(result.signal, ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 'SIGSEGV']),
    exitCode: bounded(result.code, 255),
  };
}
