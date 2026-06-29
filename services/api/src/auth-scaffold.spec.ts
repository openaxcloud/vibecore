import { describe, expect, it } from 'vitest';

import { generateAuthJwtSecret, generateAuthScaffoldFiles, isAuthScaffoldEnabled } from './auth-scaffold.js';

describe('auth-scaffold', () => {
  it('is gated behind AUTH_SCAFFOLD_ENABLED', () => {
    const prev = process.env.AUTH_SCAFFOLD_ENABLED;
    process.env.AUTH_SCAFFOLD_ENABLED = 'false';
    expect(isAuthScaffoldEnabled()).toBe(false);
    process.env.AUTH_SCAFFOLD_ENABLED = 'true';
    expect(isAuthScaffoldEnabled()).toBe(true);
    process.env.AUTH_SCAFFOLD_ENABLED = prev;
  });

  it('emits the real auth files (migration, Express router, login page, README)', () => {
    const files = generateAuthScaffoldFiles();
    const byPath = new Map(files.map((f) => [f.path, f.content]));

    expect([...byPath.keys()].sort()).toEqual(
      ['auth/README.md', 'auth/index.js', 'auth/login.html', 'db/migrations/0001_create_users.sql'].sort(),
    );

    // Migration creates the users table with a unique email + password hash.
    const sql = byPath.get('db/migrations/0001_create_users.sql')!;
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS users/);
    expect(sql).toMatch(/email\s+TEXT NOT NULL UNIQUE/);
    expect(sql).toMatch(/password_hash\s+TEXT NOT NULL/);

    // Router is real, runnable Express: signup/login/logout/me + requireAuth, JWT cookie.
    const js = byPath.get('auth/index.js')!;

    for (const needle of [
      "require('express')",
      "require('bcryptjs')",
      "require('jsonwebtoken')",
      "require('pg')",
      "router.post('/auth/signup'",
      "router.post('/auth/login'",
      "router.post('/auth/logout'",
      "router.get('/auth/me'",
      'function requireAuth',
      'process.env.DATABASE_URL',
      'process.env.AUTH_JWT_SECRET',
      'module.exports = { router, requireAuth, pool }',
    ]) {
      expect(js, `auth/index.js should contain ${needle}`).toContain(needle);
    }

    // Login page posts to the real endpoints; never references a mock.
    const html = byPath.get('auth/login.html')!;
    expect(html).toContain('/auth/login');
    expect(html).toContain('/auth/signup');
    expect(html.toLowerCase()).not.toContain('mock');
  });

  it('generates a strong, unique JWT secret each call', () => {
    const a = generateAuthJwtSecret();
    const b = generateAuthJwtSecret();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 48 bytes base64url ≈ 64 chars
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
