/** Diagnostic hints only. Never retain command text, output, URLs or environment. */
export function commandExecutionDiagnostic(input: {
  effectiveBudgetMs: number;
  elapsedMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  stdout: string;
  stderr: string;
}) {
  const bounded = (value: number, max: number) =>
    Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : null;

  // Inspect only a bounded tail already captured by the command runner.
  const tail = `${input.stdout.slice(-4096)}\n${input.stderr.slice(-4096)}`;

  const errorCode =
    /^npm (?:ERR!|error) code[ \t]+(EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOSPC|EACCES|ERESOLVE|E404|E401|E403)\b/m.exec(
      tail,
    )?.[1] ?? 'unknown';

  // These describe observed output, not the cause of a slow/hung installation.
  const observedPhase = /\bnpm (?:http fetch|http cache)\b/.test(tail)
    ? 'fetch'
    : /\bnpm timing reify:unpack\b/.test(tail)
      ? 'extract'
      : /\bnpm info run\b/.test(tail)
        ? 'lifecycle'
        : 'unknown';

  return {
    effectiveBudgetMs: bounded(input.effectiveBudgetMs, 86_400_000),
    elapsedMs: bounded(input.elapsedMs, 86_400_000),
    stdoutBytes: bounded(input.stdoutBytes, 1_073_741_824),
    stderrBytes: bounded(input.stderrBytes, 1_073_741_824),
    observedPhase,
    errorCode,
  };
}
