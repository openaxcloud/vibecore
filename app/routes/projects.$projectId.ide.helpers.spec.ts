import { describe, expect, it, vi } from 'vitest';
import { buildIdeNotifications, restartWorkspace, type RuntimeState } from './projects.$projectId.ide.helpers';

const projectUrl = '/projects/p1/ide';

function runtimeNotification(state: RuntimeState, error?: string | null) {
  const items = buildIdeNotifications({
    projectUrl,
    backendEvents: [],
    runtimeState: state,
    runtimeStatusLabel: state[0].toUpperCase() + state.slice(1),
    runtimeError: error,
    previewPorts: [],
  });

  return items.find((item) => item.source === 'Runtime');
}

describe('buildIdeNotifications crashed-workspace recovery', () => {
  it('attaches a restart-workspace action to the crashed runtime notification', () => {
    const note = runtimeNotification('crashed', 'pod was reaped');

    expect(note).toBeDefined();
    expect(note?.kind).toBe('error');
    expect(note?.detail).toBe('pod was reaped');

    /*
     * The whole point of the fix: a crashed runtime must offer a real recovery
     * affordance, not only an href to the logs panel.
     */
    expect(note?.action).toEqual({ kind: 'restart-workspace', label: 'Restart workspace' });
  });

  it.each<RuntimeState>(['running', 'building', 'stopped'])(
    'does not attach a restart action for the %s runtime state',
    (state) => {
      const note = runtimeNotification(state);

      expect(note).toBeDefined();
      expect(note?.action).toBeUndefined();
    },
  );

  it('still links the crashed notification to the logs panel as a fallback', () => {
    const note = runtimeNotification('crashed');

    expect(note?.href).toContain('panel=logs');
  });
});

describe('restartWorkspace', () => {
  it('invokes the injected reload to re-provision the workspace', () => {
    const reload = vi.fn();

    restartWorkspace(reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
