import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const source = readFileSync(new URL('../../tests/e2e/mobile-device-matrix.spec.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('mobile-device-matrix.spec.ts', source, ts.ScriptTarget.Latest, true);

const helpers = tree.statements.filter(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'captureCompactLayoutEvidence',
);
assert.equal(helpers.length, 1, 'Extract exactly the production diagnostic helper');

const helper = helpers[0];
const evaluateCalls = [];

function visit(node) {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(tree) === 'page' &&
    node.expression.name.text === 'evaluate'
  ) {
    evaluateCalls.push(node);
  }

  ts.forEachChild(node, visit);
}

visit(helper);
assert.equal(evaluateCalls.length, 1, 'Exercise the sole browser evidence callback');

const browserCallback = evaluateCalls[0].arguments[0];
assert.ok(ts.isArrowFunction(browserCallback));
assert.ok(ts.isBlock(browserCallback.body));

const compiled = ts.transpileModule(helper.getText(tree), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ evaluate = async () => ({}), write, globals = {}, timers = {} } = {}) {
  const writes = [];

  const context = vm.createContext({
    Buffer,
    setTimeout,
    clearTimeout,
    compactIdePanels: ['agent', 'editor', 'preview', 'files', 'terminal', 'deployments'],
    writeFile: write ?? (async (path, data) => writes.push({ path, data })),
    ...globals,
    ...timers,
  });
  vm.runInContext(compiled, context);

  return {
    writes,
    run: (profile = 'iphone-pro-max') =>
      context.captureCompactLayoutEvidence({ evaluate }, { outputPath: (name) => `/test/${name}` }, profile),
  };
}

test('captures evidence under the collector filename', async () => {
  const instance = harness({ evaluate: async () => ({ selectedPanel: 'preview' }) });
  await instance.run();
  assert.equal(instance.writes.length, 1);
  assert.equal(instance.writes[0].path, '/test/mobile-layout-evidence.json');
  assert.deepEqual(JSON.parse(instance.writes[0].data), {
    profile: 'iphone-pro-max',
    evidence: { selectedPanel: 'preview' },
  });
});

test('rejected capture records null without serializing the browser error', async () => {
  const instance = harness({
    evaluate: async () => {
      throw new Error('PRIVATE_BROWSER_ERROR');
    },
  });
  await instance.run('android-landscape');
  assert.equal(JSON.parse(instance.writes[0].data).evidence, null);
  assert.ok(!instance.writes[0].data.includes('PRIVATE_BROWSER_ERROR'));
});

test('enforces a 64 KiB byte cap, including multibyte text', async () => {
  const instance = harness({ evaluate: async () => 'é'.repeat(40_000) });
  await instance.run('ipad-landscape');
  assert.ok(Buffer.byteLength(instance.writes[0].data, 'utf8') <= 64 * 1024);
  assert.deepEqual(JSON.parse(instance.writes[0].data), {
    profile: 'ipad-landscape',
    evidence: null,
    omitted: 'size-limit',
  });
});

test('a diagnostic write failure cannot replace the original test failure', async () => {
  const instance = harness({
    write: async () => {
      throw new Error('write failed');
    },
  });
  await assert.doesNotReject(instance.run());
});

test('stalled browser capture is bounded to three seconds and clears its timer', async () => {
  let expire;
  let delay;
  let cleared;

  const timer = {};

  const instance = harness({
    evaluate: () => new Promise(() => {}),
    timers: {
      setTimeout: (callback, milliseconds) => {
        expire = callback;
        delay = milliseconds;

        return timer;
      },
      clearTimeout: (handle) => {
        cleared = handle;
      },
    },
  });

  const pending = instance.run();
  assert.equal(delay, 3_000);
  expire();
  await pending;
  assert.equal(JSON.parse(instance.writes[0].data).evidence, null);
  assert.equal(cleared, timer);
});

test('browser callback exposes only the reviewed structural schema', () => {
  const returnStatement = browserCallback.body.statements.find((node) => ts.isReturnStatement(node));
  assert.ok(returnStatement && ts.isObjectLiteralExpression(returnStatement.expression));

  const fields = returnStatement.expression.properties;
  assert.deepEqual(
    fields.map((node) => node.name?.getText(tree)),
    ['fallbackState', 'readyState', 'selectedPanel', 'viewport', 'surfaces'],
  );

  const selectedPanel = fields.find((node) => node.name?.getText(tree) === 'selectedPanel');
  assert.equal(
    selectedPanel.initializer.getText(tree),
    "safePanel(new URL(window.location.href).searchParams.get('panel'))",
  );

  const forbiddenReads = [];
  const rawTextFields = [];

  const inspect = (node) => {
    if (ts.isPropertyAccessExpression(node)) {
      if (['innerHTML', 'outerHTML', 'innerText', 'value', 'cookie', 'headers'].includes(node.name.text)) {
        forbiddenReads.push(node.getText(tree));
      }

      if (node.name.text === 'textContent') {
        let ancestor = node.parent;

        while (ancestor && !ts.isPropertyAssignment(ancestor)) {
          ancestor = ancestor.parent;
        }
        rawTextFields.push(ancestor?.name.getText(tree));
      }
    }

    ts.forEachChild(node, inspect);
  };
  inspect(browserCallback);
  assert.deepEqual(forbiddenReads, []);
  assert.deepEqual(rawTextFields, ['applicationErrorHeadingVisible', 'routeErrorHeadingVisible']);
});

test('real browser callback does not serialize URL tokens, input values, cookies, HTML, or raw text', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <h1>PRIVATE_HEADING</h1>
      <form><input name="email" value="PRIVATE_EMAIL"><input name="password" autocomplete="current-password" value="PRIVATE_PASSWORD"></form>
      <div class="bolt-responsive-ide-mobile PRIVATE_CLASS" data-mobile-panel="PRIVATE_PANEL">
        <div class="bolt-workbench-mobile"><div class="fixed">PRIVATE_BODY<iframe src="https://example.invalid/PRIVATE_FRAME"></iframe></div></div>
      </div>
      <div data-testid="ide-service-panel" data-panel="PRIVATE_SERVICE">PRIVATE_SERVICE_TEXT</div>
      <div role="alert">PRIVATE_ALERT</div>
    </body>`,
    { url: 'https://example.invalid/PRIVATE_PATH?panel=preview&token=PRIVATE_TOKEN' },
  );

  try {
    dom.window.document.cookie = 'secret=PRIVATE_COOKIE';
    dom.window.matchMedia = () => ({ matches: true });
    dom.window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 390, height: 844 });

    const instance = harness({
      evaluate: async (callback, panels) => callback(panels),
      globals: {
        window: dom.window,
        document: dom.window.document,
        URL,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      },
    });
    await instance.run();

    const serialized = instance.writes[0].data;
    const { evidence } = JSON.parse(serialized);
    assert.ok(evidence, 'Privacy checks must exercise a successful browser callback');
    assert.equal(evidence.selectedPanel, 'preview');
    assert.equal(evidence.fallbackState.signInFormVisible, true);
    assert.equal(evidence.fallbackState.applicationErrorHeadingVisible, false);
    assert.equal(evidence.fallbackState.routeErrorHeadingVisible, false);
    assert.equal(evidence.surfaces.find((surface) => surface.selector === '.bolt-responsive-ide-mobile').count, 1);
    assert.ok(!serialized.includes('PRIVATE_'));
    assert.ok(!serialized.includes('https://'));
    assert.ok(Buffer.byteLength(serialized, 'utf8') <= 64 * 1024);

    dom.reconfigure({ url: 'https://example.invalid/PRIVATE_PATH?panel=PRIVATE_PANEL&token=PRIVATE_TOKEN' });
    await instance.run();
    assert.equal(JSON.parse(instance.writes[1].data).evidence.selectedPanel, null);
    assert.ok(!instance.writes[1].data.includes('PRIVATE_'));
  } finally {
    dom.window.close();
  }
});
