import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { normalizeVercelUser, VERCEL_CLIENT_COOKIE_KEYS_FORBIDDEN } from './vercel-connect';
import type { VercelUserResponse } from '~/types/vercel';

const here = dirname(fileURLToPath(import.meta.url));

describe('normalizeVercelUser', () => {
  it('flattens the nested `user` shape (team token)', () => {
    const resp: VercelUserResponse = {
      user: { id: 'u1', username: 'alice', email: 'a@x.dev', name: 'Alice', avatar: 'av' },
    };
    expect(normalizeVercelUser(resp)).toEqual({
      id: 'u1',
      username: 'alice',
      email: 'a@x.dev',
      name: 'Alice',
      avatar: 'av',
    });
  });

  it('uses the inline shape (personal token) when `user` is absent', () => {
    const resp: VercelUserResponse = {
      id: 'u2',
      username: 'bob',
      email: 'b@x.dev',
      name: 'Bob',
    };
    expect(normalizeVercelUser(resp)).toEqual({
      id: 'u2',
      username: 'bob',
      email: 'b@x.dev',
      name: 'Bob',
      avatar: undefined,
    });
  });

  it('coalesces missing inline fields to empty strings', () => {
    expect(normalizeVercelUser({} as VercelUserResponse)).toEqual({
      id: '',
      username: '',
      email: '',
      name: '',
      avatar: undefined,
    });
  });
});

describe('Vercel access token is never written to a client cookie (XSS exfil guard)', () => {
  const source = readFileSync(join(here, 'VercelTab.tsx'), 'utf8');

  it('does not call Cookies.set with the Vercel token', () => {
    // The whole bug was `Cookies.set('VITE_VERCEL_ACCESS_TOKEN', token, { expires: 365 })`.
    expect(source).not.toMatch(/Cookies\.set\s*\(/);
  });

  it('does not persist a 365-day token cookie', () => {
    for (const key of VERCEL_CLIENT_COOKIE_KEYS_FORBIDDEN) {
      // A set() targeting the forbidden key in any form must not exist.
      expect(source).not.toMatch(new RegExp(`Cookies\\.set\\([^)]*${key}`));
    }
    expect(source).not.toContain('expires: 365');
  });

  it('still clears any pre-existing legacy cookie on disconnect (defensive cleanup)', () => {
    expect(source).toMatch(/Cookies\.remove\(['"]VITE_VERCEL_ACCESS_TOKEN['"]\)/);
  });
});
