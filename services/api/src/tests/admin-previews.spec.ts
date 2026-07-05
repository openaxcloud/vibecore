import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const admin = await store.createUser({
    email: 'admin@example.com',
    name: 'Admin',
    passwordHash: hashPassword('password123'),
    platformAdmin: true,
  });
  await store.updateUser({ userId: admin.id, mfaEnabled: true });
  await store.createSession({ userId: admin.id, token: 'admin-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store };
}

describe('F25 admin previews — default TTL', () => {
  it('falls back to a 120-minute default when unset', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultTtlMinutes).toBe(120);
  });

  it('reflects the preview.defaultTtlMinutes system setting', async () => {
    const { app, store } = await setup();
    await store.setSystemSetting({ key: 'preview.defaultTtlMinutes', value: 45 });

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('admin-token') });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultTtlMinutes).toBe(45);
  });

  it('forbids non-admins', async () => {
    const { app, store } = await setup();
    const user = await store.createUser({
      email: 'user@example.com',
      name: 'User',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });

    const res = await app.inject({ method: 'GET', url: '/admin/previews', headers: auth('user-token') });
    expect(res.statusCode).toBe(403);
  });
});
