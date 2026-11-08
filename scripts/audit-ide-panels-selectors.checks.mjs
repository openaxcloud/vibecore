import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const audit = read('scripts/audit-ide-panels.mjs');
const baseChat = read('app/components/chat/BaseChat.tsx');

test('Domains requires its real subview, not merely the canonical Deploy host; backend stays domains', () => {
  const selector = '[data-testid="ide-service-panel"][data-panel="deployments"] .bolt-project-domains-panel';
  assert.equal(audit.split(selector).length - 1, 2);

  const document = new JSDOM('<div data-testid="ide-service-panel" data-panel="deployments"></div>').window.document;
  assert.equal(document.querySelector(selector), null);
  document.querySelector('div').innerHTML = '<div class="bolt-project-domains-panel"></div>';
  assert.ok(document.querySelector(selector));
  assert.ok(baseChat.includes('return <ProjectIdeServicePanel projectId={projectId} panel="deployments" />'));
  assert.ok(audit.includes("waitForPanelResponse(page, 'domains', 'POST')"));
  assert.ok(audit.includes("waitForPanelResponse(page, 'domains', 'GET')"));
});

test('preview targets the canonical device frame despite nested duplicate wrapper classes', () => {
  const selector = '[data-testid="preview-device-frame"][data-preview-device="mobile"]';
  assert.ok(audit.includes(selector));

  const preview = read('app/components/workbench/Preview.tsx');
  assert.equal(preview.split('data-testid="preview-device-frame"').length - 1, 1);
  assert.match(
    preview,
    /data-testid="preview-device-frame"\s+data-preview-device=\{previewDevice\}[\s\S]*?width: previewViewportWidth/,
  );

  const document = new JSDOM(
    '<div class="bolt-project-webview-tool"><div class="bolt-project-webview-frame" data-preview-device="mobile"><div class="bolt-project-webview-tool"><div class="bolt-project-webview-frame" data-testid="preview-device-frame" data-preview-device="mobile"></div></div></div></div>',
  ).window.document;
  assert.equal(
    document.querySelectorAll('.bolt-project-webview-tool > .bolt-project-webview-frame[data-preview-device="mobile"]')
      .length,
    2,
  );
  assert.equal(document.querySelectorAll(selector).length, 1);
  document.querySelector(selector).setAttribute('data-preview-device', 'desktop');
  assert.equal(document.querySelectorAll(selector).length, 0);

  const assertion = audit.slice(
    audit.indexOf(`.locator('${selector}')`),
    audit.indexOf("await page.getByTitle('Webview logs')"),
  );
  assert.ok(assertion.includes('.waitFor('));
  assert.ok(!assertion.includes('.first()'));
  assert.ok(assertion.includes("page.getByTestId('preview-device-frame').count()) !== 1"));
});

test('Secrets uses current form controls, explicit reveal action and unchanged security guard', () => {
  const secrets = read('app/components/chat/ProjectSecretsPanel.tsx');

  for (const id of ['secrets-new', 'secrets-form-key', 'secrets-form-value', 'secrets-form-add']) {
    assert.ok(secrets.includes(`data-testid="${id}"`));
    assert.ok(audit.includes(`getByTestId('${id}')`));
  }
  assert.ok(audit.includes('name: `Reveal the value of ${key}`, exact: true'));
  assert.ok(read('app/lib/i18n/catalogs/secrets-panel.ts').includes('Reveal the value of {{key}}'));
  assert.ok(audit.includes('secrets_reveal_without_confirm'));
  assert.ok(audit.includes("page.getByText(value).waitFor({ state: 'visible', timeout: 10_000 })"));
});

test('webhook toggle is exact-case and submission is scoped to the actual form', () => {
  assert.ok(audit.includes("getByRole('button', { name: 'Create Webhook', exact: true })"));
  assert.match(
    audit,
    /getByTestId\('card-webhooks-list'\)\s*\.locator\('form'\)\s*\.getByRole\('button', \{ name: 'Create Webhook', exact: true \}\)/,
  );
  assert.ok(baseChat.includes('data-testid="card-webhooks-list"'));
  assert.ok(baseChat.includes('<input type="hidden" name="intent" value="create-webhook" />'));
});

test('terminal and lock controls match the accessible source contracts', () => {
  assert.ok(audit.includes('name: /^Open shell sessions\\. Active session /'));
  assert.ok(read('app/lib/i18n/catalogs/terminal-tabs.ts').includes('Open shell sessions. Active session {session}.'));
  assert.ok(audit.includes("name: 'Search locked items', exact: true"));
  assert.ok(
    read('app/lib/i18n/catalogs/lock-manager.ts').includes("'lockManager.search.ariaLabel': 'Search locked items'"),
  );
  assert.ok(audit.includes("selectOption('files')"));
  assert.ok(audit.includes("getByText('No locked items found')"));
});

test('file creation submits the real InputDialog and retains file/editor/refresh/collapse checks', () => {
  const fileCase = audit.slice(
    audit.indexOf('const fileName = `panel-audit-'),
    audit.indexOf("'create_refresh_and_collapse_file_tree'"),
  );
  assert.ok(!fileCase.includes("page.once('dialog'"));
  assert.ok(fileCase.includes("getByRole('dialog', { name: 'New file', exact: true })"));
  assert.ok(fileCase.includes("getByLabel('File path', { exact: true }).fill(fileName)"));
  assert.ok(fileCase.includes("getByRole('button', { name: 'Create', exact: true }).click()"));
  assert.ok(fileCase.includes("getByLabel('Refresh files').click()"));
  assert.ok(fileCase.includes("getByLabel('Collapse all files').click()"));
  assert.ok(fileCase.includes('responsive-code-editor'));
  assert.ok(fileCase.includes("getByText(fileName).first().waitFor({ state: 'visible', timeout: 15_000 })"));
  assert.ok(baseChat.includes('isOpen={createEntryKind !== null}'));
  assert.ok(baseChat.includes('void createEntry(kind, value)'));
  assert.ok(baseChat.includes("await workbenchStore.createFile(target, '')"));
  assert.ok(read('app/components/ui/InputDialog.tsx').includes('onSubmit(value)'));
});

test('database migration preserves connection key/value and uses only the explicit encrypted-secret intent', () => {
  assert.ok(
    audit.includes(
      "['database', form({ intent: 'upsert-secret', key: 'DATABASE_URL', value: 'postgres://audit.local/db' })]",
    ),
  );

  const route = read('app/routes/api.projects.$projectId.ide-panel.$panel.ts');

  const database = route.slice(
    route.indexOf("} else if (panel === 'database')"),
    route.indexOf("} else if (panel === 'ports')"),
  );
  assert.match(
    database,
    /intent === 'upsert-secret'[\s\S]*?`\/projects\/\$\{projectId\}\/secrets`[\s\S]*?method: 'PUT'[\s\S]*?key: body.key, value: body.value/,
  );
  assert.ok(database.includes("code: 'DATABASE_INTENT_UNSUPPORTED'"));
  assert.ok(database.includes('{ status: 400 }'));
});

test('workflows keep create, run and persisted new shell task with the current controls', () => {
  const workflowCase = audit.slice(
    audit.indexOf('const workflowName = `Workflow Audit'),
    audit.indexOf("'create_run_workflow_and_add_task_visible_after_backend_reload'"),
  );
  assert.equal(workflowCase.match(/waitForPanelResponse\(page, 'workflows', 'POST'\)/g).length, 3);
  assert.ok(workflowCase.includes("name: 'Run now', exact: true"));
  assert.ok(workflowCase.includes('[data-testid^="add-task-"]'));
  assert.ok(workflowCase.includes('.nth(taskCountBefore)'));
  assert.ok(workflowCase.includes("inputValue()) !== 'shell'"));
  assert.ok(baseChat.includes('data-testid={`add-task-${workflow.id}`}'));
  assert.ok(baseChat.includes('<input type="hidden" name="taskType" value="shell" />'));
  assert.ok(read('app/lib/i18n/catalogs/chat.ts').includes("'chat.copy.runNow_2af00e23': 'Run now'"));
});

test('workflow persistence requires a GET payload containing the actual added shell task', () => {
  const start = audit.indexOf('const reloadedWorkflow = page.waitForResponse(');
  const click = audit.indexOf('workflowCard.locator(\'[data-testid^="add-task-"]\').click()', start);
  assert.ok(start >= 0 && click > start);
  assert.ok(audit.includes("response.request().method() !== 'GET'"));
  assert.ok(audit.includes('workflow?.tasks?.length === taskCountBefore + 1'));
  assert.ok(audit.includes("String(task.id) === addedTaskId && task.taskType === 'shell'"));
  assert.ok(audit.includes('const reloadPayload = await reloadResponse.json()'));
});

test('terminal environment saves the same variable through its actual embedded env panel', () => {
  const action = audit.slice(
    audit.indexOf("await page.getByTestId('tab-environment').click()"),
    audit.indexOf("'reset_terminal_run_script_and_save_env'"),
  );
  assert.ok(action.includes("page.getByTestId('card-env-vars')"));
  assert.ok(action.includes("name: 'New variable', exact: true"));
  assert.ok(action.includes('const key = `TERMINAL_AUDIT_${Date.now()}`'));
  assert.ok(action.includes("fill('enabled')"));
  assert.ok(action.includes("waitForWorkspacePanelResponse(page, 'env', 'POST')"));
  assert.ok(action.includes("name: 'Save variable', exact: true"));
  assert.ok(action.includes("envPanel.getByText(key, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })"));
  assert.ok(baseChat.includes("<ProjectEnvPanel data={{ envVars }} onSubmit={submitToPanel('env')} busy={busy} />"));
});

test('editor opens Files through the persistent tool control, not the transient welcome card', () => {
  const action = audit.slice(
    audit.indexOf("const saveButton = page.getByRole('button', { name: 'Save' })"),
    audit.indexOf("'editor_save_or_open_files_action'"),
  );
  assert.ok(action.includes("page.getByTestId('ide-dock-files').click()"));
  assert.ok(
    action.includes("locator('.bolt-project-files-tool').first().waitFor({ state: 'visible', timeout: 10_000 })"),
  );
  assert.ok(baseChat.includes('data-testid={`ide-dock-${item.panel}`}'));
  assert.ok(baseChat.includes('onClick={() => openIdeTool(item.panel)}'));
  assert.ok(baseChat.includes('workbenchStore.setSelectedFile(firstProjectFile)'));
});

test('Database audit edits the same encrypted connection through Secrets and returns to Database without exposing payloads', () => {
  const action = audit.slice(
    audit.indexOf('const value = `postgres://audit.local/ui-'),
    audit.indexOf("'save_database_url_visible_after_backend_reload'"),
  );
  assert.ok(action.includes('secret-menu-DATABASE_URL'));
  assert.ok(action.includes("keyInput.inputValue()) !== 'DATABASE_URL'"));
  assert.ok(action.includes("getByTestId('secrets-form-value').fill(value)"));
  assert.ok(action.includes("waitForPanelResponse(page, 'secrets', 'POST')"));
  assert.ok(action.includes("waitForPanelResponse(page, 'secrets', 'GET')"));
  assert.ok(action.includes("waitForPanelResponse(page, 'database', 'GET')"));
  assert.ok(action.includes("connection.key === 'DATABASE_URL'"));
  assert.ok(action.includes("getByTestId('secret-row-DATABASE_URL')"));
  assert.ok(action.includes("name: 'Reveal the value of DATABASE_URL', exact: true"));
  assert.ok(action.indexOf("waitForPanelResponse(page, 'secrets', 'GET')") < action.indexOf('const secretRow'));
  assert.ok(action.includes(".getByTestId('db-carte')\n        .getByText('DATABASE_URL', { exact: true })"));

  const databaseView = action.slice(action.indexOf('const databasePanel'));
  assert.ok(!databaseView.includes('.click('));
  assert.ok(!action.includes('selectOption'));
  assert.ok(!action.includes("name: 'Settings'"));
  assert.ok(!action.includes('schemaKey='));
  assert.ok(action.includes("getByText(value, { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })"));
  assert.ok(!action.includes('console.'));
  assert.ok(!action.includes('JSON.stringify'));

  const route = read('app/routes/api.projects.$projectId.ide-panel.$panel.ts');

  const secrets = route.slice(
    route.indexOf("} else if (panel === 'secrets')"),
    route.indexOf("} else if (panel === 'debugger')"),
  );
  assert.match(
    secrets,
    /`\/projects\/\$\{projectId\}\/secrets`[\s\S]*?method: 'PUT'[\s\S]*?key: body.key, value: body.value/,
  );

  const api = read('services/api/src/app.ts');

  const save = api.slice(
    api.indexOf("app.put('/projects/:projectId/secrets'"),
    api.indexOf("app.delete('/projects/:projectId/secrets'"),
  );
  assert.ok(save.includes('valueEncrypted: encryptJson({ value: body.value })'));
  assert.ok(save.includes('projectId: project.id'));

  const connections = api.slice(
    api.indexOf('async function listDatabaseConnections'),
    api.indexOf('async function listDatabaseConnections') + 3500,
  );
  assert.ok(connections.includes('store.getProjectSecret(projectId, secret.key)'));
  assert.ok(connections.includes('decryptJson<{ value: string }>(full.valueEncrypted).value'));

  const workbench = read('app/components/database/DatabaseWorkbench.tsx');
  assert.ok(workbench.includes('reveler={() => revelerUnSecret(projectId, active.key)}'));
  assert.ok(workbench.includes('const [openKey, setOpenKey] = useState<string | null>(null)'));
  assert.ok(workbench.includes('const cleDuSchema = active?.key ?? null'));
  assert.match(workbench, /if \(!cleDuSchema\) \{\s*return;\s*\}/);
  assert.ok(workbench.includes('{env.name}'));

  const names = read('app/components/database/tables-du-schema.ts');
  assert.ok(names.includes("return libelle ?? (typeof entree.key === 'string' ? entree.key : '')"));

  const secretsPanel = read('app/components/chat/ProjectSecretsPanel.tsx');
  assert.ok(secretsPanel.includes('return revelerUnSecret(projectId, key)'));
});
