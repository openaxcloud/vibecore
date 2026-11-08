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

test('preview selects the device-controlled outer frame unambiguously, rejects wrong device', () => {
  const selector = '.bolt-project-webview-tool > .bolt-project-webview-frame[data-preview-device="mobile"]';
  assert.ok(audit.includes(selector));
  assert.ok(
    baseChat.includes(
      '<div className="bolt-project-webview-tool">\n              <div className="bolt-project-webview-frame" data-preview-device={previewDevice}>',
    ),
  );

  const document = new JSDOM(
    '<div class="bolt-project-webview-tool"><div class="bolt-project-webview-frame" data-preview-device="mobile"><div class="bolt-project-webview-frame" data-preview-device="mobile"></div></div></div>',
  ).window.document;
  assert.equal(document.querySelectorAll(selector).length, 1);
  document.querySelector(selector).setAttribute('data-preview-device', 'desktop');
  assert.equal(document.querySelectorAll(selector).length, 0);
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
