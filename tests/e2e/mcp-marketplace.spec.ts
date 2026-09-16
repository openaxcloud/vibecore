import { expect, test } from '@playwright/test';

const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

async function registerAndAuthenticate(page: import('@playwright/test').Page) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `mcp-e2e-${suffix}@local.test`;

  const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      name: 'MCP E2E User',
      organizationName: `MCP E2E Org ${suffix}`,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  const payload = (await response.json()) as { token: string };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return { token: payload.token, email };
}

test.describe('MCP marketplace API contract', () => {
  test('lists catalog, filters by domain, returns counts', async ({ page }) => {
    const { token } = await registerAndAuthenticate(page);
    const auth = { Authorization: `Bearer ${token}` };

    const catalog = await page.request.get(`${apiBaseUrl}/mcp/catalog?limit=10`, { headers: auth });
    expect(catalog.ok()).toBeTruthy();

    const catalogBody = (await catalog.json()) as { items: Array<{ slug: string; domain: string }> };
    expect(catalogBody.items.length).toBeGreaterThan(0);

    const domains = await page.request.get(`${apiBaseUrl}/mcp/catalog/domains`, { headers: auth });
    expect(domains.ok()).toBeTruthy();

    const domainsBody = (await domains.json()) as { domains: Array<{ domain: string; count: number }> };
    expect(domainsBody.domains.length).toBeGreaterThan(5);
    expect(domainsBody.domains.every((row) => row.count > 0)).toBeTruthy();

    const databasesOnly = await page.request.get(`${apiBaseUrl}/mcp/catalog?domain=DATABASES`, { headers: auth });
    expect(databasesOnly.ok()).toBeTruthy();

    const dbBody = (await databasesOnly.json()) as { items: Array<{ slug: string; domain: string }> };
    expect(dbBody.items.length).toBeGreaterThan(0);
    expect(dbBody.items.every((entry) => entry.domain === 'DATABASES')).toBeTruthy();

    const search = await page.request.get(`${apiBaseUrl}/mcp/catalog?search=postgres`, { headers: auth });
    expect(search.ok()).toBeTruthy();

    const searchBody = (await search.json()) as { items: Array<{ slug: string }> };
    expect(searchBody.items.some((entry) => entry.slug === 'postgres')).toBeTruthy();
  });

  test('rejects install without required config', async ({ page }) => {
    const { token } = await registerAndAuthenticate(page);
    const auth = { Authorization: `Bearer ${token}` };

    const bad = await page.request.post(`${apiBaseUrl}/mcp/installs`, {
      headers: auth,
      data: { catalogEntrySlug: 'github', alias: 'gh-bad', config: {} },
    });
    expect(bad.status()).toBe(400);

    const body = (await bad.json()) as { code: string };
    expect(body.code).toBe('MCP_CONFIG_INVALID');
  });

  test('install / list / patch / delete lifecycle', async ({ page }) => {
    const { token } = await registerAndAuthenticate(page);
    const auth = { Authorization: `Bearer ${token}` };

    const install = await page.request.post(`${apiBaseUrl}/mcp/installs`, {
      headers: auth,
      data: {
        catalogEntrySlug: 'filesystem',
        alias: 'fs-e2e',
        config: { rootDir: '/tmp/e2e' },
      },
    });
    expect(install.status()).toBe(201);

    const installBody = (await install.json()) as { install: { id: string; alias: string; enabled: boolean } };
    expect(installBody.install.alias).toBe('fs-e2e');
    expect(installBody.install.enabled).toBe(true);

    const list = await page.request.get(`${apiBaseUrl}/mcp/installs`, { headers: auth });
    expect(list.ok()).toBeTruthy();

    const listBody = (await list.json()) as { installs: Array<{ id: string }> };
    expect(listBody.installs).toHaveLength(1);

    const patch = await page.request.patch(`${apiBaseUrl}/mcp/installs/${installBody.install.id}`, {
      headers: auth,
      data: { enabled: false },
    });
    expect(patch.ok()).toBeTruthy();

    const patchBody = (await patch.json()) as { install: { enabled: boolean } };
    expect(patchBody.install.enabled).toBe(false);

    const remove = await page.request.delete(`${apiBaseUrl}/mcp/installs/${installBody.install.id}`, {
      headers: auth,
    });
    expect(remove.ok()).toBeTruthy();

    const notFound = await page.request.delete(`${apiBaseUrl}/mcp/installs/${installBody.install.id}`, {
      headers: auth,
    });
    expect(notFound.status()).toBe(404);
  });
});

test.describe('MCP marketplace UI', () => {
  test('renders catalog cards in the MCP settings tab', async ({ page }) => {
    await registerAndAuthenticate(page);

    // /settings opens the control panel grid; we click the MCP Servers tile
    // to navigate into the MCP tab content.
    await page.goto(`${appBaseUrl}/settings`, { waitUntil: 'domcontentloaded' });

    // Wait for the panel grid to hydrate, then click the MCP Servers tile.
    const mcpTile = page.locator('text=MCP Servers').first();
    await mcpTile.waitFor({ state: 'visible', timeout: 30_000 });
    await mcpTile.click();

    // The Marketplace sub-tab is the default view inside McpTab.
    const marketplaceTab = page.getByRole('tab', { name: /marketplace/i });
    await marketplaceTab.waitFor({ state: 'visible', timeout: 30_000 });
    await expect(marketplaceTab).toHaveAttribute('aria-selected', 'true');

    // Wait for the marketplace section heading rendered by McpMarketplace.
    const marketplaceHeading = page.locator('#catalog-heading');
    await expect(marketplaceHeading).toBeVisible({ timeout: 30_000 });

    // At least the seeded "Filesystem" entry should appear in the catalog.
    const filesystemCard = page.getByRole('article').filter({ hasText: 'Filesystem' }).first();
    await expect(filesystemCard).toBeVisible({ timeout: 30_000 });

    // Switch to Configuration sub-tab and verify the JSON editor renders.
    const configTab = page.getByRole('tab', { name: /configuration/i });
    await configTab.click();
    await expect(page.getByRole('heading', { name: 'MCP Servers Configured', level: 2 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Configuration JSON/i)).toBeVisible({ timeout: 5_000 });
  });
});
