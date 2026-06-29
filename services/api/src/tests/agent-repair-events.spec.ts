import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'repair@example.com',
    name: 'Repair User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Repair Org', slug: 'repair-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'repair-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'Repair Project', slug: 'repair-project' });

  return { app, token: 'repair-token', project };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('agent self-repair history API', () => {
  it('records a repair event and lists it back (newest first)', async () => {
    const { app, token, project } = await setup();

    const rec1 = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/agent-repair-events`,
      headers: auth(token),
      payload: {
        relativePath: 'src/App.tsx',
        attempt: 1,
        outcome: 'failed',
        validationError: 'Unexpected token (12:4)',
      },
    });
    expect(rec1.statusCode).toBe(200);
    expect(rec1.json().event).toMatchObject({ relativePath: 'src/App.tsx', outcome: 'failed', attempt: 1 });

    const rec2 = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/agent-repair-events`,
      headers: auth(token),
      payload: { relativePath: 'src/App.tsx', attempt: 2, outcome: 'repaired' },
    });
    expect(rec2.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent-repair-events`,
      headers: auth(token),
    });
    expect(list.statusCode).toBe(200);
    const events = list.json().events as Array<{ outcome: string; attempt: number }>;
    expect(events).toHaveLength(2);
    // newest first
    expect(events[0]).toMatchObject({ outcome: 'repaired', attempt: 2 });
    expect(events[1]).toMatchObject({ outcome: 'failed', attempt: 1 });
  });

  it('honours the limit query', async () => {
    const { app, token, project } = await setup();
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/agent-repair-events`,
        headers: auth(token),
        payload: { relativePath: `f${i}.ts`, outcome: 'gave_up' },
      });
    }

    const list = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/agent-repair-events?limit=2`,
      headers: auth(token),
    });
    expect(list.json().events).toHaveLength(2);
  });

  it('rejects an invalid outcome (400)', async () => {
    const { app, token, project } = await setup();

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/agent-repair-events`,
      headers: auth(token),
      payload: { relativePath: 'x.ts', outcome: 'nonsense' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated access', async () => {
    const { app, project } = await setup();

    expect((await app.inject({ method: 'GET', url: `/projects/${project.id}/agent-repair-events` })).statusCode).toBe(401);
  });
});
