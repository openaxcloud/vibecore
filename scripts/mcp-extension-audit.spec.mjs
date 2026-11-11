import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  MCP_AUDIT_SLUG,
  MCP_AUDIT_NAME,
  MCP_AUDIT_SEARCH_LABEL,
  MCP_MARKETPLACE_SELECTOR,
  MCP_INSTALLED_SELECTOR,
  matchesMcpPanelAction,
  readMcpAuditData,
  requireMcpInstall,
  requireMcpRemoved,
} from './mcp-extension-audit.mjs';

// The override permits source-contract checks on a verified read-only snapshot.
// In a complete checkout no override is needed; these are the repository files.
const root = process.env.MCP_AUDIT_CONTRACT_SOURCE_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const seeds = JSON.parse(source('packages/database/prisma/seed-mcp-catalog.json'));
const entry = seeds.find((item) => item.slug === MCP_AUDIT_SLUG);
const envelope = (installs = []) => ({ status: 'ok', data: { mcpCatalog: [entry], mcpInstalls: installs } });
const install = {
  id: 'contract-install',
  alias: MCP_AUDIT_SLUG,
  enabled: true,
  catalogEntry: { slug: MCP_AUDIT_SLUG },
};

test('action response matches only POST on the same origin and exact resource route, allowing query strings', () => {
  const url = 'https://app.test/api/projects/project-one/ide-panel/extensions';

  assert.equal(matchesMcpPanelAction(url, 'POST', url), true);
  assert.equal(matchesMcpPanelAction(`${url}?workspaceId=workspace-one`, 'POST', url), true);

  for (const candidate of [
    url.replace('app.test', 'other.test'),
    url.replace('https:', 'http:'),
    url.replace('app.test', 'app.test:8443'),
    url.replace('app.test', 'user:password@app.test'),
    url.replace('project-one', 'project-two'),
    url.replace('extensions', 'packages'),
    `${url}.data`,
    `${url}/extra`,
    `${url}-other`,
    `https://other.test/?redirect=${url}`,
    '/api/projects/project-one/ide-panel/extensions',
    'not a URL',
  ]) {
    assert.equal(matchesMcpPanelAction(candidate, 'POST', url), false, candidate);
  }

  assert.equal(matchesMcpPanelAction(url, 'GET', url), false);
  assert.equal(matchesMcpPanelAction(url, 'DELETE', url), false);
});

test('actual submit uses the JSON resource route through unmodified fetch, not a .data action', () => {
  const component = source('app/components/chat/BaseChat.tsx');

  assert.match(
    component,
    /fetchPanel\(`\/api\/projects\/\$\{projectId\}\/ide-panel\/\$\{panel\}`, \{\s*method: 'POST'/,
  );
  const start = component.indexOf('  const fetchPanel = useCallback(');
  const fetchPanel = component.slice(start, component.indexOf('  const loadPanel =', start));

  assert.match(fetchPanel, /await fetch\(input, init\)/);
});

test('audit selects an actual empty-config MCP seed, installed by the standard seed command', () => {
  assert.equal(entry.name, MCP_AUDIT_NAME);
  assert.deepEqual(entry.configSchema, { type: 'object', properties: {} });
  assert.match(source('packages/database/prisma/seed.ts'), /await seedMcpCatalog\(prisma\)/);
  assert.equal(readMcpAuditData(envelope()).mcpCatalog[0], entry);
});

test('missing, legacy, disabled, malformed, and config-requiring catalogs fail closed', () => {
  for (const invalid of [
    { status: 'error', data: envelope().data },
    { status: 'ok', data: { mcpCatalog: [], mcpInstalls: [] } },
    { status: 'ok', data: { mcpCatalog: [entry] } },
    ...[
      { ...entry, slug: 'prettier' },
      { ...entry, enabled: false },
      { ...entry, configSchema: { type: 'object', required: ['token'], properties: { token: {} } } },
    ].map((item) => ({ status: 'ok', data: { mcpCatalog: [item], mcpInstalls: [] } })),
  ]) {
    assert.throws(() => readMcpAuditData(invalid));
  }
});

test('persistence requires the exact MCP record, alias, id, and boolean enabled state', () => {
  assert.equal(requireMcpInstall(envelope([install]).data, { alias: MCP_AUDIT_SLUG, enabled: true }), install);
  for (const items of [
    [],
    [install, install],
    [{ ...install, enabled: false }],
    [{ ...install, id: '' }],
    [{ ...install, alias: 'other' }],
    [{ ...install, catalogEntry: { slug: 'prettier' } }],
  ]) {
    assert.throws(() => requireMcpInstall(envelope(items).data, { alias: MCP_AUDIT_SLUG, enabled: true }));
  }
  assert.throws(() =>
    requireMcpInstall(envelope([install]).data, { alias: MCP_AUDIT_SLUG, id: 'other', enabled: true }),
  );
});

test('removal requires absence by both installation id and alias', () => {
  requireMcpRemoved(envelope().data, install.id, install.alias);
  for (const item of [install, { ...install, id: 'different' }, { ...install, alias: 'different' }]) {
    assert.throws(() => requireMcpRemoved(envelope([item]).data, install.id, install.alias));
  }
});

test('UI selectors and submitted fields match the actual current Extensions component and English catalog', () => {
  const all = source('app/components/chat/BaseChat.tsx');
  const start = all.indexOf('function ProjectExtensionsPanel(');
  const component = all.slice(start, all.indexOf('function ', start + 9));
  const copy = source('app/lib/i18n/catalogs/chat.ts');
  assert.match(copy, new RegExp("'chat.copy.searchTheMcpMarketplace_48179a04': '" + MCP_AUDIT_SEARCH_LABEL + "'"));
  assert.match(copy, /'chat.copy.marketplaceExtensions_c006e268': 'Marketplace extensions'/);
  assert.equal(MCP_MARKETPLACE_SELECTOR, 'section[aria-label="Marketplace extensions"]');
  assert.equal(MCP_INSTALLED_SELECTOR, '.bolt-project-installed-extensions');
  assert.match(component, /<label>\s*\{t\('chat.copy.searchTheMcpMarketplace_48179a04'\)\}\s*<PanelInput/);
  assert.match(component, /<section aria-label=\{t\('chat.copy.marketplaceExtensions_c006e268'\)\}/);
  assert.match(component, /name="extension" value=\{entry.slug\}/);
  assert.match(component, /name="installId" value=\{install.id\}/);
  assert.match(component, /value=\{install.enabled \? 'disable' : 'enable'\}/);
  assert.match(component, /name="extensionAction" value="remove"/);
});

test('backend installation persists a record without invoking an MCP server', () => {
  const backend = source('services/api/src/mcp-marketplace.ts');
  const method = backend.slice(backend.indexOf('  async install(input:'), backend.indexOf('  async listInstalls('));
  assert.match(method, /validateConfigAgainstSchema\(input.config, entry.configSchema\)/);
  assert.match(method, /tx.mcpInstall.create\(/);
  assert.doesNotMatch(method, /\b(?:fetch|spawn|exec|connect|callTool)\s*\(/);
  const route = source('app/routes/api.projects.$projectId.ide-panel.$panel.ts');
  assert.match(route, /JSON.stringify\(\{ catalogEntrySlug: slug, alias, config: \{\} \}\)/);
});

test('audit wires real MCP lifecycle helpers and retains separate Storage and HTTP diagnostics', () => {
  const audit = fs.readFileSync(new URL('./audit-ide-panels.mjs', import.meta.url), 'utf8');
  const helper = fs.readFileSync(new URL('./mcp-extension-audit.mjs', import.meta.url), 'utf8');
  assert.match(audit, /await auditMcpBackendInstallation\(/);
  assert.match(audit, /await auditMcpUiLifecycle\(/);
  assert.doesNotMatch(audit, /Material Icon Theme|Theme, language, linter|extension: 'prettier'/);
  assert.match(audit, /'save_object_storage_config_visible_after_backend_reload'/);
  assert.match(audit, /browserHttpDiagnostics.capture\(response, panel\)/);
  assert.match(helper, /for \(const enabled of \[false, true\]\)/);
  assert.match(helper, /page.reload\(/);
  assert.match(helper, /page.request.get\(panelUrl\)/);
  assert.doesNotMatch(helper, /\.route\(|\.fulfill\(|\/mcp\/.*(?:invoke|connect|tools)/);
});
