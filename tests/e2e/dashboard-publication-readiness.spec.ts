import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a real pending or failed deployment does not complete dashboard onboarding', async ({
  page,
  request,
  baseURL,
}) => {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const appBaseUrl = baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

  // This test creates disposable data and must only target the isolated local stack.
  for (const url of [apiBaseUrl, appBaseUrl]) {
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(url).hostname);
  }

  const suffix = randomUUID();
  const registration = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `publication-${suffix}@local.test`,
      password: 'Test-publication-123!',
      name: 'Publication readiness test',
      organizationName: `Publication readiness ${suffix}`,
    },
  });

  expect(registration.ok(), `registration returned ${registration.status()}`).toBe(true);

  const auth = (await registration.json()) as { token: string; organization: { id: string } };
  const headers = { authorization: `Bearer ${auth.token}` };
  const projectResponse = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers,
    data: { name: `Publication readiness ${suffix}` },
  });

  expect(projectResponse.ok(), `project creation returned ${projectResponse.status()}`).toBe(true);

  const { project } = (await projectResponse.json()) as { project: { id: string } };
  const deploymentResponse = await request.post(`${apiBaseUrl}/projects/${project.id}/deployments`, {
    headers,
    data: { provider: 'static', buildCommand: 'exit 1', timeoutSeconds: 30 },
  });

  expect(deploymentResponse.ok(), `deployment creation returned ${deploymentResponse.status()}`).toBe(true);

  const deploymentsResponse = await request.get(`${apiBaseUrl}/projects/${project.id}/deployments`, { headers });

  expect(deploymentsResponse.ok()).toBe(true);

  const { deployments } = (await deploymentsResponse.json()) as { deployments: Array<{ status: string }> };

  expect(deployments).toHaveLength(1);
  expect(['QUEUED', 'BUILDING', 'FAILED', 'CANCELED']).toContain(deployments[0].status);

  await page
    .context()
    .addCookies([{ name: 'vc_session', value: auth.token, url: appBaseUrl, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto('/dashboard?lang=en');

  const setup = page.getByRole('region', { name: 'Get set up' });

  await expect(setup.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '1');
  await expect(setup.getByRole('link', { name: 'Deploy', exact: true })).toHaveAttribute(
    'href',
    `/projects/${project.id}/deployments`,
  );
  await expect(setup.getByRole('link', { name: 'Deploy', exact: true })).toBeVisible();
});
