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

/*
 * The ratchet, flipped.
 *
 * #363 froze a list of five known offenders so the debt could not GROW while the
 * migration happened. Now that all five are migrated, the assertion becomes the
 * stronger one: the list must be EMPTY. A store that goes back to writing a
 * secret — or a NEW provider store that starts out writing one — fails here.
 *
 * Source-level, deliberately: the per-store tests above prove the five current
 * call sites are correct, and this proves nobody adds a sixth.
 */
describe('AUDX-007 no store writes a secret to storage at all', () => {
  it('has zero provider stores persisting a credential field', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    /*
     * Resolved from THIS FILE, never from process.cwd(): in a git worktree the
     * cwd-relative path climbs out of the checkout and scans the MAIN working
     * tree instead — the test would then pass or fail on somebody else's files.
     */
    const dir = dirname(fileURLToPath(import.meta.url));
    const entries = await readdir(dir);
    const offenders: string[] = [];

    /*
     * Match a persisted credential FIELD, not the word "token" in prose:
     * comments are stripped first, and `\btoken\b` declines to match
     * `token_refresh` because `_` is a word character.
     */
    const WRITES_STORAGE = /(?:localStorage|storage)\s*\??\.\s*setItem\s*\(/;
    const PERSISTS_SECRET = /\b(?:token|credentials|apiKey|anonKey)\b\s*[:,)]/;

    function stripComments(source: string) {
      return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    }

    for (const entry of entries) {
      if (!entry.endsWith('.ts') || entry.includes('.spec.')) {
        continue;
      }

      const code = stripComments(await readFile(join(dir, entry), 'utf8'));

      /*
       * A raw setItem is only an offence when the SAME statement carries a
       * secret field; the stores legitimately still cache their non-secret half.
       */
      for (const statement of code.split(';')) {
        if (WRITES_STORAGE.test(statement) && PERSISTS_SECRET.test(statement)) {
          offenders.push(entry);
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
