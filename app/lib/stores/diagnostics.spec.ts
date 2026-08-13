import { beforeEach, describe, expect, it } from 'vitest';
import { buildRuntimeDiagnostics, useDiagnosticsStore } from './diagnostics';
import {
  createPreviewLifecycleInstanceId,
  previewLifecycleWindowInstancePrefix,
} from '~/lib/project-editor-preview-state';

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

describe('preview lifecycle recovery', () => {
  const record = useDiagnosticsStore.getState().recordPreviewLifecycle;

  beforeEach(() => {
    for (const scope of Object.keys(useDiagnosticsStore.getState().previewLifecycle)) {
      useDiagnosticsStore.getState().clearPreviewLifecycleScope(scope);
    }
  });

  it('keeps a current trusted blank as an error and clears it only on stable OK', () => {
    useDiagnosticsStore.getState().clearDiagnosticsForSource('preview-lifecycle:project-a:5173');
    record({ scope: 'project-a:5173', status: 'document', documentId: 'document-a', observedAt: 90 });
    record({
      scope: 'project-a:5173',
      status: 'blank',
      documentId: 'document-a',
      observedAt: 100,
      message: 'Localized blank preview',
    });

    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', message: 'Localized blank preview' }),
    );

    record({
      scope: 'project-a:5173',
      status: 'mounted',
      documentId: 'document-a',
      observedAt: 110,
    });
    expect(
      useDiagnosticsStore
        .getState()
        .diagnostics.filter((diagnostic) => diagnostic.source === 'preview-lifecycle:project-a:5173'),
    ).toHaveLength(1);

    record({
      scope: 'project-a:5173',
      status: 'ok',
      documentId: 'document-a',
      observedAt: 120,
    });
    expect(
      useDiagnosticsStore
        .getState()
        .diagnostics.filter((diagnostic) => diagnostic.source === 'preview-lifecycle:project-a:5173'),
    ).toHaveLength(0);
  });

  it('isolates scopes and re-adds a later incident', () => {
    for (const scope of ['project-a:5173', 'project-b:5173']) {
      useDiagnosticsStore.getState().clearDiagnosticsForSource(`preview-lifecycle:${scope}`);
      record({ scope, status: 'document', documentId: scope, observedAt: 90 });
      record({ scope, status: 'blank', documentId: scope, observedAt: 100, message: `blank ${scope}` });
    }

    record({
      scope: 'project-a:5173',
      status: 'document',
      documentId: 'document-a-recovered',
      observedAt: 110,
    });
    record({
      scope: 'project-a:5173',
      status: 'ok',
      documentId: 'document-a-recovered',
      observedAt: 120,
    });

    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'blank project-b:5173' }),
    );
    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: 'blank project-a:5173' }),
    );

    record({
      scope: 'project-a:5173',
      status: 'document',
      documentId: 'document-a-again',
      observedAt: 125,
    });
    record({
      scope: 'project-a:5173',
      status: 'blank',
      documentId: 'document-a-again',
      observedAt: 130,
      message: 'blank project-a again',
    });

    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'blank project-a again' }),
    );
  });

  it('does not trust a forged lifecycle marker in project stdout', () => {
    const diagnostics = buildRuntimeDiagnostics({
      workspaceLogs: ['VIBECORE_PREVIEW_LIFECYCLE {"status":"ok"}'],
    });

    expect(diagnostics).toHaveLength(0);
  });

  it('rejects delayed OK from the previous document', () => {
    const scope = 'project-stale:5173';
    useDiagnosticsStore.getState().clearDiagnosticsForSource(`preview-lifecycle:${scope}`);
    record({ scope, status: 'document', documentId: 'old-document', observedAt: 100 });
    record({ scope, status: 'blank', documentId: 'old-document', observedAt: 110, message: 'still blank' });
    record({ scope, status: 'document', documentId: 'new-document', observedAt: 120 });
    record({ scope, status: 'ok', documentId: 'old-document', observedAt: 130 });

    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'still blank' }),
    );

    record({ scope, status: 'ok', documentId: 'new-document', observedAt: 140 });
    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: 'still blank' }),
    );
  });

  it('clears only the previous project owner and survives a same-project Preview tab unmount', () => {
    record({ scope: 'project-owner-a:5173', status: 'document', documentId: 'document-a', observedAt: 100 });
    record({
      scope: 'project-owner-a:5173',
      status: 'blank',
      documentId: 'document-a',
      observedAt: 110,
      message: 'project A blank',
    });

    // No Preview cleanup action is called on a tab switch: state stays visible.
    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'project A blank' }),
    );

    useDiagnosticsStore.getState().clearPreviewLifecycleOwner('project-owner-a');
    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: 'project A blank' }),
    );
  });

  it('clears a previous port scope without touching another preview tab', () => {
    for (const scope of ['project-port:5173:tab-a', 'project-port:5173:tab-b']) {
      record({ scope, status: 'document', documentId: `${scope}-doc`, observedAt: 100 });
      record({
        scope,
        status: 'blank',
        documentId: `${scope}-doc`,
        observedAt: 110,
        message: `blank ${scope}`,
      });
    }

    useDiagnosticsStore.getState().clearPreviewLifecycleScope('project-port:5173:tab-a');
    record({ scope: 'project-port:3000:tab-a', status: 'document', documentId: 'new-port-doc', observedAt: 120 });
    record({ scope: 'project-port:3000:tab-a', status: 'ok', documentId: 'new-port-doc', observedAt: 130 });

    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: 'blank project-port:5173:tab-a' }),
    );
    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'blank project-port:5173:tab-b' }),
    );
  });

  it('prunes an old port after Preview remount without touching another tab', () => {
    for (const scope of ['project-remount:5173:tab-a', 'project-remount:5173:tab-b']) {
      record({ scope, status: 'document', documentId: `${scope}-doc`, observedAt: 100 });
      record({ scope, status: 'blank', documentId: `${scope}-doc`, observedAt: 110, message: `blank ${scope}` });
    }
    useDiagnosticsStore
      .getState()
      .prunePreviewLifecycleInstance('project-remount', 'tab-a', 'project-remount:3000:tab-a');

    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: 'blank project-remount:5173:tab-a' }),
    );
    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: 'blank project-remount:5173:tab-b' }),
    );
  });

  it('isolates identical tab ids across Project Editor windows', () => {
    const windowA = createPreviewLifecycleInstanceId('window:a', 'tab-preview');
    const windowB = createPreviewLifecycleInstanceId('window', 'a~tab-preview');
    const scopes = [`project-window:5173:${windowA}`, `project-window:3000:${windowB}`];

    for (const scope of scopes) {
      record({ scope, status: 'document', documentId: `${scope}-doc`, observedAt: 100 });
      record({ scope, status: 'blank', documentId: `${scope}-doc`, observedAt: 110, message: `blank ${scope}` });
    }

    useDiagnosticsStore
      .getState()
      .clearPreviewLifecycleWindow('project-window', previewLifecycleWindowInstancePrefix('window'));
    expect(useDiagnosticsStore.getState().diagnostics).toContainEqual(
      expect.objectContaining({ message: `blank ${scopes[0]}` }),
    );
    expect(useDiagnosticsStore.getState().diagnostics).not.toContainEqual(
      expect.objectContaining({ message: `blank ${scopes[1]}` }),
    );
  });
});
