/**
 * @vitest-environment jsdom
 *
 * AUDX-007 — the Vercel store must stop writing the PAT to localStorage.
 *
 * This is the half that actually removes the exposure: the migration moves the
 * EXISTING token off the browser, and this stops a NEW one from landing there
 * on the next update.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/i18n/runtime', () => ({ getI18nInstance: () => ({ resolvedLanguage: 'en', language: 'en' }) }));
vi.mock('./logs', () => ({ logStore: { logInfo: vi.fn(), logError: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AUDX-007 Vercel token is not persisted', () => {
  it('never writes the token into localStorage', async () => {
    const { updateVercelConnection } = await import('./vercel');

    updateVercelConnection({ user: { username: 'someone' } as never, token: 'pat_secret_value' });

    const raw = localStorage.getItem('vercel_connection') ?? '';

    expect(raw).not.toContain('pat_secret_value');
    expect(JSON.parse(raw)).not.toHaveProperty('token');
  });

  /*
   * Rule 19 counterpart: the non-secret half must still be cached, or the panel
   * loses its rendered state on every reload and the change reads as a
   * regression rather than a fix.
   */
  it('still caches the non-secret connection state', async () => {
    const { updateVercelConnection } = await import('./vercel');

    updateVercelConnection({ user: { username: 'someone' } as never, token: 'pat_secret_value' });

    const parsed = JSON.parse(localStorage.getItem('vercel_connection') ?? '{}');

    expect(parsed.user).toMatchObject({ username: 'someone' });
  });
});
