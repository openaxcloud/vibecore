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
});
