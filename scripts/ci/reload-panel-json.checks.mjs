import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../tests/e2e/helpers/reload-panel-json.ts', import.meta.url), 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;

const { reloadPanelJson } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function setup() {
  const page = new EventEmitter();
  const main = {};
  page.mainFrame = () => main;

  let predicate;
  let resolve;
  let reject;

  page.waitForResponse = (match, options) => {
    assert.equal(options, undefined, 'retain the existing default timeout');
    predicate = match;

    return new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
  };

  const request = (frame = main, method = 'GET', document = false) => ({
    frame: () => frame,
    method: () => method,
    isNavigationRequest: () => document,
    resourceType: () => (document ? 'document' : 'fetch'),
  });
  const response = (req, body, path = '/api/projects/project/ide-panel/secrets') => ({
    request: () => req,
    url: () => `http://localhost${path}`,
    ok: () => true,
    json: body,
  });
  const emit = (res) => {
    if (predicate(res)) {
      resolve(res);
    }
  };

  return { page, main, request, response, emit, fail: (error) => reject(error) };
}

const clean = (page) => {
  assert.equal(page.listenerCount('request'), 0);
  assert.equal(page.listenerCount('framenavigated'), 0);
};
test('rejects old save-refresh GET even when its response arrives after reload commit; reads only new-document GET', async () => {
  const h = setup();

  let staleReads = 0;
  let freshReads = 0;

  h.page.reload = async (options) => {
    assert.deepEqual(options, { waitUntil: 'domcontentloaded' });
    h.page.emit('framenavigated', h.main); // old-document same-frame navigation is not a reload commit

    const stale = h.request();
    h.page.emit('request', stale);
    h.emit(
      h.response(stale, async () => {
        staleReads++;
        throw new Error('No resource with given identifier found');
      }),
    );
    h.page.emit('framenavigated', {}); // iframe navigation must not enable collection

    const iframeEra = h.request();
    h.page.emit('request', iframeEra);
    h.page.emit('request', h.request(h.main, 'GET', true));
    h.page.emit('framenavigated', h.main);
    h.emit(
      h.response(stale, async () => {
        staleReads++;
        throw new Error('old document lost');
      }),
    );
    h.emit(
      h.response(iframeEra, async () => {
        staleReads++;
        return {};
      }),
    );

    for (const req of [h.request({}, 'GET'), h.request(h.main, 'POST')]) {
      h.page.emit('request', req);
      h.emit(
        h.response(req, async () => {
          staleReads++;
          return {};
        }),
      );
    }

    const fresh = h.request();
    h.page.emit('request', fresh);
    h.emit(
      h.response(fresh, async () => {
        freshReads++;
        return { data: { secrets: [{ key: 'DATABASE_URL', updatedAt: 'server-date' }] } };
      }),
    );
    await Promise.resolve();
    assert.equal(freshReads, 1, 'body captured immediately, without waiting for DOMContentLoaded');
  };

  const loaded = await reloadPanelJson(h.page, 'project', 'secrets');
  assert.equal(loaded.ok, true);
  assert.equal(loaded.body.data.secrets[0].updatedAt, 'server-date');
  assert.equal(staleReads, 0);
  clean(h.page);
});

for (const failure of ['reload', 'response', 'body']) {
  test(`preserves ${failure} failure and removes listeners, without retry or substitute GET`, async () => {
    const h = setup();
    const error = new Error(failure);

    h.page.reload = async () => {
      if (failure === 'reload') {
        throw error;
      }

      if (failure === 'response') {
        h.fail(error);
        return;
      }

      h.page.emit('request', h.request(h.main, 'GET', true));
      h.page.emit('framenavigated', h.main);

      const fresh = h.request();
      h.page.emit('request', fresh);
      h.emit(
        h.response(fresh, async () => {
          throw error;
        }),
      );
    };
    await assert.rejects(reloadPanelJson(h.page, 'project', 'secrets'), (actual) => actual === error);
    clean(h.page);
  });
}
test('both Secrets reloads use the guarded helper and keep real server metadata and value assertions', () => {
  const dashboard = readFileSync(new URL('../../tests/e2e/dashboard.spec.ts', import.meta.url), 'utf8');
  assert.equal(dashboard.split("reloadPanelJson(page, projectId, 'secrets')").length - 1, 2);
  assert.ok(dashboard.includes('reloadedSecrets.body.data.secrets.find'));
  assert.ok(dashboard.includes('updatedSecrets.body.data.secrets.some'));
  assert.ok(!dashboard.includes('reloadedSecrets.json()'));
  assert.ok(!dashboard.includes('updatedSecrets.json()'));
  assert.ok(!source.includes('page.request'));

  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.ok(workflow.includes('node --test scripts/ci/reload-panel-json.checks.mjs'));
});
test('the previous unscoped response wait can select a save refresh whose body reload invalidates', async () => {
  const h = setup();
  const lostBody = new Error('Network.getResponseBody: No resource with given identifier found');

  let invalidated = false;

  h.page.reload = async () => {
    const stale = h.request();
    h.page.emit('request', stale);
    h.emit(
      h.response(stale, async () => {
        if (invalidated) {
          throw lostBody;
        }

        return { oldDocument: true };
      }),
    );
    invalidated = true;
  };

  const [response] = await Promise.all([
    h.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === '/api/projects/project/ide-panel/secrets' && res.request().method() === 'GET',
    ),
    h.page.reload(),
  ]);
  await assert.rejects(response.json(), (error) => error === lostBody);
});
test('ignores frameless events and invalidates eligible requests when a newer document starts', async () => {
  const h = setup();

  let staleReads = 0;

  h.page.reload = async () => {
    h.page.emit('request', {
      frame() {
        throw new Error('no frame');
      },
    });
    h.page.emit('request', h.request(h.main, 'GET', true));
    h.page.emit('framenavigated', h.main);

    const formerlyEligible = h.request();
    h.page.emit('request', formerlyEligible);
    h.page.emit('request', h.request(h.main, 'GET', true));

    const stale = h.response(formerlyEligible, async () => {
      staleReads++;
      return { wrong: true };
    });
    h.emit(stale);
    h.page.emit('framenavigated', h.main);
    h.emit(stale);

    const fresh = h.request();
    h.page.emit('request', fresh);
    h.emit(h.response(fresh, async () => ({ currentDocument: true })));
  };

  const result = await reloadPanelJson(h.page, 'project', 'secrets');
  assert.deepEqual(result.body, { currentDocument: true });
  assert.equal(staleReads, 0);
  clean(h.page);
});
