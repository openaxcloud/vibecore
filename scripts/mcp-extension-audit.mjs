// This audit persists MCP installation records only. It never connects to or
// invokes an MCP server. Memory is a real seed accepting the IDE's empty config.
export const MCP_AUDIT_SLUG = 'memory';
export const MCP_AUDIT_NAME = 'Memory (Knowledge Graph)';
export const MCP_AUDIT_SEARCH_LABEL = 'Search the MCP marketplace';
export const MCP_MARKETPLACE_SELECTOR = 'section[aria-label="Marketplace extensions"]';
export const MCP_INSTALLED_SELECTOR = '.bolt-project-installed-extensions';

// BaseChat.submit uses fetchPanel -> fetch on the JSON resource route, not a
// React Router .data action. Queries may vary, but origin and path must match.
export function matchesMcpPanelAction(responseUrl, method, panelUrl) {
  if (method !== 'POST') {
    return false;
  }

  try {
    const actual = new URL(responseUrl);
    const expected = new URL(panelUrl);

    return (
      actual.origin === expected.origin &&
      actual.pathname === expected.pathname &&
      !actual.username &&
      !actual.password
    );
  } catch {
    return false;
  }
}

export function readMcpAuditData(envelope) {
  const data = envelope?.data;

  if (envelope?.status !== 'ok' || !Array.isArray(data?.mcpCatalog) || !Array.isArray(data?.mcpInstalls)) {
    throw new Error('Extensions audit requires a successful MCP catalog/install envelope');
  }
  const entry = data.mcpCatalog.find((item) => item.slug === MCP_AUDIT_SLUG);
  if (!entry || entry.name !== MCP_AUDIT_NAME || entry.enabled === false) {
    throw new Error('The enabled, seeded Memory MCP catalog entry is missing or changed');
  }
  // Fail closed if this seed ever begins requiring input the IDE cannot supply.
  if (
    entry.configSchema?.type !== 'object' ||
    Object.keys(entry.configSchema.properties ?? {}).length ||
    (entry.configSchema.required?.length ?? 0) > 0
  ) {
    throw new Error('Memory MCP no longer has the verified empty-config contract');
  }
  return data;
}

export function requireMcpInstall(data, { alias, id, enabled }) {
  const matches = data.mcpInstalls.filter((item) => item.alias === alias);
  const install = matches[0];
  if (
    matches.length !== 1 ||
    !install?.id ||
    install.catalogEntry?.slug !== MCP_AUDIT_SLUG ||
    (id !== undefined && install.id !== id) ||
    install.enabled !== enabled
  ) {
    throw new Error(`MCP installation did not persist with the expected identity and enabled=${enabled}`);
  }
  return install;
}

export function requireMcpRemoved(data, id, alias) {
  if (data.mcpInstalls.some((item) => item.id === id || item.alias === alias)) {
    throw new Error('Removed MCP installation is still present in the backend');
  }
}

// Exercise the project-scoped action, then independently reload persisted data.
// Remove this API-only installation so the UI must perform its own install.
export async function auditMcpBackendInstallation(http, panelUrl, headers) {
  const read = async () => {
    const result = await http(panelUrl, { headers });
    if (!result.response.ok) {
      throw new Error(`MCP backend reload failed (${result.response.status})`);
    }
    return readMcpAuditData(result.body);
  };
  await read();
  const alias = 'ide-panel-audit-memory-api';
  const result = await http(panelUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ extensionAction: 'install', extension: MCP_AUDIT_SLUG, alias }),
  });
  if (!result.response.ok || result.body?.ok !== true) {
    throw new Error(`MCP API installation failed (${result.response.status})`);
  }
  const install = requireMcpInstall(await read(), { alias, enabled: true });
  const removed = await http(panelUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ extensionAction: 'remove', installId: install.id }),
  });
  if (!removed.response.ok || removed.body?.ok !== true) {
    throw new Error(`MCP API cleanup failed (${removed.response.status})`);
  }
  requireMcpRemoved(await read(), install.id, alias);
  return result;
}

export async function auditMcpUiLifecycle(page, panelUrl) {
  const read = async () => {
    const response = await page.request.get(panelUrl);
    if (!response.ok()) {
      throw new Error(`MCP backend reload failed (${response.status()})`);
    }
    return readMcpAuditData(await response.json());
  };
  const mutate = async (button) => {
    const [response] = await Promise.all([
      page.waitForResponse((res) => matchesMcpPanelAction(res.url(), res.request().method(), panelUrl)),
      button.click(),
    ]);
    if (!response.ok() || (await response.json()).ok !== true) {
      throw new Error(`MCP UI action failed (${response.status()})`);
    }
  };
  const installedCard = () =>
    page.locator(MCP_INSTALLED_SELECTOR).locator('.bolt-project-extension-card', { hasText: MCP_AUDIT_NAME });
  const assertRenderedState = async (enabled) => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await installedCard()
      .locator(`input[name="installId"][value="${install.id}"]`)
      .waitFor({ state: 'attached' });
    await installedCard()
      .filter({
        has: page.locator(`input[name="extensionAction"][value="${enabled ? 'disable' : 'enable'}"]`),
      })
      .waitFor({ state: 'visible' });
  };

  const before = await read();
  if (before.mcpInstalls.some((item) => item.catalogEntry?.slug === MCP_AUDIT_SLUG)) {
    throw new Error('MCP UI audit must start without a Memory installation');
  }
  await page.getByLabel(MCP_AUDIT_SEARCH_LABEL, { exact: true }).fill(MCP_AUDIT_NAME);
  const card = page
    .locator(MCP_MARKETPLACE_SELECTOR)
    .locator('.bolt-project-extension-card', { hasText: MCP_AUDIT_NAME });
  await card.locator(`input[name="extension"][value="${MCP_AUDIT_SLUG}"]`).waitFor({ state: 'attached' });
  await mutate(card.getByRole('button', { name: 'Install', exact: true }));
  const install = requireMcpInstall(await read(), { alias: MCP_AUDIT_SLUG, enabled: true });
  await assertRenderedState(true);
  requireMcpInstall(await read(), { alias: MCP_AUDIT_SLUG, id: install.id, enabled: true });

  for (const enabled of [false, true]) {
    await mutate(installedCard().getByRole('button', { name: enabled ? 'Enable' : 'Disable', exact: true }));
    requireMcpInstall(await read(), { alias: MCP_AUDIT_SLUG, id: install.id, enabled });
    await assertRenderedState(enabled);
    requireMcpInstall(await read(), { alias: MCP_AUDIT_SLUG, id: install.id, enabled });
  }
  await mutate(installedCard().getByRole('button', { name: 'Remove', exact: true }));
  requireMcpRemoved(await read(), install.id, MCP_AUDIT_SLUG);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(MCP_INSTALLED_SELECTOR).waitFor({ state: 'visible' });
  if (await installedCard().count()) {
    throw new Error('Removed MCP installation is still rendered after reload');
  }
  requireMcpRemoved(await read(), install.id, MCP_AUDIT_SLUG);
}
