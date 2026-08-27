// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ECODE_BRAND } from './gitlabBrand';
import { LocalModelHealthMonitor } from './localModelHealthMonitor';

describe('LocalModelHealthMonitor LM Studio CORS error copy', () => {
  let monitor: LocalModelHealthMonitor;

  beforeEach(() => {
    monitor = new LocalModelHealthMonitor();
  });

  afterEach(() => {
    monitor.destroy();
    vi.restoreAllMocks();
  });

  it('surfaces the E-Code brand (not the upstream codename) in the CORS error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');

    expect(result.isHealthy).toBe(false);
    expect(result.error).toContain('CORS_ERROR');
    expect(result.error).toContain(`${ECODE_BRAND} desktop app`);

    // Brand-leak guard: the upstream codename must never reach the user.
    expect(result.error?.toLowerCase()).not.toContain('bolt');
  });

  it('relocalizes a persistent health failure when the active language changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch secret=raw')));

    const changedStatuses: string[] = [];
    monitor.on('statusChanged', (status) => changedStatuses.push(status.error ?? ''));

    await monitor.performHealthCheck('LMStudio', 'http://localhost:1234');

    window.dispatchEvent(new CustomEvent('vibecore:language-change', { detail: { language: 'fr' } }));

    const frenchStatus = monitor.getHealthStatus('LMStudio', 'http://localhost:1234');
    expect(frenchStatus?.error).toContain('bloque les requêtes provenant de cette origine');
    expect(frenchStatus?.error).toContain('LM Studio');
    expect(frenchStatus?.error).not.toContain('Failed to fetch');
    expect(frenchStatus?.error).not.toContain('secret=raw');
    expect(changedStatuses.at(-1)).toBe(frenchStatus?.error);

    window.dispatchEvent(new CustomEvent('vibecore:language-change', { detail: { language: 'en' } }));
    expect(monitor.getHealthStatus('LMStudio', 'http://localhost:1234')?.error).toContain(
      'is blocking requests from this origin',
    );
  });

  it('keeps the HTTP code but never exposes an English response status text in French', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable secret=raw',
        type: 'basic',
      }),
    );

    await monitor.performHealthCheck('Ollama', 'http://localhost:11434');
    monitor.refreshLocalizedErrors('fr');

    const error = monitor.getHealthStatus('Ollama', 'http://localhost:11434')?.error;
    expect(error).toBe('Le point de terminaison Ollama a renvoyé le code HTTP 503.');
    expect(error).not.toContain('Service Unavailable');
    expect(error).not.toContain('secret=raw');
  });
});
