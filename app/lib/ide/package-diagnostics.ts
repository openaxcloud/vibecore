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

const severities = ['info', 'low', 'moderate', 'high', 'critical'] as const;

function counts(value: unknown): value is Record<(typeof severities)[number], number> {
  return record(value) && severities.every((key) => Number.isInteger(value[key]) && (value[key] as number) >= 0);
}

function advisory(value: unknown): boolean {
  return (
    record(value) &&
    !('error' in value) &&
    (value.id === undefined || typeof value.id === 'number' || typeof value.id === 'string') &&
    typeof value.title === 'string' &&
    typeof value.vulnerable_versions === 'string' &&
    severities.some((severity) => value.severity === severity)
  );
}

/** Only supported complete reports can turn a nonzero diagnostic code into a successful run. */
function findingsReport(manager: Manager, intent: Diagnostic, exitCode: number, output: string): boolean {
  try {
    if (manager === 'yarn') {
      const lines: unknown[] = output
        .trim()
        .split(/\r?\n/u)
        .map((line) => JSON.parse(line));

      if (!lines.every((line) => record(line) && line.type !== 'error' && !('error' in line))) {
        return false;
      }

      if (intent === 'outdated') {
        return (
          exitCode === 1 &&
          lines.some((line) => {
            if (!record(line) || line.type !== 'table' || !record(line.data)) {
              return false;
            }

            const { head, body } = line.data;

            return (
              Array.isArray(head) &&
              head.slice(0, 4).join(',') === 'Package,Current,Wanted,Latest' &&
              Array.isArray(body) &&
              body.length > 0 &&
              body.every(
                (row) =>
                  Array.isArray(row) && row.length === head.length && row.every((cell) => typeof cell === 'string'),
              )
            );
          })
        );
      }

      const advisoryRows = lines.filter((line) => record(line) && line.type === 'auditAdvisory');

      if (
        !advisoryRows.every((line) => {
          if (!record(line) || !record(line.data) || !advisory(line.data.advisory) || !record(line.data.resolution)) {
            return false;
          }

          return typeof line.data.resolution.id === 'number' && typeof line.data.resolution.path === 'string';
        })
      ) {
        return false;
      }

      const summaries = lines.filter((line) => record(line) && line.type === 'auditSummary');

      if (summaries.length === 1) {
        const summary = summaries[0] as Record<string, unknown>;

        if (!record(summary.data) || 'error' in summary.data || !counts(summary.data.vulnerabilities)) {
          return false;
        }

        const vulnerabilities = summary.data.vulnerabilities;
        const mask = severities.reduce((sum, key, index) => sum + (vulnerabilities[key] > 0 ? 2 ** index : 0), 0);

        return mask > 0 && exitCode === mask;
      }

      // Berry emits one serialized report tree per advisory, not a Classic summary.
      return (
        exitCode === 1 &&
        lines.length > 0 &&
        lines.every((line) => {
          if (!record(line) || !record(line.children)) {
            return false;
          }

          const fields = line.children;

          if ('error' in fields) {
            return false;
          }

          return (
            (fields.ID === undefined || typeof fields.ID === 'number' || typeof fields.ID === 'string') &&
            typeof fields.Issue === 'string' &&
            typeof fields['Vulnerable Versions'] === 'string' &&
            severities.some((severity) => fields.Severity === severity) &&
            Array.isArray(fields['Tree Versions']) &&
            Array.isArray(fields.Dependents)
          );
        })
      );
    }

    if (exitCode !== 1) {
      return false;
    }

    const report: unknown = JSON.parse(output);

    if (!record(report) || 'error' in report) {
      return false;
    }

    if (manager === 'pnpm') {
      if (intent === 'outdated') {
        const entries = Object.values(report);
        return (
          entries.length > 0 &&
          entries.every(
            (entry) =>
              record(entry) &&
              typeof entry.wanted === 'string' &&
              typeof entry.isDeprecated === 'boolean' &&
              ['dependencies', 'devDependencies', 'optionalDependencies'].includes(String(entry.dependencyType)) &&
              (entry.latest === undefined || typeof entry.latest === 'string'),
          )
        );
      }

      if (!record(report.metadata) || !counts(report.metadata.vulnerabilities) || !record(report.advisories)) {
        return false;
      }

      return (
        Object.values(report.metadata.vulnerabilities).some((count) => count > 0) &&
        Object.values(report.advisories).every(advisory)
      );
    }

    if (manager === 'bun' && intent === 'audit') {
      const groups = Object.values(report);
      return (
        groups.some((group) => Array.isArray(group) && group.length > 0) &&
        groups.every((group) => Array.isArray(group) && group.every(advisory))
      );
    }

    return false;
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

  // Exit zero remains process completion, not a claim that every dependency was checked.
  return run.exitCode === 0 || findingsReport(manager, intent, run.exitCode, run.output);
}

export function packageDiagnosticCommand(manager: Manager, intent: Diagnostic): string {
  if (manager === 'yarn' && intent === 'audit') {
    /* Choose Classic/Berry before executing: an audit failure must never trigger a fallback. */
    return 'version=$(yarn --version) || exit $?; case "$version" in 1.*) yarn audit --json ;; [2-9].*|[1-9][0-9].*) yarn npm audit --json ;; *) exit 2 ;; esac';
  }

  if (manager === 'pnpm' && intent === 'outdated') {
    return 'pnpm outdated --format json';
  }

  return `${manager} ${intent}${manager === 'bun' && intent === 'outdated' ? '' : ' --json'}`;
}
