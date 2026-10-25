/** Package diagnostics preserve the process exit code; findings are not process errors. */
type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun';
type Diagnostic = 'audit' | 'outdated';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function npmReport(intent: Diagnostic, output: string, exitCode: number): boolean {
  try {
    const report: unknown = JSON.parse(output);

    if (!record(report) || 'error' in report) {
      return false;
    }

    if (intent === 'audit') {
      return report.auditReportVersion === 2 && record(report.vulnerabilities);
    }

    const entries = Object.values(report);

    // npm emits arrays when more than one installed occurrence has the same name.
    return (
      (exitCode === 0 || entries.length > 0) &&
      entries.every((entry) => {
        const occurrences = Array.isArray(entry) ? entry : [entry];

        return (
          occurrences.length > 0 &&
          occurrences.every(
            (item) => record(item) && typeof item.wanted === 'string' && typeof item.latest === 'string',
          )
        );
      })
    );
  } catch {
    return false;
  }
}

export function packageDiagnosticSucceeded(
  manager: Manager,
  intent: Diagnostic,
  run: { exitCode: number; output: string },
): boolean {
  if (manager === 'npm') {
    return (run.exitCode === 0 || run.exitCode === 1) && npmReport(intent, run.output, run.exitCode);
  }

  /*
   * Other managers have version-specific reports and finding exit codes. Until
   * those contracts are validated, preserve nonzero failures, never normalize
   * them to success. Zero certifies command completion, not a clean dependency tree.
   */
  return run.exitCode === 0;
}

export function packageDiagnosticCommand(manager: Manager, intent: Diagnostic): string {
  if (manager === 'yarn' && intent === 'audit') {
    /* Choose Classic/Berry before executing: an audit failure must never trigger a fallback. */
    return 'version=$(yarn --version) || exit $?; case "$version" in 1.*) yarn audit --json ;; [2-9].*|[1-9][0-9].*) yarn npm audit --json ;; *) exit 2 ;; esac';
  }

  if (manager === 'pnpm' && intent === 'outdated') {
    return 'pnpm outdated --format json';
  }

  return `${manager} ${intent}${manager === 'bun' ? '' : ' --json'}`;
}
