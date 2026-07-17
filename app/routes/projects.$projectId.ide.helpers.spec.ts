import { describe, expect, it, vi } from 'vitest';
import {
  activityDetail,
  buildIdeNotifications,
  restartWorkspace,
  type RuntimeState,
} from './projects.$projectId.ide.helpers';

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

describe('buildIdeNotifications crashed-runtime recovery', () => {
  it('attaches a restart-workspace action to the crashed runtime notification', () => {
    const note = runtimeNotification('crashed', 'pod was reaped');

    expect(note).toBeDefined();
    expect(note?.kind).toBe('error');
    expect(note?.detail).toBe('pod was reaped');

    /*
     * The whole point of the fix: a crashed runtime must offer a real recovery
     * affordance, not only an href to the logs panel.
     */
    expect(note?.action).toEqual({ kind: 'restart-workspace', label: 'Restart runtime' });
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

  it.each<RuntimeState>(['running', 'building', 'crashed', 'stopped'])(
    'uses Project/runtime terminology for the %s runtime notification',
    (state) => {
      const note = runtimeNotification(state);
      const userVisibleCopy = [note?.title, note?.detail, note?.action?.label].filter(Boolean).join(' ');

      expect(note?.title).toBe(`Project runtime ${state}`);
      expect(userVisibleCopy).not.toMatch(/\bworkspace\b/i);
    },
  );
});

describe('restartWorkspace', () => {
  it('invokes the injected reload to re-provision the project runtime', () => {
    const reload = vi.fn();

    restartWorkspace(reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('activityDetail', () => {
  it('describes AI changes as project changes rather than organization Workspace changes', () => {
    expect(activityDetail('ai.tool.completed', null)).toBe('An AI tool action changed the project.');
  });
});
