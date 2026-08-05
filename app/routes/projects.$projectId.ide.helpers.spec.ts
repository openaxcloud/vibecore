import { describe, expect, it, vi } from 'vitest';
import { buildIdeNotifications, restartWorkspace, type RuntimeState } from './projects.$projectId.ide.helpers';

const projectUrl = '/projects/p1/ide';

function runtimeNotification(state: RuntimeState, error?: string | null, language?: string) {
  const items = buildIdeNotifications({
    projectUrl,
    backendEvents: [],
    runtimeState: state,
    runtimeError: error,
    previewPorts: [],
    language,
  });

  return items.find((item) => item.source === 'runtime');
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

  it('localizes the runtime recovery copy and masks a raw English runtime error in French', () => {
    const note = runtimeNotification('crashed', 'Raw Kubernetes English error', 'fr');

    expect(note?.title).toBe('Espace de travail en panne');
    expect(note?.detail).toBe('L’environnement d’exécution de l’espace de travail a signalé une erreur.');
    expect(note?.detail).not.toContain('Kubernetes');
    expect(note?.action).toEqual({ kind: 'restart-workspace', label: 'Redémarrer l’espace de travail' });
  });

  it('uses French plural copy for preview ports', () => {
    const [runtime, preview] = buildIdeNotifications({
      projectUrl,
      backendEvents: [],
      runtimeState: 'running',
      previewPorts: [3000, 4173],
      language: 'fr',
    });

    expect(runtime.source).toBe('runtime');
    expect(preview.source).toBe('preview');
    expect(preview.detail).toBe('Ports d’aperçu en direct : 3000, 4173');
  });
});

describe('restartWorkspace', () => {
  it('invokes the injected reload to re-provision the workspace', () => {
    const reload = vi.fn();

    restartWorkspace(reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
