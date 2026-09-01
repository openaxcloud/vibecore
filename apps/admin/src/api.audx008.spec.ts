import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * AUDX-008 — the admin bearer must not be persisted in the browser.
 *
 * It lived in localStorage under `vibecore_admin_token`: a full-privilege
 * PLATFORM ADMIN credential, readable by any script on the origin, surviving
 * reloads indefinitely. One XSS anywhere on the admin origin was a permanent
 * admin takeover.
 *
 * It was also redundant — /auth/login already sets the httpOnly `session`
 * cookie and the API's bearerToken() falls back to it.
 */
let api: typeof import('./api');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  api = await import('./api');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AUDX-008 admin credential is never persisted', () => {
  /* The decisive assertion: nothing lands in storage, ever. */
  it('writes no admin token to localStorage on login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ token: 'admin-session-token' }), { status: 200 })),
    );

    await api.loginAdmin('admin@example.com', 'password');

    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('vibecore_admin_token')).toBeNull();
  });

  it('keeps a manually pasted token in memory only', () => {
    api.setAdminToken('pasted-token');

    expect(api.getAdminToken()).toBe('pasted-token');
    expect(localStorage.getItem('vibecore_admin_token')).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  /*
   * Cookie auth is the replacement, so every request must carry the cookie.
   * Without credentials the change would simply log everyone out.
   */
  it('sends the session cookie on every request', async () => {
    const fetchMock = vi.fn(async (_input?: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.apiJson('/admin/overview');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  /*
   * With a cookie and NO Authorization header, the API applies requireCsrfToken
   * to mutations. Omitting the header would 403 every admin write — the
   * rule-19 failure mode: a security change that breaks normal work.
   */
  it('sends a CSRF header on mutating requests', async () => {
    const fetchMock = vi.fn(async (_input?: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.apiJson('/admin/users/u1/suspend', { method: 'POST', body: '{}' });

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBeTruthy();
  });

  it('does NOT send a CSRF header on reads', async () => {
    const fetchMock = vi.fn(async (_input?: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.apiJson('/admin/overview');

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  /* A pasted token must still authenticate for the tab that pasted it. */
  it('sends a pasted token as a bearer while it is held in memory', async () => {
    const fetchMock = vi.fn(async (_input?: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    api.setAdminToken('pasted-token');
    await api.apiJson('/admin/overview');

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer pasted-token');
  });

  it('reports a live session from the cookie, not from storage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"id":"u1"}', { status: 200 })),
    );
    await expect(api.hasAdminSession()).resolves.toBe(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    await expect(api.hasAdminSession()).resolves.toBe(false);
  });
});

describe('AUDX-007 no provider store persists a credential', () => {
  /*
   * A RATCHET, not a fix. The five legacy provider stores still persist their
   * PAT in localStorage (github, gitlab, netlify, supabase, vercel) — migrating
   * them onto the existing server-side UserConnection + connector-proxy is a
   * separate piece of work. This test freezes that list so the debt cannot GROW
   * while the migration happens: a NEW store that persists a token fails here.
   */
  const KNOWN_LEGACY = ['github.ts', 'gitlabConnection.ts', 'netlify.ts', 'supabase.ts', 'vercel.ts'];

  /*
   * Detect a real credential FIELD, not the word "token" in prose. Comments are
   * stripped first: `files.ts` mentions chat tokens in a comment and `logs.ts`
   * has a `token_refresh` log action — a ratchet that fires on prose gets
   * deleted rather than obeyed. `\btoken\b` also declines to match
   * `token_refresh`, since `_` is a word character.
   */
  const WRITES_STORAGE = /(?:localStorage|storage)\s*\??\.\s*setItem\s*\(/;
  const USES_TOKEN_FIELD = /\btoken\b\s*[:,)]|\.\s*token\b/;

  function stripComments(source: string) {
    return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  it('does not add a new browser-persisted provider credential', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    /*
     * Resolve from THIS FILE, never from process.cwd(). In a git worktree the
     * cwd-relative path climbed out of the checkout and scanned the MAIN
     * working tree instead — the test passed or failed on somebody else's files.
     */
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app', 'lib', 'stores');
    const entries = await readdir(dir).catch(() => [] as string[]);
    const offenders: string[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) {
        continue;
      }

      const source = await readFile(join(dir, entry), 'utf8');

      const code = stripComments(source);

      if (WRITES_STORAGE.test(code) && USES_TOKEN_FIELD.test(code)) {
        offenders.push(entry);
      }
    }

    expect(offenders.sort()).toEqual(KNOWN_LEGACY.sort());
  });
});
