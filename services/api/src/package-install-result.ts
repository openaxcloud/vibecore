/** Preserve observed termination separately from a process exit code. */
export function packageInstallResult(result: {
  code?: number | null;
  signal?: string | null;
  timedOut?: boolean;
  cancelled?: boolean;
  truncated?: boolean;
}) {
  const termination =
    result.timedOut === true
      ? 'timeout'
      : result.cancelled === true || result.truncated === true || result.signal
        ? 'interrupted'
        : !Number.isInteger(result.code)
          ? 'unknown'
          : null;

  const exitCode = result.signal || !Number.isInteger(result.code) ? -1 : result.code!;

  return { exitCode, termination, success: termination === null && exitCode === 0 };
}
