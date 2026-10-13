import { expect, test, type APIRequestContext } from '@playwright/test';
import { requireDatabaseSetup } from './helpers/ide-db-setup';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

async function createFixture(request: APIRequestContext) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `db-guard-${suffix}@local.test`,
      password: 'Password123!',
      name: 'DB guard',
      organizationName: `DB guard ${suffix}`,
    },
  });
  expect(registration.status()).toBe(201);

  const auth = await registration.json();
  const headers = { authorization: `Bearer ${auth.token}` };

  const creation = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: 'DB guard fixture' },
  });
  expect(creation.ok()).toBe(true);

  const projectId = (await creation.json()).project.id as string;

  return { headers, projectId };
}

test('DB setup guard rejects a real refused preparation before opening the panel', async ({ request }) => {
  const { headers, projectId } = await createFixture(request);
  const logout = await request.post(`${apiBaseUrl}/auth/logout`, { headers });
  expect(logout.status()).toBe(200);
  expect((await logout.json()).revoked).toBe(true);

  // Use the actual synthetic account's revoked token, never an anonymous or production credential.
  const response = await request.put(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
    headers,
    data: { key: 'DATABASE_URL', value: 'postgresql://fixture.invalid/unused' },
  });
  expect(response.status()).toBe(401);
  await expect(requireDatabaseSetup(response, projectId, 'postgresql://fixture.invalid/unused')).rejects.toThrow(
    'Database setup PUT failed: HTTP 401',
  );
});

test('DB setup guard verifies the persisted confirmation from the real API', async ({ request }) => {
  const { headers, projectId } = await createFixture(request);

  // Only exercise variable persistence. No schema/query/provisioning request is made.
  const value = 'postgresql://fixture.invalid/unused';

  const response = await request.put(`${apiBaseUrl}/projects/${projectId}/env-vars`, {
    headers,
    data: { key: 'DATABASE_URL', value },
  });
  await requireDatabaseSetup(response, projectId, value);
  await expect(requireDatabaseSetup(response, 'wrong-project', value)).rejects.toThrow(
    'missing or mismatched persisted confirmation',
  );
  await expect(requireDatabaseSetup(response, projectId, 'wrong-value')).rejects.toThrow(
    'missing or mismatched persisted confirmation',
  );
});
