import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessionUser, sessionDisplayName, sessionUserStore } from './session-user';

/** UIB-03 — le nom affiché dans la coque vient du compte authentifié. */
describe('sessionDisplayName', () => {
  const REPLI = 'Utilisateur connecté';

  it('préfère le compte authentifié au profil local', () => {
    expect(sessionDisplayName({ displayName: 'Ada', name: 'Ada L.', email: 'a@x.test' }, 'ancien-local', REPLI)).toBe(
      'Ada',
    );
  });

  it('retombe sur le nom, puis le profil local, puis le courriel, puis le libellé', () => {
    expect(sessionDisplayName({ displayName: ' ', name: 'Ada L.', email: null }, '', REPLI)).toBe('Ada L.');
    expect(sessionDisplayName(null, 'local', REPLI)).toBe('local');
    expect(sessionDisplayName({ displayName: null, name: null, email: 'a@x.test' }, '', REPLI)).toBe('a@x.test');
    expect(sessionDisplayName(null, undefined, REPLI)).toBe(REPLI);
  });
});

describe('loadSessionUser', () => {
  beforeEach(() => sessionUserStore.set(null));

  it('lit /api/auth/user une seule fois et garde le nom en mémoire', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ displayName: 'Ada', name: 'Ada', email: 'a@x.test' }), { status: 200 }),
    );

    await Promise.all([loadSessionUser(fetcher as typeof fetch), loadSessionUser(fetcher as typeof fetch)]);
    await loadSessionUser(fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/auth/user');
    expect(sessionUserStore.get()?.displayName).toBe('Ada');
  });

  it('laisse le magasin vide si la session est absente', async () => {
    await loadSessionUser((async () => new Response('', { status: 401 })) as typeof fetch);
    expect(sessionUserStore.get()).toBeNull();
  });

  it("n'écrit rien dans localStorage", async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    await loadSessionUser(
      (async () => new Response(JSON.stringify({ displayName: 'Ada' }), { status: 200 })) as typeof fetch,
    );
    expect(sessionUserStore.get()?.displayName).toBe('Ada');
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
