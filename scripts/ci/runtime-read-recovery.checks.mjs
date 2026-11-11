import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createRuntimeAgentRouter } from './runtime-agent-router.mjs';

const require = createRequire(import.meta.url);
const ts = require(process.env.TYPESCRIPT_PATH ?? 'typescript');
const source = readFileSync(new URL('../../services/api/src/runtime-read-recovery.ts', import.meta.url), 'utf8');

const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const exports = {};
new Function('exports', compiled)(exports);

const { recoverStartingWorkspaceRead, withRuntimeReadCancellation } = exports;

/*
 * Actual HTTP requests to a local disposable server. No cloud, credentials,
 * product manager or live workspace is simulated as acceptance evidence.
 */
async function fixture(run, { next = 'RUNNING', status = 200, lag = 300, healthLag = 0 } = {}) {
  let observations = 0;
  let reads = 0;
  let health = 0;
  let started;

  const server = createServer((request, response) => {
    if (request.url === '/state') {
      /*
       * Start the transition at first observation, not before TypeScript compilation.
       * This preserves STARTING as the fixture precondition without enlarging budgets.
       */
      started ??= Date.now();
      observations += 1;
      response.end(
        JSON.stringify(Date.now() - started < lag ? { status: 'STARTING' } : next ? { status: next } : null),
      );
    } else if (request.url === '/health') {
      health += 1;
      response.statusCode = Date.now() - started < lag + healthLag ? 503 : 200;
      response.end();
    } else {
      reads += 1;
      response.statusCode = status;
      response.end('fixture-data');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const base = `http://127.0.0.1:${server.address().port}`;

  const options = {
    method: 'GET',
    deadline: Date.now() + 1500,
    observe: async (signal) => (await fetch(`${base}/state`, { signal })).json(),
    healthy: async (signal) => (await fetch(`${base}/health`, { signal })).ok,
    read: async (signal) => {
      const result = await fetch(`${base}/file`, { signal });

      if (!result.ok) {
        throw Object.assign(new Error('file read failed'), { statusCode: result.status });
      }

      return result.text();
    },
  };

  try {
    await run(options, () => ({ observations, reads, health }), base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('slow confirmed STARTING waits for RUNNING and healthy before exactly one real read', async () => {
  await fixture(async (options, counts) => {
    assert.deepEqual(await recoverStartingWorkspaceRead(options), { recovered: true, value: 'fixture-data' });
    assert.ok(counts().observations >= 2);
    assert.equal(counts().reads, 1);
    assert.ok(counts().health >= 1);
  });
});

test('RUNNING without healthy endpoint is not accepted as ready', async () => {
  await fixture(
    async (options, counts) => {
      assert.equal((await recoverStartingWorkspaceRead(options)).recovered, true);
      assert.ok(counts().health >= 2);
      assert.equal(counts().reads, 1);
    },
    { lag: 100, healthLag: 500 },
  );
});

for (const next of ['FAILED', 'STOPPED', 'DELETED', undefined]) {
  test(`known start ending ${next ?? 'absent'} fails with no file read`, async () => {
    await fixture(
      async (options, counts) => {
        await assert.rejects(recoverStartingWorkspaceRead(options), { code: 'WORKSPACE_READ_RECOVERY_STOPPED' });
        assert.equal(counts().reads, 0);
      },
      { next: next ?? null, lag: 100 },
    );
  });
}

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`${method} never observes, waits or replays`, async () => {
    await fixture(async (options, counts) => {
      assert.deepEqual(await recoverStartingWorkspaceRead({ ...options, method }), { recovered: false });
      assert.deepEqual(counts(), { observations: 0, reads: 0, health: 0 });
    });
  });
}

test('HEAD follows the same bounded read-only policy', async () => {
  await fixture(
    async (options) => {
      assert.equal((await recoverStartingWorkspaceRead({ ...options, method: 'HEAD' })).recovered, true);
    },
    { lag: 100 },
  );
});

test('initial RUNNING does not authorize recovery of an unrelated transport failure', async () => {
  await fixture(
    async (options, counts) => {
      assert.deepEqual(await recoverStartingWorkspaceRead(options), { recovered: false });
      assert.equal(counts().reads, 0);
      assert.equal(counts().health, 0);
    },
    { lag: 0 },
  );
});

test('real file404 after readiness remains404 and is never read twice', async () => {
  await fixture(
    async (options, counts) => {
      await assert.rejects(recoverStartingWorkspaceRead(options), { statusCode: 404 });
      assert.equal(counts().reads, 1);
    },
    { status: 404, lag: 100 },
  );
});

test('deadline expires without read and aborts outstanding work', async () => {
  await fixture(
    async (options, counts) => {
      await assert.rejects(recoverStartingWorkspaceRead({ ...options, deadline: Date.now() + 40 }), {
        code: 'WORKSPACE_READ_RECOVERY_DEADLINE',
      });
      assert.equal(counts().reads, 0);
    },
    { lag: 1000 },
  );
});

test('caller cancellation while waiting aborts and never performs a file read', async () => {
  await fixture(async (options, counts) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30);

    try {
      await assert.rejects(recoverStartingWorkspaceRead({ ...options, signal: controller.signal }), {
        code: 'STREAM_ABORTED',
        statusCode: 499,
      });
      assert.equal(counts().reads, 0);
    } finally {
      clearTimeout(timer);
    }
  });
});

test('hung observation that ignores abort still cannot exceed the deadline or later read', async () => {
  let complete;
  let reads = 0;

  const run = recoverStartingWorkspaceRead({
    method: 'GET',
    deadline: Date.now() + 20,
    observe: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    healthy: async () => true,
    read: async () => {
      reads += 1;
    },
  });
  await assert.rejects(run, { code: 'WORKSPACE_READ_RECOVERY_DEADLINE' });
  complete({ status: 'STARTING' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(reads, 0);
});

test('reply disconnect cancels read and event observers are removed', async () => {
  const request = Object.assign(new EventEmitter(), { aborted: false });
  const reply = Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
  await withRuntimeReadCancellation(request, reply, async (signal) => {
    assert.equal(signal.aborted, false);
    reply.emit('close');
    assert.equal(signal.aborted, true);
  });
  assert.equal(request.listenerCount('aborted'), 0);
  assert.equal(reply.listenerCount('close'), 0);
});

test('actual API recovers transport failures only, including explicitly identified CI relay failures', () => {
  const api = readFileSync(new URL('../../services/api/src/app.ts', import.meta.url), 'utf8');
  const start = api.indexOf('  const agentRequest = async');
  const end = api.indexOf('   * Cold-start guard', start);
  const body = api.slice(start, end);
  assert.match(body, /allowReadRecovery && \['GET', 'HEAD'\]\.includes\(method\)/);
  assert.ok(body.indexOf('const recovery = await recoverRead();') > body.indexOf("kind: 'connection'"));
  assert.ok(body.indexOf('recoverStartingWorkspaceRead<T>') < body.indexOf('if (!response.ok)'));
  assert.match(body, /contexteRequete, 1, remainingMs, false/);
  assert.match(body, /statusCode: response.status/);
  assert.equal(api.split('withRuntimeReadCancellation(request.raw, reply.raw').length - 1, 2);
});

function actualTimeoutWrapper(api) {
  const start = api.indexOf('  const withRequestTimeout =');
  const end = api.indexOf('  const managerRequest =', start);

  const compiled = ts.transpileModule(api.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

  return new Function('RUNTIME_PROXY_TIMEOUT_MS', compiled + '\nreturn withRequestTimeout;')(1500);
}

function actualAgentRequest(base, options, { disconnects = 3, overrides = {} } = {}) {
  const api = readFileSync(new URL('../../services/api/src/app.ts', import.meta.url), 'utf8');
  const start = api.indexOf('  const agentRequest = async');
  const end = api.indexOf('\n  /*\n   * Cold-start guard', start);

  const compiledAgent = ts.transpileModule(api.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

  let starts = 0;
  let failedHops = 0;

  const dependencies = {
    RUNTIME_PROXY_TIMEOUT_MS: 1500,
    AGENT_REQUEST_ATTEMPTS: 3,
    appPublicEnglish: (code) => code,
    agentBaseUrl: () => base,
    managerRequest: async (path, init = {}) =>
      path.endsWith('/agent-token') ? { token: 'local-contract' } : options.observe(init.signal),
    withRequestTimeout: actualTimeoutWrapper(api),
    agentSleep: async () => {},
    agentRetryDelay: () => 0,
    shouldRetryAgentHop: ({ kind, attempt, maxAttempts }) => kind === 'connection' && attempt < maxAttempts,
    isWorkspaceDnsNotResolvedYet: () => false,
    declencherDemarrageDepuisLecture: () => {
      starts += 1;
    },
    readJsonBody: (response) => response.text(),
    recoverStartingWorkspaceRead,
    isEphemeralRelayTransportFailure: exports.isEphemeralRelayTransportFailure,
    fetch: async (url, init) => {
      if (url.endsWith('/file') && failedHops < disconnects) {
        failedHops += 1;
        throw new TypeError('controlled connection reset before agent response');
      }

      return fetch(url, init);
    },
  };
  Object.assign(dependencies, overrides);

  const agent = new Function(...Object.keys(dependencies), `${compiledAgent}\nreturn agentRequest;`)(
    ...Object.values(dependencies),
  );

  return { agent, starts: () => starts };
}

test('actual API transport catch waits for the local manager and health then reads once without provisioning', async () => {
  await fixture(
    async (options, counts, base) => {
      const { agent, starts } = actualAgentRequest(base, options);
      assert.equal(await agent('fixture', '/file'), 'fixture-data');
      assert.equal(counts().reads, 1);
      assert.equal(starts(), 0);
    },
    { lag: 100 },
  );
});

test('actual API genuine404 never enters recovery or requests provisioning', async () => {
  await fixture(
    async (options, counts, base) => {
      const { agent, starts } = actualAgentRequest(base, options, { disconnects: 0 });
      await assert.rejects(agent('fixture', '/file'), { statusCode: 404, code: 'WORKSPACE_AGENT_CLIENT_ERROR' });
      assert.deepEqual(counts(), { observations: 0, reads: 1, health: 0 });
      assert.equal(starts(), 0);
    },
    { status: 404 },
  );
});

test('actual API recovery preserves a real404 on its single replay', async () => {
  await fixture(
    async (options, counts, base) => {
      const { agent, starts } = actualAgentRequest(base, options);
      await assert.rejects(agent('fixture', '/file'), { statusCode: 404, code: 'WORKSPACE_AGENT_CLIENT_ERROR' });
      assert.equal(counts().reads, 1);
      assert.equal(starts(), 0);
    },
    { status: 404, lag: 100 },
  );
});

test('actual API failed write does not enter read recovery or replay through it', async () => {
  await fixture(async (options, counts, base) => {
    const { agent, starts } = actualAgentRequest(base, options);
    await assert.rejects(agent('fixture', '/file', { method: 'POST' }, undefined, 1), {
      statusCode: 502,
      code: 'WORKSPACE_AGENT_REQUEST_FAILED',
    });
    assert.deepEqual(counts(), { observations: 0, reads: 0, health: 0 });
    assert.equal(starts(), 0);
  });
});

for (const stage of ['healthy', 'read']) {
  test(`deadline bounds a hung ${stage} operation and aborts its signal`, async () => {
    let observed = 0;
    let operationSignal;

    const run = recoverStartingWorkspaceRead({
      method: 'GET',
      deadline: Date.now() + 350,
      observe: async () => ({ status: observed++ === 0 ? 'STARTING' : 'RUNNING' }),
      healthy: async (signal) => {
        if (stage === 'healthy') {
          operationSignal = signal;
          return new Promise(() => {});
        }

        return true;
      },
      read: async (signal) => {
        operationSignal = signal;
        return new Promise(() => {});
      },
    });
    await assert.rejects(run, { code: 'WORKSPACE_READ_RECOVERY_DEADLINE' });
    assert.equal(operationSignal.aborted, true);
  });
}

test('already aborted caller never contacts manager or agent', async () => {
  await fixture(async (options, counts) => {
    await assert.rejects(recoverStartingWorkspaceRead({ ...options, signal: AbortSignal.abort() }), {
      code: 'STREAM_ABORTED',
    });
    assert.deepEqual(counts(), { observations: 0, reads: 0, health: 0 });
  });
});

test('initial manager observation failure declines recovery, never permission to read', async () => {
  await fixture(async (options, counts) => {
    assert.deepEqual(
      await recoverStartingWorkspaceRead({
        ...options,
        observe: async () => {
          throw new Error('manager unavailable');
        },
      }),
      { recovered: false },
    );
    assert.equal(counts().reads, 0);
  });
});

test('ADVERSARIAL: initial manager404 must preserve existing cold-start trigger', async () => {
  await fixture(async (options, counts, base) => {
    const { agent, starts } = actualAgentRequest(base, options, {
      overrides: {
        managerRequest: async (path) => {
          if (path.endsWith('/agent-token')) {
            return { token: 'fixture' };
          }

          throw Object.assign(new Error('missing manager workspace'), { managerStatus: 404, statusCode: 502 });
        },
      },
    });
    await assert.rejects(agent('fixture', '/file'));
    assert.equal(starts(), 1, 'ordinary failed read should still trigger the original start fallback');
  });
});

test('ADVERSARIAL: actual timeout wrapper releases parent abort listeners', async () => {
  const api = readFileSync(new URL('../../services/api/src/app.ts', import.meta.url), 'utf8');
  const start = api.indexOf('  const withRequestTimeout =');
  const end = api.indexOf('  const managerRequest =', start);

  const compiled = ts.transpileModule(api.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;

  const wrap = new Function('RUNTIME_PROXY_TIMEOUT_MS', compiled + '\nreturn withRequestTimeout;')(15000);
  const parent = new AbortController();

  for (let n = 0; n < 12; n++) {
    wrap({ signal: parent.signal }).done();
  }
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0);
});

test('manager observation failure AFTER STARTING remains explicit with no read', async () => {
  let observations = 0;
  let reads = 0;
  await assert.rejects(
    recoverStartingWorkspaceRead({
      method: 'GET',
      deadline: Date.now() + 1000,
      observe: async () => {
        if (observations++ === 0) {
          return { status: 'STARTING' };
        }

        throw new Error('manager unavailable after admission');
      },
      healthy: async () => true,
      read: async () => {
        reads++;
      },
    }),
    /manager unavailable after admission/,
  );
  assert.equal(reads, 0);
});

test('actual agentRequest and actual timeout wrapper bound a hung recovery read', async () => {
  await fixture(
    async (options, counts, base) => {
      let fileCalls = 0;
      let hungSignal;

      const { agent, starts } = actualAgentRequest(base, options, {
        overrides: {
          fetch: async (url, init) => {
            if (!url.endsWith('/file')) {
              return fetch(url, init);
            }

            if (++fileCalls <= 3) {
              throw new TypeError('connection reset');
            }

            hungSignal = init.signal;

            return new Promise((resolve, reject) =>
              init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }),
            );
          },
        },
      });

      const begun = Date.now();
      await assert.rejects(agent('fixture', '/file', {}, undefined, 3, 400), (error) =>
        ['WORKSPACE_READ_RECOVERY_DEADLINE', 'WORKSPACE_AGENT_REQUEST_FAILED'].includes(error.code),
      );
      assert.ok(Date.now() - begun < 900);
      assert.equal(hungSignal.aborted, true);
      assert.equal(fileCalls, 4);
      assert.equal(starts(), 0);
    },
    { lag: 100 },
  );
});

test('expired budget declines unadmitted recovery without contacting manager', async () => {
  assert.deepEqual(
    await recoverStartingWorkspaceRead({
      method: 'GET',
      deadline: Date.now() - 1,
      observe: async () => {
        throw new Error('must not contact manager');
      },
      healthy: async () => {
        throw new Error('must not probe');
      },
      read: async () => {
        throw new Error('must not read');
      },
    }),
    { recovered: false },
  );
});

test('actual timeout wrapper still propagates caller abort after headers/done', () => {
  const api = readFileSync(new URL('../../services/api/src/app.ts', import.meta.url), 'utf8');
  const parent = new AbortController();
  const timed = actualTimeoutWrapper(api)({ signal: parent.signal });
  timed.done();
  parent.abort();
  assert.equal(timed.init.signal.aborted, true);
});

async function relayFixture(run, { initialReady = false, fileStatus = 200, spoof = false } = {}) {
  let reads = 0;
  let health = 0;
  let requestMarker;
  let fileAuthorization;
  let healthAuthorization;

  const upstream = createServer((request, response) => {
    requestMarker = request.headers['x-vibecore-ci-transport-error'];

    if (request.url === '/health') {
      healthAuthorization = request.headers.authorization;
      health++;
      response.end('ok');
    } else {
      reads++;
      fileAuthorization = request.headers.authorization;
      response.statusCode = fileStatus;

      if (spoof) {
        response.setHeader('x-vibecore-ci-transport-error', 'upstream-unavailable');
      }

      response.end('real-upstream-body');
    }
  });

  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));

  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));

  const start = async () => {
    await new Promise((resolve) => upstream.listen(port, '127.0.0.1', resolve));
  };

  if (initialReady) {
    await start();
  }

  const relay = createRuntimeAgentRouter({ lookup: async () => ({ hostname: '127.0.0.1', port }) });
  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));

  const origin = `http://127.0.0.1:${relay.address().port}`;

  try {
    await run({
      base: `${origin}/fixture`,
      start,
      ready: () => upstream.listening,
      env: { VIBECORE_CI_EPHEMERAL_RUNTIME: '1', WORKSPACE_AGENT_URL_TEMPLATE: `${origin}/{workspaceId}` },
      counts: () => ({ reads, health, requestMarker, fileAuthorization, healthAuthorization }),
    });
  } finally {
    relay.closeAllConnections();
    await new Promise((resolve) => relay.close(resolve));
    upstream.closeAllConnections();

    if (upstream.listening) {
      await new Promise((resolve) => upstream.close(resolve));
    }
  }
}

const httpRetry = ({ kind, status, method, attempt, maxAttempts }) =>
  attempt < maxAttempts &&
  (kind === 'connection' || (kind === 'http' && ['GET', 'HEAD'].includes(method) && [502, 503, 504].includes(status)));

for (const method of ['GET', 'HEAD']) {
  test(`real relay transport marker enters STARTING recovery then one healthy fresh-token ${method}`, async () => {
    await relayFixture(async ({ base, start, ready, env, counts }) => {
      let observed = 0;
      let minted = 0;

      const observe = async () => {
        observed++;

        if (observed === 1) {
          await start();
          return { status: 'STARTING' };
        }

        return { status: ready() ? 'RUNNING' : 'STARTING' };
      };
      const { agent, starts } = actualAgentRequest(
        base,
        { observe },
        {
          disconnects: 0,
          overrides: {
            process: { env },
            shouldRetryAgentHop: httpRetry,
            managerRequest: async (path) =>
              path.endsWith('/agent-token') ? { token: `local-contract-${++minted}` } : observe(),
          },
        },
      );
      assert.equal(await agent('fixture', '/file', { method }), method === 'HEAD' ? '' : 'real-upstream-body');
      assert.ok(observed >= 2);
      assert.equal(counts().reads, 1);
      assert.equal(counts().health, 1);
      assert.equal(counts().fileAuthorization, 'Bearer local-contract-3');
      assert.equal(counts().healthAuthorization, 'Bearer local-contract-2');
      assert.equal(minted, 3);
      assert.equal(starts(), 0);
    });
  });
}

for (const fileStatus of [401, 403, 404, 502, 503, 504]) {
  test(`real upstream HTTP${fileStatus} with spoofed marker cannot authorize recovery`, async () => {
    await relayFixture(
      async ({ base, env, counts }) => {
        let observed = 0;

        const { agent } = actualAgentRequest(
          base,
          {
            observe: async () => {
              observed++;
              return { status: 'STARTING' };
            },
          },
          {
            disconnects: 0,
            overrides: { process: { env }, shouldRetryAgentHop: httpRetry },
          },
        );
        await assert.rejects(
          agent('fixture', '/file', { headers: { 'x-vibecore-ci-transport-error': 'upstream-unavailable' } }),
          {
            statusCode: fileStatus >= 500 ? 502 : fileStatus,
          },
        );
        assert.equal(observed, 0);
        assert.equal(counts().health, 0);
        assert.equal(counts().reads, fileStatus >= 500 ? 3 : 1);
        assert.equal(counts().requestMarker, undefined);
      },
      { initialReady: true, fileStatus, spoof: true },
    );
  });
}

for (const mode of ['no-ci-opt-in', 'write', 'put', 'patch', 'delete', 'options', 'already-running']) {
  test(`marked relay failure does not recover in mode ${mode}`, async () => {
    await relayFixture(async ({ base, env, counts }) => {
      let observed = 0;

      const { agent } = actualAgentRequest(
        base,
        {
          observe: async () => {
            observed++;
            return { status: 'RUNNING' };
          },
        },
        {
          disconnects: 0,
          overrides: { process: { env: mode === 'no-ci-opt-in' ? {} : env }, shouldRetryAgentHop: httpRetry },
        },
      );
      await assert.rejects(
        agent('fixture', '/file', {
          method: { write: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE', options: 'OPTIONS' }[mode] ?? 'GET',
        }),
        {
          statusCode: 502,
        },
      );
      assert.equal(observed, mode === 'already-running' ? 1 : 0);
      assert.equal(counts().reads, 0);
      assert.equal(counts().health, 0);
    });
  });
}

test('marker guard requires exact configured loopback origin, unredirected URL and opt-in', () => {
  const url = 'http://127.0.0.1:18081/fixture/files/read?path=x';

  const env = {
    VIBECORE_CI_EPHEMERAL_RUNTIME: '1',
    WORKSPACE_AGENT_URL_TEMPLATE: 'http://127.0.0.1:18081/{workspaceId}',
  };
  const response = {
    status: 502,
    url,
    redirected: false,
    headers: new Headers({ 'x-vibecore-ci-transport-error': 'upstream-unavailable' }),
  };
  assert.equal(exports.isEphemeralRelayTransportFailure(response, url, env), true);

  for (const candidate of [
    { ...response, status: 404 },
    { ...response, redirected: true },
    { ...response, headers: new Headers() },
    { ...response, url: `${url}&redirected=1` },
  ]) {
    assert.equal(exports.isEphemeralRelayTransportFailure(candidate, url, env), false);
  }

  for (const template of [
    'https://external.test/{workspaceId}',
    'http://localhost:18081/{workspaceId}',
    'http://127.0.0.1:9999/{workspaceId}',
    'http://user@127.0.0.1:18081/{workspaceId}',
  ]) {
    assert.equal(
      exports.isEphemeralRelayTransportFailure(response, url, { ...env, WORKSPACE_AGENT_URL_TEMPLATE: template }),
      false,
    );
  }
});

for (const mode of ['deadline', 'cancel']) {
  test(`identified relay recovery still enforces ${mode} without a final read`, async () => {
    await relayFixture(async ({ base, env, counts }) => {
      const controller = new AbortController();

      let timer;

      const { agent, starts } = actualAgentRequest(
        base,
        {
          observe: async () => {
            if (mode === 'cancel') {
              timer = setTimeout(() => controller.abort(), 10);
            }

            return { status: 'STARTING' };
          },
        },
        { disconnects: 0, overrides: { process: { env }, shouldRetryAgentHop: httpRetry } },
      );

      try {
        await assert.rejects(agent('fixture', '/file', { signal: controller.signal }, undefined, 3, 120), {
          code: mode === 'cancel' ? 'STREAM_ABORTED' : 'WORKSPACE_READ_RECOVERY_DEADLINE',
        });
        assert.equal(counts().reads, 0);
        assert.equal(counts().health, 0);
        assert.equal(starts(), 0);
      } finally {
        clearTimeout(timer);
      }
    });
  });
}

test('same-URL redirect to a relay transport error cannot authorize recovery', async () => {
  let base;
  let lookups = 0;
  let observed = 0;
  let finalResponse;

  const upstream = createServer((_request, response) => {
    response.writeHead(302, { location: `${base}/file` }).end();
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  const relay = createRuntimeAgentRouter({
    lookup: async () => {
      if (++lookups > 1) {
        throw new Error('Controlled transport loss after redirect');
      }

      return { hostname: '127.0.0.1', port: upstream.address().port };
    },
  });
  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));

  const origin = `http://127.0.0.1:${relay.address().port}`;
  base = `${origin}/fixture`;

  try {
    const { agent, starts } = actualAgentRequest(
      base,
      {
        observe: async () => {
          observed++;
          return { status: 'RUNNING' };
        },
      },
      {
        disconnects: 0,
        overrides: {
          process: {
            env: { VIBECORE_CI_EPHEMERAL_RUNTIME: '1', WORKSPACE_AGENT_URL_TEMPLATE: `${origin}/{workspaceId}` },
          },
          fetch: async (url, init) => {
            finalResponse = await fetch(url, init);
            return finalResponse;
          },
        },
      },
    );
    await assert.rejects(agent('fixture', '/file', {}, undefined, 1), { statusCode: 502 });
    assert.equal(finalResponse.url, `${base}/file`);
    assert.equal(finalResponse.redirected, true);
    assert.equal(finalResponse.headers.get('x-vibecore-ci-transport-error'), 'upstream-unavailable');
    assert.equal(observed, 0);
    assert.equal(starts(), 0);
  } finally {
    relay.closeAllConnections();
    await new Promise((resolve) => relay.close(resolve));
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('cancellation after marked relay response preserves STREAM_ABORTED before admission', async () => {
  await relayFixture(async ({ base, env, counts }) => {
    const controller = new AbortController();

    let observed = 0;

    const { agent } = actualAgentRequest(
      base,
      {
        observe: async () => {
          observed++;
          return { status: 'STARTING' };
        },
      },
      {
        disconnects: 0,
        overrides: {
          process: { env },
          fetch: async (url, init) => {
            const response = await fetch(url, init);
            controller.abort();
            await new Promise((resolve) => setImmediate(resolve));

            return response;
          },
        },
      },
    );
    await assert.rejects(agent('fixture', '/file', { signal: controller.signal }, undefined, 1), {
      code: 'STREAM_ABORTED',
    });
    assert.equal(observed, 0);
    assert.equal(counts().health, 0);
    assert.equal(counts().reads, 0);
  });
});
