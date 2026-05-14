import { describe, expect, it } from 'vitest';
import { buildRuntimeDiagnostics, useDiagnosticsStore } from './diagnostics';

describe('diagnostics store', () => {
  it('deduplicates runtime diagnostics and separates errors from warnings', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceError: 'Preview crashed',
      workspaceLogs: [
        'Error: Cannot read properties of null',
        'Error: Cannot read properties of null',
        'Warning: deprecated API',
      ],
    });

    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toHaveLength(2);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')).toHaveLength(1);
    expect(
      diagnostics.find((diagnostic) => diagnostic.message === 'Error: Cannot read properties of null'),
    ).toMatchObject({
      occurrences: 2,
    });
  });

  it('keeps counts in sync with the stored diagnostics snapshot', () => {
    const { setDiagnosticsForSource, clearDiagnosticsForSource } = useDiagnosticsStore.getState();

    clearDiagnosticsForSource('runtime');
    setDiagnosticsForSource('runtime', [
      {
        id: 'runtime:error:one',
        severity: 'error',
        source: 'runtime',
        message: 'One error',
      },
      {
        id: 'runtime:warning:one',
        severity: 'warning',
        source: 'runtime',
        message: 'One warning',
      },
    ]);

    expect(useDiagnosticsStore.getState()).toMatchObject({
      errors: 1,
      warnings: 1,
    });
    expect(useDiagnosticsStore.getState().diagnostics).toHaveLength(2);
  });
});
