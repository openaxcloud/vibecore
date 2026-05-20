import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';

type AuthPayload = { token: string; organization: { id: string } };

const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';
const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

const ideServicePanels = [
  'overview',
  'database',
  'object-storage',
  'packages',
  'monitoring',
  'extensions',
  'integrations',
  'workflows',
  'debugger',
  'deployments',
  'security',
  'env',
  'secrets',
  'git',
  'activity',
  'terminal',
  'logs',
  'collaborators',
  'domains',
  'snapshots',
  'settings',
] as const;

async function waitForRateLimitReset(responseText: string, fallbackMs = 10_000) {
  const seconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const waitMs = Number.isFinite(seconds) ? (seconds + 1) * 1000 : fallbackMs;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function authenticate(request: APIRequestContext): Promise<AuthPayload> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let responseText = '';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        email: `panel-contract-${suffix}-${attempt}@local.test`,
        password: 'Password123!',
        name: 'Panel Contract E2E',
        organizationName: `Panel Contract E2E ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      return JSON.parse(responseText) as AuthPayload;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText);
      continue;
    }

    expect(response.ok(), responseText).toBeTruthy();
  }

  throw new Error(responseText || 'Unable to authenticate panel contract user');
}

async function createProject(request: APIRequestContext, auth: AuthPayload) {
  const createProject = await request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE panel API contract project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();

  return (await createProject.json()).project.id as string;
}

test('IDE service panels return real backend envelopes without API contract mismatch', async ({ page, request }) => {
  test.setTimeout(180_000);

  const auth = await authenticate(request);
  const projectId = await createProject(request, auth);

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  for (const panel of ideServicePanels) {
    const response = await page.request.get(`${appBaseUrl}/api/projects/${projectId}/ide-panel/${panel}`);
    const responseText = await response.text();

    expect(response.ok(), `${panel} HTTP ${response.status()}: ${responseText}`).toBeTruthy();

    const envelope = JSON.parse(responseText) as {
      panel?: string;
      project?: unknown;
      status?: string;
      data?: unknown;
      error?: unknown;
    };

    expect(envelope.panel, `${panel} envelope.panel`).toBe(panel);
    expect(envelope.project, `${panel} envelope.project`).toBeTruthy();
    expect(['ok', 'empty']).toContain(envelope.status);
    expect(envelope).toHaveProperty('data');
    expect(envelope.error, `${panel} backend error`).toBeUndefined();
  }
});

test('IDE panel BFF rejects unauthenticated access instead of leaking project data', async ({ request }) => {
  const auth = await authenticate(request);
  const projectId = await createProject(request, auth);
  const isolatedContext = await playwrightRequest.newContext();

  try {
    const response = await isolatedContext.get(`${appBaseUrl}/api/projects/${projectId}/ide-panel/settings`);

    expect([401, 403, 302]).toContain(response.status());
  } finally {
    await isolatedContext.dispose();
  }
});
