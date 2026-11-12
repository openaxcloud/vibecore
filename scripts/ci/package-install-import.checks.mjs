import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyInstalledAuditPackage } from './package-install-import.mjs';

const panel = {
  data: {
    project: { id: 'project' },
    workspace: { id: 'actual-workspace' },
    packagesState: {
      runs: [{ intent: 'install-package', status: 'succeeded', exitCode: 0, packages: ['is-odd'] }],
    },
  },
};

const input = { apiBaseUrl: 'https://api.fixture.invalid', token: 'fixture-token', projectId: 'project', panel };
const confirmed = { exitCode: 0, localRuntime: false, output: 'VIBECORE_PACKAGE_IMPORT_OK' };

test('import check targets the reloaded real workspace once with structured argv and ordinary command budget', async () => {
  const calls = [];
  assert.deepEqual(
    await verifyInstalledAuditPackage({
      ...input,
      fetchImpl: async (...args) => {
        calls.push(args);
        return Response.json(confirmed);
      },
    }),
    { importVerified: true },
  );
  assert.equal(calls.length, 1);

  const [url, init] = calls[0];
  assert.equal(url, 'https://api.fixture.invalid/api/runtime/workspaces/actual-workspace/commands');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, 'Bearer fixture-token');
  assert.ok(init.signal instanceof AbortSignal);

  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['args', 'command', 'timeoutMs']);
  assert.equal(body.command, 'node');
  assert.equal(body.timeoutMs, 10000);
  assert.equal(body.args[0], '-e');
  assert.doesNotMatch(body.args[1], /install|npm|pnpm|yarn|bun/);
});

test('missing workspace, different project, failed or unconfirmed persisted run never dispatches', async () => {
  for (const mutate of [
    (p) => delete p.data.workspace,
    (p) => {
      p.data.workspace.id = '../wrong';
    },
    (p) => {
      p.data.project.id = 'other-project';
    },
    (p) => {
      p.data.packagesState.runs[0].exitCode = null;
    },
    (p) => {
      p.data.packagesState.runs[0].status = 'failed';
    },
    (p) => {
      p.data.packagesState.runs[0].termination = 'interrupted';
    },
    (p) => {
      p.data.packagesState.runs[0].packages = ['other'];
    },
    (p) => {
      p.data.packagesState.runs = [];
    },
  ]) {
    const changed = structuredClone(panel);
    mutate(changed);
    await assert.rejects(
      verifyInstalledAuditPackage({ ...input, panel: changed, fetchImpl: () => assert.fail('must not dispatch') }),
    );
  }
});

test('local fallback, missing metadata, fake success, null/nonzero exit and malformed body fail closed', async () => {
  for (const result of [
    { ...confirmed, localRuntime: true },
    { ...confirmed, localRuntime: undefined },
    { ...confirmed, exitCode: null },
    { ...confirmed, exitCode: 1 },
    { ...confirmed, output: 'ran node' },
    { ...confirmed, output: 'PRIVATE OUTPUT' },
    null,
    {},
  ]) {
    await assert.rejects(
      verifyInstalledAuditPackage({ ...input, fetchImpl: async () => Response.json(result) }),
      (error) => !/PRIVATE|fixture-token|actual-workspace/.test(error.message),
    );
  }
});

test('lost response or rejected command is never replayed and never logs arbitrary data', async () => {
  for (const response of [
    undefined,
    new Response('PRIVATE', { status: 503 }),
    new Response('PRIVATE', { status: 200 }),
  ]) {
    let calls = 0;
    await assert.rejects(
      verifyInstalledAuditPackage({
        ...input,
        fetchImpl: async () => {
          calls++;

          if (!response) {
            throw new Error('PRIVATE fixture-token');
          }

          return response;
        },
      }),
      (error) => !/PRIVATE|fixture-token/.test(error.message),
    );
    assert.equal(calls, 1);
  }
});

test('the exact Node probe executes successfully only for an importable, working package', async () => {
  let command;
  await verifyInstalledAuditPackage({
    ...input,
    fetchImpl: async (_url, init) => {
      command = JSON.parse(init.body);
      return Response.json(confirmed);
    },
  });

  const cwd = mkdtempSync(join(tmpdir(), 'vibecore-import-probe-'));
  assert.notEqual(spawnSync(command.command, command.args, { cwd, encoding: 'utf8' }).status, 0);
  mkdirSync(join(cwd, 'node_modules', 'is-odd'), { recursive: true });
  writeFileSync(join(cwd, 'node_modules', 'is-odd', 'index.js'), 'module.exports = () => false;');
  assert.equal(spawnSync(command.command, command.args, { cwd, encoding: 'utf8' }).status, 23);
  writeFileSync(join(cwd, 'node_modules', 'is-odd', 'index.js'), 'module.exports = n => n % 2 !== 0;');

  const result = spawnSync(command.command, command.args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, confirmed.output);
});

test('live audit awaits import after the persisted package row and never adds another install', () => {
  const source = readFileSync('scripts/audit-ide-panels.mjs', 'utf8');
  const start = source.indexOf("const packageName = 'is-odd'");
  const end = source.indexOf("'create_package_install_plan_visible_after_backend_reload'", start);
  const flow = source.slice(start, end);
  assert.match(flow, /waitForPanelResponse\(page, 'packages', 'POST', 360_000\)/);
  assert.equal((flow.match(/name: 'Install package'/g) ?? []).length, 1);
  assert.match(flow, /await verifyInstalledAuditPackage/);
  assert.ok(flow.indexOf('await verifyInstalledAuditPackage') > flow.indexOf(".locator('.bolt-project-package-list')"));
});
