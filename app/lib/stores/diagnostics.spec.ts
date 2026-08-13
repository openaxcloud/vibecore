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

  it('drops stale cold-start runtime errors once the preview is live (workspaceError AND logs)', () => {
    const args = {
      workspaceError: 'Remote runtime request failed: 500',
      workspaceLogs: [
        "{'level':'error','service':'workspace-agent','event':'preview proxy unreachable','port':5173,'error':'fetch failed'}",
        'Error: Cannot read properties of null', // a genuine app error — must be kept
      ],
    };

    // Before the port serves, the transient 500 + proxy-unreachable are shown.
    const pending = buildRuntimeDiagnostics(args);
    expect(pending.some((d) => /remote runtime request failed: 500/i.test(d.message))).toBe(true);
    expect(pending.some((d) => /preview proxy unreachable/i.test(d.message))).toBe(true);

    // Once a forwarded port is serving, only the genuine app error survives.
    const live = buildRuntimeDiagnostics({ ...args, previewLive: true });
    expect(live.some((d) => /remote runtime request failed/i.test(d.message))).toBe(false);
    expect(live.some((d) => /preview proxy unreachable/i.test(d.message))).toBe(false);
    expect(live.some((d) => d.message === 'Error: Cannot read properties of null')).toBe(true);
  });

  it('does not suppress a genuine HTTP 500 from the user app when preview is live', () => {
    // "500" alone (an app response) is not the runtime-provisioning signature.
    const live = buildRuntimeDiagnostics({
      workspaceLogs: ['Error: API returned 500 Internal Server Error from /api/users'],
      previewLive: true,
    });
    expect(live.some((d) => /500 internal server error/i.test(d.message))).toBe(true);
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
