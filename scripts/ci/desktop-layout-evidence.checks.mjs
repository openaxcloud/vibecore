import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const source = readFileSync(new URL('../../tests/e2e/helpers/runtime-desktop-diagnostics.ts', import.meta.url), 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;

const ioImport = "import { writeFile } from 'node:fs/promises';";
assert.equal(compiled.split(ioImport).length, 2, 'Replace only the diagnostic I/O import, not production logic');

const pageEvents = ['request', 'requestfinished', 'requestfailed', 'response', 'pageerror', 'console'];
const dataModule = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

let nextModule = 0;

async function importHelper(io) {
  // Each ESM instance gets its own I/O and clock. No process-wide filesystem or timer mocks.
  const key = `__desktopEvidenceTestIo${++nextModule}`;
  globalThis[key] = io;

  try {
    const adapter = dataModule(`
      const io = globalThis[${JSON.stringify(key)}];
      export const writeFile = (...args) => io.writeFile(...args);
      export const setTimeout = (...args) => io.setTimeout(...args);
      export const clearTimeout = (...args) => io.clearTimeout(...args);
    `);

    return await import(
      dataModule(
        compiled
          .replace(
            "'./runtime-service-progress'",
            JSON.stringify(
              dataModule(
                ts.transpileModule(
                  readFileSync(new URL('../../tests/e2e/helpers/runtime-service-progress.ts', import.meta.url), 'utf8'),
                  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
                ).outputText,
              ),
            ),
          )
          .replace(
            "'../../../scripts/ci/browser-network-evidence.mjs'",
            JSON.stringify(new URL('./browser-network-evidence.mjs', import.meta.url).href),
          )
          .replace(
            "'../../../scripts/ci/secrets-lifecycle-evidence.mjs'",
            JSON.stringify(new URL('./secrets-lifecycle-evidence.mjs', import.meta.url).href),
          )
          .replace(ioImport, `import { writeFile, setTimeout, clearTimeout } from '${adapter}';`),
      )
    );
  } finally {
    delete globalThis[key];
  }
}

function browser() {
  const dom = new JSDOM(
    `<!doctype html><html data-ecode-theme-ready><body>
      <input value="PRIVATE_INPUT"><input type="password" value="PRIVATE_PASSWORD">
      <div class="bolt-responsive-ide bolt-responsive-ide-desktop PRIVATE_CLASS">PRIVATE_BODY</div>
      <section data-testid="ide-agent-panel">PRIVATE_AGENT_TEXT</section>
      <div data-testid="ide-add-tab-command-palette">PRIVATE_PALETTE_TEXT</div>
      <div data-testid="responsive-code-editor">PRIVATE_CODE</div>
      <h1 id="root-error-heading">PRIVATE_ERROR_MESSAGE</h1>
      <div class="bolt-project-tool-menu"><button title="PRIVATE_TITLE"><span>PRIVATE_BUTTON</span></button></div>
      <script src="https://example.invalid/PRIVATE_SCRIPT?token=PRIVATE_SCRIPT_TOKEN"></script>
    </body></html>`,
    { url: 'https://example.invalid/PRIVATE_PATH?panel=snapshots&token=PRIVATE_URL_TOKEN', runScripts: 'outside-only' },
  );
  dom.window.document.cookie = 'secret=PRIVATE_COOKIE';
  dom.window.performance.getEntriesByType = () => [
    { initiatorType: 'script', name: 'https://example.invalid/PRIVATE_RESOURCE?secret=PRIVATE_RESOURCE_TOKEN' },
    { initiatorType: 'fetch', name: 'PRIVATE_FETCH' },
  ];
  dom.window.Element.prototype.getBoundingClientRect = () => ({ x: 4, y: 8, width: 800, height: 600 });

  return dom;
}

async function harness({ dom, evaluate, write, timers = {}, expectedStatus = 'passed', initFailure } = {}) {
  const writes = [];
  const evaluations = [];
  const initScripts = [];

  let stops = 0;

  const context =
    dom?.getInternalVMContext() ??
    vm.createContext({
      window: {
        __desktopLayoutProbe: {
          stop() {
            stops++;
          },
        },
      },
    });

  const execute = (callback) => vm.runInContext(`(${callback.toString()})()`, context);

  const helper = await importHelper({
    writeFile: write ?? (async (path, data) => writes.push({ path, data })),
    setTimeout,
    clearTimeout,
    ...timers,
  });

  const page = new EventEmitter();

  page.addInitScript = async (callback) => {
    initScripts.push(callback);

    if (initFailure) {
      throw initFailure;
    }

    if (dom) {
      execute(callback);
    }
  };

  page.evaluate = async (callback) => {
    evaluations.push(callback);

    if (callback === helper.collectDesktopBrowserEvidence) {
      return evaluate ? evaluate(callback) : dom ? execute(callback) : {};
    }

    return execute(callback);
  };

  const testInfo = { timeout: 120_000, expectedStatus, outputPath: (name) => `/test/${name}` };

  return {
    helper,
    page,
    writes,
    evaluations,
    initScripts,
    execute,
    testInfo,
    stops: () => stops,
    run: (scenario = async () => {}, isMobile = false) =>
      helper.withDesktopLayoutEvidence(scenario)({ page, isMobile }, testInfo),
  };
}

function assertClean(instance) {
  for (const event of pageEvents) {
    assert.equal(instance.page.listenerCount(event), 0, `${event} listener must be removed`);
  }
  assert.ok(instance.stops() > 0, 'The browser cleanup callback must call probe.stop()');
}

function failingScenario(error) {
  return async () => {
    throw error;
  };
}

for (const failure of ['successful capture', 'capture rejection', 'write failure']) {
  test(`preserves the original thrown error through ${failure} and removes all observers`, async () => {
    const original = new Error('PRIVATE_SCENARIO_FAILURE');

    const instance = await harness({
      evaluate: async () => {
        if (failure === 'capture rejection') {
          throw new Error('PRIVATE_CAPTURE_FAILURE');
        }

        return { readyState: 'complete' };
      },
      ...(failure === 'write failure'
        ? {
            write: async () => {
              throw new Error('PRIVATE_WRITE_FAILURE');
            },
          }
        : {}),
    });
    await assert.rejects(instance.run(failingScenario(original)), (error) => error === original);
    assertClean(instance);
    assert.equal(instance.initScripts[0], instance.helper.installDesktopBrowserProbe);

    if (failure !== 'write failure') {
      assert.equal(instance.writes.length, 1);
      assert.equal(instance.writes[0].path, '/test/desktop-layout-evidence.json');

      const payload = JSON.parse(instance.writes[0].data);
      assert.deepEqual(payload.browser, failure === 'capture rejection' ? null : { readyState: 'complete' });
      assert.ok(!instance.writes[0].data.includes('PRIVATE_'));
    }
  });
}

test('success forwards the original fixtures and TestInfo, stops observers, and writes no file', async () => {
  const instance = await harness();

  let ran = false;
  await instance.run(async ({ page, isMobile }, testInfo) => {
    ran = true;
    assert.equal(page, instance.page);
    assert.equal(isMobile, true);
    assert.equal(testInfo, instance.testInfo);

    for (const event of pageEvents) {
      assert.equal(page.listenerCount(event), 1);
    }
  }, true);
  assert.equal(ran, true);
  assert.deepEqual(instance.writes, []);
  assert.ok(!instance.evaluations.includes(instance.helper.collectDesktopBrowserEvidence));
  assertClean(instance);
});

test('skipped scenarios preserve their thrown sentinel without writing evidence', async () => {
  const instance = await harness({ expectedStatus: 'skipped' });
  const skipped = new Error('PRIVATE_SKIP_REASON');
  await assert.rejects(instance.run(failingScenario(skipped)), (error) => error === skipped);
  assert.deepEqual(instance.writes, []);
  assertClean(instance);
});

test('a rejected init script does not prevent the scenario from running', async () => {
  const instance = await harness({ initFailure: new Error('PRIVATE_INIT_FAILURE') });

  let ran = false;
  await instance.run(async () => {
    ran = true;
  });
  assert.equal(ran, true);
  assert.deepEqual(instance.writes, []);
  assertClean(instance);
});

test('stalled capture expires at three seconds, clears its timer, and preserves the failure', async () => {
  let expire;
  let delay;
  let cleared;

  const timer = {};

  let started;

  const scheduled = new Promise((resolve) => {
    started = resolve;
  });
  const instance = await harness({
    evaluate: () => new Promise(() => {}),
    timers: {
      setTimeout: (callback, milliseconds) => {
        expire = callback;
        delay = milliseconds;
        started();

        return timer;
      },
      clearTimeout: (handle) => {
        cleared = handle;
      },
    },
  });

  const original = new Error('PRIVATE_SCENARIO_FAILURE');
  const rejected = assert.rejects(instance.run(failingScenario(original)), (error) => error === original);
  await scheduled;
  assert.equal(delay, 3_000);
  expire();
  await rejected;
  assert.equal(cleared, timer);
  assert.equal(JSON.parse(instance.writes[0].data).browser, null);
  assertClean(instance);
});

test('completed capture clears its timeout and preserves unrelated page listeners', async () => {
  const timer = {};
  const cleared = [];

  const instance = await harness({
    timers: {
      setTimeout: (_callback, delay) => {
        assert.equal(delay, 3_000);

        return timer;
      },
      clearTimeout: (handle) => cleared.push(handle),
    },
  });

  const existingListener = () => {};

  for (const event of pageEvents) {
    instance.page.on(event, existingListener);
  }

  const original = new Error('PRIVATE_SCENARIO_FAILURE');
  await assert.rejects(instance.run(failingScenario(original)), (error) => error === original);
  assert.deepEqual(cleared, [timer]);

  for (const event of pageEvents) {
    assert.deepEqual(instance.page.listeners(event), [existingListener]);
    instance.page.off(event, existingListener);
  }
  assertClean(instance);
});

test('the 64 KiB cap counts UTF-8 bytes rather than string length', async () => {
  const instance = await harness({ evaluate: async () => 'é'.repeat(40_000) });
  const original = new Error('PRIVATE_SCENARIO_FAILURE');
  await assert.rejects(instance.run(failingScenario(original)), (error) => error === original);
  assert.equal(instance.writes.length, 1);
  assert.ok(Buffer.byteLength(instance.writes[0].data, 'utf8') <= 64 * 1024);

  const payload = JSON.parse(instance.writes[0].data);
  assert.equal(payload.browser, null);
  assert.equal(payload.omitted, 'size-limit');
  assertClean(instance);
});

test('real observer and projection record replacement IDs, phases, counts, and categories without private data', async () => {
  const dom = browser();

  try {
    const previousPhases = [];
    const previousMark = (phase) => previousPhases.push(phase);
    dom.window.__vibecoreStartupMark = previousMark;

    const instance = await harness({ dom });
    const original = new Error('PRIVATE_SCENARIO_FAILURE');
    const shell = dom.window.document.querySelector('.bolt-responsive-ide');

    let originalId;
    let replacementId;
    await assert.rejects(
      instance.run(async ({ page }) => {
        const probe = dom.window.__desktopLayoutProbe;
        originalId = probe.id(shell);
        dom.window.__vibecoreStartupMark('hydrate-requested');
        dom.window.__vibecoreStartupMark('layout-restored');
        dom.window.__vibecoreStartupMark('PRIVATE_ARBITRARY_PHASE');

        const replacement = shell.cloneNode(true);
        shell.replaceWith(replacement);
        await Promise.resolve();
        replacementId = probe.id(replacement);

        const button = dom.window.document.querySelector('.bolt-project-tool-menu span');
        button.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
        button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

        const request = (kind) => ({ resourceType: () => kind, url: () => 'https://example.invalid/PRIVATE_REQUEST' });

        for (const kind of [
          'document',
          'script',
          'stylesheet',
          'image',
          'font',
          'xhr',
          'fetch',
          'other',
          'PRIVATE_TYPE',
        ]) {
          page.emit('request', request(kind));
          page.emit('requestfinished', request(kind));
          page.emit('requestfailed', request(kind));
        }

        for (const status of [200, 299, 300, 399, 400, 499, 500, 599, 101]) {
          page.emit('response', { status: () => status, url: () => 'PRIVATE_RESPONSE_URL' });
        }

        for (const [name, message] of [
          ['Error', 'hydration PRIVATE_HYDRATION_ERROR'],
          ['Error', 'Minified React error #418 PRIVATE_REACT_ERROR'],
          ['Error', 'Loading chunk PRIVATE_MODULE_ERROR'],
          ['Error', 'i18n-catalogue PRIVATE_CATALOGUE_ERROR'],
          ['TypeError', 'PRIVATE_TYPE_ERROR'],
          ['ReferenceError', 'PRIVATE_REFERENCE_ERROR'],
          ['SyntaxError', 'PRIVATE_SYNTAX_ERROR'],
          ['RangeError', 'PRIVATE_RANGE_ERROR'],
          ['PRIVATE_ERROR_NAME', 'PRIVATE_OTHER_ERROR'],
        ]) {
          page.emit('pageerror', { name, message, stack: 'PRIVATE_STACK' });
        }
        page.emit('console', { type: () => 'error', text: () => 'PRIVATE_CONSOLE_ERROR' });
        page.emit('console', { type: () => 'info', text: () => 'PRIVATE_CONSOLE_INFO' });
        throw original;
      }),
      (error) => error === original,
    );

    const serialized = instance.writes[0].data;
    const payload = JSON.parse(serialized);
    assert.ok(!serialized.includes('PRIVATE_'));
    assert.ok(!serialized.includes('https://'));
    assert.ok(!serialized.includes('example.invalid'));
    assert.ok(Buffer.byteLength(serialized, 'utf8') <= 64 * 1024);
    assert.deepEqual(Object.keys(payload), [
      'browser',
      'serviceProgress',
      'requests',
      'statuses',
      'errors',
      'networkFailures',
    ]);
    assert.equal(payload.browser.selectedPanel, 'snapshots');
    assert.equal(payload.browser.themeReady, true);
    assert.deepEqual(payload.browser.scripts, { elements: 1, resources: 1 });
    assert.deepEqual(
      payload.browser.phases.map(({ phase }) => phase),
      ['hydrate-requested', 'layout-restored'],
    );
    assert.notEqual(originalId, replacementId);
    assert.deepEqual(
      payload.browser.changes.filter(({ surface }) => surface === 'shell').map(({ ids }) => ids),
      [[originalId], [replacementId]],
    );
    assert.deepEqual(
      payload.browser.clicks.map(({ event }) => event),
      ['pointerdown', 'click'],
    );

    const surface = payload.browser.surfaces.find(({ selector }) => selector === '.bolt-responsive-ide');
    assert.equal(surface.count, 1);
    assert.equal(surface.elements[0].id, replacementId);
    assert.equal(surface.elements[0].desktop, true);
    assert.equal(surface.elements[0].width, 800);
    assert.deepEqual(payload.requests.script, { started: 1, finished: 1, failed: 1 });
    assert.deepEqual(payload.requests.other, { started: 2, finished: 2, failed: 2 });
    assert.deepEqual(payload.statuses, { success: 2, redirect: 2, clientError: 2, serverError: 2, other: 1 });
    assert.deepEqual(payload.errors, {
      hydration: 2,
      'module-load': 1,
      catalogue: 1,
      TypeError: 1,
      ReferenceError: 1,
      SyntaxError: 1,
      RangeError: 1,
      other: 2,
    });
    assert.equal(dom.window.__vibecoreStartupMark, previousMark);
    assert.deepEqual(previousPhases, ['hydrate-requested', 'layout-restored', 'PRIVATE_ARBITRARY_PHASE']);

    for (const event of pageEvents) {
      assert.equal(instance.page.listenerCount(event), 0);
    }

    const probe = dom.window.__desktopLayoutProbe;
    const before = JSON.stringify({ phases: probe.phases, changes: probe.changes, clicks: probe.clicks });
    dom.window.document.querySelector('.bolt-project-tool-menu button').click();
    dom.window.document.querySelector('.bolt-responsive-ide').remove();
    dom.window.__vibecoreStartupMark('monaco-create-ready');
    await Promise.resolve();
    assert.equal(JSON.stringify({ phases: probe.phases, changes: probe.changes, clicks: probe.clicks }), before);

    dom.reconfigure({ url: 'https://example.invalid/PRIVATE_PATH?panel=PRIVATE_PANEL&secret=PRIVATE_QUERY' });

    const unknownPanel = instance.execute(instance.helper.collectDesktopBrowserEvidence);
    assert.equal(unknownPanel.selectedPanel, 'other');
    assert.ok(!JSON.stringify(unknownPanel).includes('PRIVATE_'));
    dom.reconfigure({ url: 'https://example.invalid/PRIVATE_PATH' });
    assert.equal(instance.execute(instance.helper.collectDesktopBrowserEvidence).selectedPanel, null);
  } finally {
    dom.window.close();
  }
});

test('browser event histories and projected elements remain bounded under repeated events', async () => {
  const dom = browser();

  try {
    const instance = await harness({ dom });
    instance.execute(instance.helper.installDesktopBrowserProbe);

    for (let index = 0; index < 100; index++) {
      dom.window.__vibecoreStartupMark('monaco-create-ready');
      dom.window.document.querySelector('.bolt-project-tool-menu button').click();

      const shell = dom.window.document.querySelector('.bolt-responsive-ide');
      shell.replaceWith(shell.cloneNode(true));
      await Promise.resolve();
    }

    for (let index = 0; index < 10; index++) {
      dom.window.document.body.append(dom.window.document.querySelector('.bolt-responsive-ide').cloneNode(true));
    }
    await Promise.resolve();

    const evidence = instance.execute(instance.helper.collectDesktopBrowserEvidence);
    assert.equal(evidence.phases.length, 64);
    assert.equal(evidence.clicks.length, 32);
    assert.equal(evidence.changes.length, 96);
    assert.ok(evidence.dropped > 0);

    const shells = evidence.surfaces.find(({ selector }) => selector === '.bolt-responsive-ide');
    assert.equal(shells.count, 11);
    assert.equal(shells.elements.length, 4);
    assert.ok(evidence.changes.every(({ ids }) => ids.length <= 4));
    assert.ok(Buffer.byteLength(JSON.stringify(evidence), 'utf8') <= 64 * 1024);
  } finally {
    dom.window.close();
  }
});

function visit(node, inspect) {
  inspect(node);
  ts.forEachChild(node, (child) => visit(child, inspect));
}

test('diagnostics wrap the reviewed desktop and compact runtime scenarios without increasing their budgets', () => {
  const expected = new Map([
    ['mobile-device-matrix.spec.ts:assertEveryCompactPanelForProfile', [90_000]],
    [
      'dashboard.spec.ts:IDE project services open as in-place panels instead of legacy project pages',
      [30_000, ...Array(16).fill(15_000)],
    ],
    [
      'responsive-ide.spec.ts:desktop keeps the full IDE workspace available',
      [45_000, 15_000, 15_000, 45_000, 45_000, 5_000, 5_000],
    ],
    [
      'responsive-ide.spec.ts:desktop can collapse and restore the right preview panel',
      [15_000, 15_000, 15_000, 15_000],
    ],
    ['responsive-ide.spec.ts:desktop opens terminal as a workspace panel from the panel URL', [15_000, 15_000]],
    ['dashboard.spec.ts:edit file workflow surfaces editor, files, terminal and preview affordances', [15_000, 15_000]],
    ['dashboard.spec.ts:reopens project IDE with persisted agent memory and panel state', Array(6).fill(15_000)],
  ]);

  /*
   * These two existing dashboard scenarios inherit their test budget. Wrapping
   * diagnostics must not add setTimeout or relax any of their original waits.
   * Every wrapped scenario has an explicit contract; no fallback accepts new ones.
   */
  const expectedTestBudgets = new Map([
    ['mobile-device-matrix.spec.ts:assertEveryCompactPanelForProfile', []],
    ['dashboard.spec.ts:IDE project services open as in-place panels instead of legacy project pages', [120_000]],
    ['responsive-ide.spec.ts:desktop keeps the full IDE workspace available', [120_000]],
    ['responsive-ide.spec.ts:desktop can collapse and restore the right preview panel', [120_000]],
    ['responsive-ide.spec.ts:desktop opens terminal as a workspace panel from the panel URL', [120_000]],
    ['dashboard.spec.ts:edit file workflow surfaces editor, files, terminal and preview affordances', []],
    ['dashboard.spec.ts:reopens project IDE with persisted agent memory and panel state', []],
  ]);
  assert.deepEqual([...expectedTestBudgets.keys()].sort(), [...expected.keys()].sort());

  /*
   * Keep the original 30s + sixteen 15s waits pinned separately. The equivalent
   * Secrets/Database/Domains flows add exactly four 15s waits, not larger budgets:
   * Domains GET, Domains form, Domains scope notice, and the edited secret reveal.
   */
  const addedServicesWaits = new Map([
    ['domains-backend', 15_000],
    ['domains-form', 15_000],
    ['domains-scope', 15_000],
    ['updated-secret-reveal', 15_000],
  ]);

  const actualAddedServicesWaits = new Map();

  let observerFixtureWrappers = 0;

  const actual = new Map();
  const directory = new URL('../../tests/e2e/', import.meta.url);

  for (const filename of readdirSync(directory).filter((entry) => entry.endsWith('.spec.ts'))) {
    const contents = readFileSync(new URL(filename, directory), 'utf8');
    const tree = ts.createSourceFile(filename, contents, ts.ScriptTarget.Latest, true);
    visit(tree, (node) => {
      if (!ts.isCallExpression(node) || node.expression.getText(tree) !== 'withDesktopLayoutEvidence') {
        return;
      }

      const assertSuccessCapture = () => {
        assert.equal(node.arguments.length, 2);

        const options = node.arguments[1];
        assert.ok(ts.isObjectLiteralExpression(options));
        assert.equal(options.properties.length, 1);

        const capture = options.properties[0];
        assert.ok(ts.isPropertyAssignment(capture));
        assert.equal(capture.name.getText(tree), 'captureOnSuccess');
        assert.equal(capture.initializer.kind, ts.SyntaxKind.TrueKeyword);
      };

      // The observer's own regression fixture is not an application readiness scenario.
      if (filename === 'workspace-status-contract.spec.ts') {
        assert.ok(ts.isVariableDeclaration(node.parent));
        assert.equal(node.parent.name.getText(tree), 'run');
        assert.ok(ts.isArrowFunction(node.arguments[0]));
        assertSuccessCapture();
        observerFixtureWrappers++;

        return;
      }

      const testCall = node.parent;
      assert.ok(ts.isCallExpression(testCall));

      const scenario = node.arguments[0];
      assert.ok(ts.isArrowFunction(scenario));

      let key;

      const compact = filename === 'mobile-device-matrix.spec.ts';

      if (compact) {
        assert.equal(testCall.expression, node);
        assert.equal(testCall.arguments.length, 2);
        assert.equal(testCall.arguments[0].getText(tree), '{ page, isMobile: true }');
        assert.equal(testCall.arguments[1].getText(tree), 'testInfo');
        assert.ok(ts.isAwaitExpression(testCall.parent));

        let owner = testCall.parent;

        while (owner && !ts.isFunctionDeclaration(owner)) {
          owner = owner.parent;
        }
        assert.equal(owner?.name?.text, 'assertEveryCompactPanelForProfile');
        key = `${filename}:${owner.name.text}`;
      } else {
        assert.equal(testCall.expression.getText(tree), 'test');
        assert.equal(testCall.arguments.length, 3);
        assert.ok(ts.isStringLiteral(testCall.arguments[0]));
        assert.match(testCall.arguments[1].getText(tree), /tag:\s*'@runtime'/);
        assert.equal(testCall.arguments[2], node);
        key = `${filename}:${testCall.arguments[0].text}`;
      }

      if (key === 'dashboard.spec.ts:edit file workflow surfaces editor, files, terminal and preview affordances') {
        assertSuccessCapture();
      } else {
        assert.equal(node.arguments.length, 1);
      }

      assert.ok(!actual.has(key), 'No duplicate wrappers');

      const timeouts = [];
      const testBudgets = [];
      visit(scenario.body, (child) => {
        if (ts.isPropertyAssignment(child) && child.name.getText(tree) === 'timeout') {
          assert.ok(ts.isNumericLiteral(child.initializer));

          const value = Number(child.initializer.text);

          let addedWait;

          if (
            key === 'dashboard.spec.ts:IDE project services open as in-place panels instead of legacy project pages'
          ) {
            const call = child.parent.parent;
            assert.ok(ts.isCallExpression(call));

            const expression = call.expression.getText(tree).replace(/\s+/g, ' ');

            if (expression === 'page.waitForResponse' && call.getText(tree).includes('/ide-panel/domains`')) {
              addedWait = 'domains-backend';
            } else if (
              expression ===
              `expect(deployment.locator('.bolt-project-domains-panel input[name="domain"]')).toBeVisible`
            ) {
              addedWait = 'domains-form';
            } else if (expression === "expect(deployment.getByTestId('project-domains-scope-notice')).toBeVisible") {
              addedWait = 'domains-scope';
            } else if (
              expression === 'expect(connectionRow.getByText(updatedDatabaseValue, { exact: true })).toBeVisible'
            ) {
              addedWait = 'updated-secret-reveal';
            }
          }

          if (addedWait) {
            assert.ok(!actualAddedServicesWaits.has(addedWait), 'No duplicated additional wait');
            actualAddedServicesWaits.set(addedWait, value);
          } else {
            timeouts.push(value);
          }
        }

        if (ts.isCallExpression(child) && child.expression.getText(tree) === 'test.setTimeout') {
          assert.ok(ts.isNumericLiteral(child.arguments[0]));
          testBudgets.push(Number(child.arguments[0].text));
        }
      });
      assert.ok(expectedTestBudgets.has(key), `Unreviewed diagnostic wrapper: ${key}`);
      assert.deepEqual(testBudgets, expectedTestBudgets.get(key), key);
      actual.set(key, timeouts);
    });
  }
  assert.equal(observerFixtureWrappers, 1);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actualAddedServicesWaits, addedServicesWaits);

  const runtimeWorkflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.match(
    runtimeWorkflow,
    /playwright test tests\/e2e --project=chromium --grep @runtime --retries=0 --max-failures=0/,
  );
});

for (const failure of [false, true]) {
  test(`compact context installs startup evidence before navigation and closes after diagnostics (failure=${failure})`, async () => {
    const contents = readFileSync(new URL('../../tests/e2e/mobile-device-matrix.spec.ts', import.meta.url), 'utf8');
    const tree = ts.createSourceFile('mobile-device-matrix.spec.ts', contents, ts.ScriptTarget.Latest, true);

    const scenarios = tree.statements.filter(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'assertEveryCompactPanelForProfile',
    );
    assert.equal(scenarios.length, 1, 'Execute the actual explicit-context scenario');

    const events = [];
    const original = new Error('PRIVATE_SCENARIO_FAILURE');
    const instance = await harness({ write: async () => events.push('desktop evidence') });
    const { page } = instance;

    const context = {
      addCookies: async () => events.push('cookies'),
      newPage: async () => {
        events.push('page');
        return page;
      },
      close: async () => {
        assertClean(instance);
        events.push('close');
      },
    };

    page.goto = async () => {
      assert.equal(instance.initScripts.length, 1, 'Startup hook installed before goto');

      for (const event of pageEvents) {
        assert.equal(page.listenerCount(event), 1);
      }
      events.push('goto');
    };

    page.locator = (selector) => {
      assert.equal(selector, '.bolt-responsive-ide-mobile');
      return selector;
    };

    const testInfo = { ...instance.testInfo, attach: async () => events.push('attach') };

    const bindings = {
      withDesktopLayoutEvidence: instance.helper.withDesktopLayoutEvidence,
      appBaseUrl: 'https://fixture.invalid',
      expect: () => ({
        toBeVisible: async ({ timeout }) => {
          assert.equal(timeout, 90_000);
          events.push('shell assertion');
        },
      }),
      compactIdePanels: ['preview'],
      test: { step: async (_title, body) => body() },
      openCompactPanel: async () => events.push('open'),
      assertCompactPanelRendered: async () => {
        events.push('render assertion');

        if (failure) {
          throw original;
        }
      },
      assertCompactPanelLayout: async () => events.push('layout assertion'),
      compactPanelScreenshotTarget: () => ({
        screenshot: async () => {
          events.push('screenshot');
          return Buffer.alloc(0);
        },
      }),
      captureCompactLayoutEvidence: async (capturedPage) => {
        assert.equal(capturedPage, page);
        assert.ok(!events.includes('close'));
        events.push('mobile evidence');
      },
    };
    const compiledScenario = ts.transpileModule(
      scenarios[0].getText(tree) + '\nreturn assertEveryCompactPanelForProfile;',
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;

    const run = new Function(...Object.keys(bindings), compiledScenario)(...Object.values(bindings));

    const result = run(
      { newContext: async () => context },
      { token: 'fixture-token' },
      'fixture-project',
      { name: 'fixture-profile', viewport: { width: 768, height: 1024 }, userAgent: 'fixture' },
      testInfo,
    );

    if (failure) {
      await assert.rejects(result, (error) => error === original);
    } else {
      await result;
    }

    assert.deepEqual(events, [
      'cookies',
      'page',
      'goto',
      'shell assertion',
      'open',
      'render assertion',
      ...(failure ? ['desktop evidence', 'mobile evidence'] : ['layout assertion', 'screenshot', 'attach']),
      'close',
    ]);
  });
}

test('retains bounded Node-side Services progress when browser capture fails or exceeds size limit', async () => {
  for (const oversized of [false, true]) {
    const instance = await harness({
      evaluate: async () => {
        if (oversized) {
          return 'é'.repeat(40_000);
        }

        throw new Error('PRIVATE_CAPTURE_FAILURE');
      },
    });

    const original = new Error('PRIVATE_SCENARIO_FAILURE');
    await assert.rejects(
      instance.run(async (_fixtures, testInfo) => {
        const progress = instance.helper.runtimeServiceProgress(testInfo);
        progress.mark('setup');
        progress.mark('edit-secret-open-menu');
        throw original;
      }),
      (error) => error === original,
    );

    const payload = JSON.parse(instance.writes[0].data);
    assert.equal(payload.browser, null);
    assert.deepEqual(
      payload.serviceProgress.events.map(({ phase }) => phase),
      ['setup', 'edit-secret-open-menu'],
    );
    assert.equal(payload.serviceProgress.omitted, 0);

    for (const event of payload.serviceProgress.events) {
      assert.ok(Number.isFinite(event.elapsedMs));
      assert.ok(Number.isFinite(event.remainingBudgetEstimateMs));
    }
    assert.ok(!instance.writes[0].data.includes('PRIVATE'));
    assertClean(instance);
  }
});

test('streams Secrets events into failure evidence even with no final browser access, then disables capture', async () => {
  const instance = await harness({
    evaluate: async () => {
      throw new Error('PRIVATE_CAPTURE_FAILURE');
    },
  });

  const frame = {};

  let receive;
  instance.page.mainFrame = () => frame;

  instance.page.exposeBinding = async (_name, callback) => {
    receive = callback;
  };

  const original = new Error('PRIVATE_SCENARIO_FAILURE');

  const event = {
    event: 'click',
    target: 'new-secret',
    panel: true,
    menu: false,
    form: false,
    panelReplaced: false,
    trusted: true,
  };
  await assert.rejects(
    instance.run(async ({ page }, testInfo) => {
      await instance.helper.startSecretsLifecycleEvidence(page, testInfo);
      receive({ frame }, { ...event, value: 'PRIVATE_SECRET' });
      throw original;
    }),
    (error) => error === original,
  );

  const payload = JSON.parse(instance.writes[0].data);
  assert.equal(payload.browser, null);
  assert.equal(payload.secretsLifecycle.installed, true);
  assert.equal(payload.secretsLifecycle.events.length, 1);
  assert.equal(payload.secretsLifecycle.events[0].target, 'new-secret');
  assert.ok(!instance.writes[0].data.includes('PRIVATE'));
  receive({ frame }, event);
  assertClean(instance);
});
