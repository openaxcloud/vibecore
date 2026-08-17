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

describe('build-error recovery (audit cluster D, BUG-IDE-003)', () => {
  // Verbatim shapes captured on app.e-code.ai while breaking then fixing src/App.tsx.
  const transformError =
    '3:08:59 PM [vite] Pre-transform error: /workspace/src/App.tsx: Unterminated JSX contents. (1:60)';

  const hmrRecovery = '3:09:41 PM [vite] hmr update /src/App.tsx';

  it('reports the build error while the file is still broken', () => {
    const diagnostics = buildRuntimeDiagnostics({ workspaceLogs: [transformError] });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(1);
  });

  it('retires the build error once the dev server re-transforms the file', () => {
    const diagnostics = buildRuntimeDiagnostics({ workspaceLogs: [transformError, hmrRecovery] });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('accepts a page reload as the recovery signal too', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: [transformError, '3:09:41 PM [vite] page reload src/App.tsx'],
    });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('re-reports the error when the same file breaks again after a recovery', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: [transformError, hmrRecovery, transformError],
    });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(1);
  });

  it('only retires the module that actually recovered', () => {
    const otherError = '3:08:59 PM [vite] Pre-transform error: /workspace/src/main.tsx: Unexpected token. (2:3)';

    const diagnostics = buildRuntimeDiagnostics({ workspaceLogs: [transformError, otherError, hmrRecovery] });
    const errors = diagnostics.filter((d) => d.severity === 'error');

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('main.tsx');
  });

  it('never retires a runtime exception — only build errors name a module they can recover', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: ['TypeError: cannot read properties of undefined at /workspace/src/App.tsx:9:1', hmrRecovery],
    });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(1);
  });
});

describe('buildRuntimeDiagnostics — refus de quota', () => {
  /*
   * Mesuré sur l'env d'audit : espace de travail refusé en 429, panneau
   * Problèmes affichant « 0 erreurs · 0 avertissements » et mot « quota »
   * absent de toute la page. Le message existait, mais seulement dans un
   * attribut `title`.
   */
  const AVERTISSEMENT = 'Votre organisation a atteint sa limite d’espaces de travail actifs.';
  const OFFRE = 'Libérez un espace de travail ou passez à une offre supérieure.';

  it('remonte le refus de quota en erreur, avec la marche à suivre', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: [],
      quotaWarning: AVERTISSEMENT,
      quotaUpgrade: OFFRE,
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain('limite d’espaces de travail actifs');
    expect(diagnostics[0].detail).toContain('offre supérieure');
  });

  it('garde le refus même quand un aperçu tourne — ce n’est pas un raté de démarrage', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: [],
      quotaWarning: AVERTISSEMENT,
      previewLive: true,
    });

    expect(diagnostics.map((d) => d.message)).toContain(AVERTISSEMENT);
  });

  it('ne signale rien quand aucun quota n’est atteint', () => {
    expect(buildRuntimeDiagnostics({ workspaceLogs: [] })).toEqual([]);
  });
});
