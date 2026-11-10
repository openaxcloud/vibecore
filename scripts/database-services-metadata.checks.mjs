import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
test('services scenario separately preserves secure configuration, server metadata, and backend mutation activity', () => {
  const source = read('tests/e2e/dashboard.spec.ts');

  const flow = source.slice(
    source.indexOf('Before 11e1bfe9d'),
    source.indexOf('    await openIdeTool(/Git/);', source.indexOf('Before 11e1bfe9d')),
  );

  for (const evidence of [
    "panelResponse('secrets', 'POST')",
    "reloadPanelJson(page, projectId, 'secrets')",
    "panelResponse('database', 'GET')",
    "panelResponse('activity', 'GET')",
    "'datetime', secretMetadata.updatedAt",
    "name: 'Reveal the value of DATABASE_URL'",
    'displayedEvent.id).toBe(connectionEvent.id)',
    'displayedEvent.createdAt).toBe(connectionEvent.createdAt)',
    "displayedEvent.metadata.key).toBe('DATABASE_URL')",
  ]) {
    assert.ok(flow.includes(evidence), evidence);
  }
  assert.ok(!flow.includes('schemaKey'));
  assert.ok(!flow.includes('QueryHistory'));
  assert.ok(!flow.includes("getByTestId('db-carte').click"));
  assert.ok(!flow.includes("name: 'Create database'"));
  assert.ok(!flow.includes("panelResponse('env'"));

  const api = read('services/api/src/app.ts');
  assert.ok(api.includes("action: 'project.secret.upsert'"));
  assert.ok(api.includes('valueEncrypted: encryptJson({ value: body.value })'));
  assert.ok(api.includes('const activity = await store.listProjectActivity(project.id, query)'));

  const ui = read('app/components/chat/ProjectSecretsPanel.tsx');
  assert.ok(ui.includes('formatBaseChatAstDateTime(language, secret.updatedAt)'));
  assert.ok(ui.includes("{revele ?? '••••••••'}"));
  assert.ok(ui.includes('className="col-span-3 min-w-0 break-words'));

  const css = read('app/styles/index.scss');
  const rowStyle = css.slice(css.indexOf('.bolt-secrets-row {'), css.indexOf('.bolt-secrets-chip {'));
  assert.ok(rowStyle.includes('display: grid'));
  assert.ok(rowStyle.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px'));
});

test('the entire services scenario retains the later connection edit without obsolete Database controls', () => {
  const source = read('tests/e2e/dashboard.spec.ts');
  const end = source.indexOf("test('IDE light theme tabs");
  const scenario = source.slice(source.lastIndexOf('test(', source.indexOf('Before 11e1bfe9d')), end);

  const update = scenario.slice(
    scenario.indexOf('// Preserve the later connection update'),
    scenario.indexOf('const exportResponse'),
  );

  for (const evidence of [
    "const updatedDatabaseValue = 'postgres://local/test'",
    "getByTestId('secret-menu-DATABASE_URL').click()",
    "name: 'Edit', exact: true",
    "toHaveValue('DATABASE_URL')",
    "panelResponse('secrets', 'POST')",
    "reloadPanelJson(page, projectId, 'secrets')",
    'updatedSecrets.body.data.secrets',
    'getByText(updatedDatabaseValue, { exact: true })',
    "panelResponse('database', 'GET')",
    "getByTestId('db-carte').getByText('DATABASE_URL', { exact: true })",
    'timeout: 15000',
  ]) {
    assert.ok(update.includes(evidence), evidence);
  }

  for (const obsolete of ['Save DATABASE_URL', 'postgres://user:pass@host:5432/db', 'bolt-project-database-tool']) {
    for (const file of ['dashboard', 'critical-paths', 'preview-runtime', 'mobile-device-matrix', 'responsive-ide']) {
      assert.ok(!read(`tests/e2e/${file}.spec.ts`).includes(obsolete), `${file}: ${obsolete}`);
    }
  }
  assert.ok(!scenario.includes('schemaKey'));
  assert.ok(!scenario.includes("getByTestId('db-carte').click"));
  assert.ok(!scenario.includes("getByRole('button', { name: 'Create database', exact: true }).click"));
  assert.ok(scenario.includes('expect(exportResponse.ok()'));
});

test('services Domains checks canonical owner, active Domains view and unchanged domains backend', () => {
  const source = read('tests/e2e/dashboard.spec.ts');
  const start = source.indexOf('for (const [label, panel] of inIdePanels)');
  const loop = source.slice(start, source.indexOf('await openIdeTool(/Settings/);', start));
  assert.ok(loop.includes("panel === 'domains' ? resolveProjectEditorToolOpen(panel).panel : panel"));
  assert.ok(loop.includes('panel=${renderedPanel}$'));
  assert.ok(loop.includes('data-panel="${renderedPanel}"'));
  assert.ok(loop.includes('/ide-panel/domains`'));
  assert.ok(loop.includes("response.request().method() === 'GET'"));
  assert.ok(loop.includes('expect((await domainsResponse).ok()).toBeTruthy()'));
  assert.ok(loop.includes("toHaveAttribute('aria-current', 'page')"));
  assert.ok(loop.includes('.bolt-project-domains-panel input[name="domain"]'));
  assert.ok(loop.includes('project-domains-scope-notice'));
  assert.ok(loop.includes('timeout: 15000'));

  const catalog = read('app/components/chat/project-editor-tool-catalog.ts');
  assert.ok(catalog.includes("domains: { tool: 'deployments', view: 'domains' }"));
});
