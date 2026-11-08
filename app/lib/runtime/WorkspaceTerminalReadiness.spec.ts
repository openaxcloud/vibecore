import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceTerminalReadiness } from './WorkspaceTerminalReadiness';

describe('workspace-scoped terminal readiness', () => {
  it('runs queued and later subscribers once, and permits cancellation', () => {
    const readiness = createWorkspaceTerminalReadiness();
    const cancelled = vi.fn();
    const first = vi.fn();
    const later = vi.fn();
    const unsubscribe = readiness.subscribe(cancelled);
    readiness.subscribe(first);
    unsubscribe();
    readiness.open();
    readiness.open();
    readiness.subscribe(later);
    expect(cancelled).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(later).toHaveBeenCalledOnce();
  });

  it('invalidates old pending work on cleanup without claiming readiness', () => {
    const readiness = createWorkspaceTerminalReadiness();
    const abandoned = vi.fn();
    const restarted = vi.fn();
    readiness.subscribe(abandoned);
    readiness.close();
    readiness.subscribe(restarted);
    expect(restarted).not.toHaveBeenCalled();
    readiness.open();
    expect(abandoned).not.toHaveBeenCalled();
    expect(restarted).toHaveBeenCalledOnce();
  });

  it('does not attach a second terminal cancelled by the first callback', () => {
    const readiness = createWorkspaceTerminalReadiness();
    const second = vi.fn();

    let cancelSecond: () => void = vi.fn();
    readiness.subscribe(() => cancelSecond());
    cancelSecond = readiness.subscribe(second);
    readiness.open();
    expect(second).not.toHaveBeenCalled();
  });
});

/*
 * Keep the provider wiring covered as well as the independently exercised consumer.
 * This follows the existing ecritures-en-attente-cablage tests for async startup ordering.
 */
describe('real workspace provider attachment ordering', () => {
  const source = readFileSync(new URL('./ProjectWorkspaceProvider.tsx', import.meta.url), 'utf8');

  const position = (text: string) => {
    const index = source.indexOf(text);
    expect(index, text).toBeGreaterThanOrEqual(0);

    return index;
  };

  it('opens only after real startup, seed and hydration, behind the final cancellation guard', () => {
    const open = position('terminalReadiness.open();');
    expect(open).toBeGreaterThan(position('await runtime.startWorkspace('));
    expect(open).toBeGreaterThan(position('await reseedWorkspacePreservingOnFailure('));
    expect(open).toBeGreaterThan(position("await workbenchStore.loadRuntimeFiles('.')"));

    const finalCancellation = source.lastIndexOf('if (cancelled)', open);
    expect(finalCancellation).toBeGreaterThan(position("await workbenchStore.loadRuntimeFiles('.')"));
    expect(source.slice(finalCancellation, open)).toContain('return;');
    expect(open).toBeLessThan(position('void workbenchStore.startPreviewServer()'));
  });

  it('keys readiness by project/workspace as well as runtime and closes on cleanup', () => {
    expect(source).toContain('[runtime, projectId, workspaceId, initialError]');
    expect(source).toContain('value={terminalReadiness}');
    expect(source.slice(position('cancelled = true;'))).toMatch(/cancelled = true;\s*terminalReadiness\.close\(\);/);
  });
});
