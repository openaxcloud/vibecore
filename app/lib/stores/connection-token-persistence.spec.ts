/**
 * @vitest-environment jsdom
 *
 * AUDX-007 — no provider store may write its secret to localStorage.
 *
 * This is the assertion that has to hold for ALL FIVE, not just the one that was
 * migrated first. The ratchet in #363 stopped the debt from growing; this stops
 * it from existing.
 *
 * Deliberately driven through each store's REAL update function rather than the
 * shared helper: the helper being correct proves nothing if a store forgets to
 * call it, and "the mechanism is fine, the call site is not" is the single most
 * common shape of defect in this repo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/i18n/runtime', () => ({ getI18nInstance: () => ({ resolvedLanguage: 'en', language: 'en' }) }));
vi.mock('./logs', () => ({ logStore: { logInfo: vi.fn(), logError: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SECRET = 'pat_super_secret_value';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  localStorage.clear();
});

/** Everything the browser persisted, whatever the key. */
function allPersisted(): string {
  return Object.keys(localStorage)
    .map((key) => `${key}=${localStorage.getItem(key)}`)
    .join('\n');
}

describe('AUDX-007 no provider store persists its secret', () => {
  it('github', async () => {
    const { updateGitHubConnection } = await import('./github');

    updateGitHubConnection({ user: { login: 'someone' } as never, token: SECRET });

    expect(allPersisted()).not.toContain(SECRET);
  });

  it('netlify', async () => {
    const { updateNetlifyConnection } = await import('./netlify');

    updateNetlifyConnection({ user: { full_name: 'someone' } as never, token: SECRET });

    expect(allPersisted()).not.toContain(SECRET);
  });

  it('vercel', async () => {
    const { updateVercelConnection } = await import('./vercel');

    updateVercelConnection({ user: { username: 'someone' } as never, token: SECRET });

    expect(allPersisted()).not.toContain(SECRET);
  });

  it('supabase — the management token AND the anon key', async () => {
    const { updateSupabaseConnection } = await import('./supabase');

    updateSupabaseConnection({
      user: { id: 'u1' } as never,
      token: SECRET,
      credentials: { anonKey: 'anon_secret_value', supabaseUrl: 'https://x.supabase.co' },
    });

    const persisted = allPersisted();

    expect(persisted).not.toContain(SECRET);
    expect(persisted).not.toContain('anon_secret_value');

    // The dedicated credentials key must not survive either.
    expect(localStorage.getItem('supabaseCredentials')).toBeNull();
  });

  /*
   * Rule 19 counterpart: the NON-secret half must still be cached, or every
   * panel flashes empty on reload and the change reads as a regression.
   */
  it('still caches the non-secret half', async () => {
    const { updateVercelConnection } = await import('./vercel');

    updateVercelConnection({ user: { username: 'someone' } as never, token: SECRET });

    expect(localStorage.getItem('vercel_connection')).toContain('someone');
  });
});
