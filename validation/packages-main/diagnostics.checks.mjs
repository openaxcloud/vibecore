import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { capabilityShape, checkAgentCapability, recordStatus, waitForWorkspaceRunning } from './diagnostics.mjs';
import { createTransportEvidence, observeRequest } from './router.mjs';

const valid = { version: 1, maxBudgetMs: 300000, validatedSpecs: 1 };

function scenario(replies, { elapsed = 0 } = {}) {
  const calls = [];
  const diagnostics = {};

  let cancellations = 0;

  const sleeps = [];

  let time = 0;

  const dependencies = {
    now: () => {
      const previous = time;
      time += elapsed;

      return previous;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    request: async (url, options) => {
      calls.push({ url, options });

      const reply = replies.shift();
      assert(reply, 'Unexpected additional request');

      if (reply.error) {
        throw reply.error;
      }

      return {
        status: reply.status,
        ok: reply.status >= 200 && reply.status <= 299,
        body: {
          cancel: async () => {
            cancellations++;
          },
        },
        json: async () => {
          if (reply.jsonError) {
            throw reply.jsonError;
          }

          return reply.body;
        },
      };
    },
  };

  return {
    calls,
    diagnostics,
    sleeps,
    cancellations: () => cancellations,
    run: () =>
      checkAgentCapability(
        'http://local/workspace-secret',
        {
          authorization: 'Bearer private-token',
          'content-type': 'application/json',
        },
        diagnostics,
        dependencies,
      ),
  };
}

test('success preserves exact URL, headers, read-only requests, contract and refusal probes', async () => {
  const s = scenario([
    { status: 503 },
    { status: 502 },
    { status: 200, body: valid },
    { status: 401 },
    { status: 403 },
  ]);
  assert.deepEqual(await s.run(), valid);
  assert.deepEqual(s.diagnostics.statuses, [503, 502, 200, 401, 403]);
  assert.equal(s.diagnostics.stage, 'complete');
  assert.deepEqual(s.sleeps, [5000, 5000]);
  assert.equal(s.cancellations(), 4);

  for (const call of s.calls) {
    assert.equal(call.url, 'http://local/workspace-secret/packages/v1/capabilities');
    assert.equal(call.options.method, undefined);
    assert(call.options.signal instanceof AbortSignal);
  }
  assert.deepEqual(s.calls[0].options.headers, {
    authorization: 'Bearer private-token',
    'content-type': 'application/json',
  });
  assert.deepEqual(s.calls[3].options.headers, {});
  assert.deepEqual(s.calls[4].options.headers, {
    authorization: 'Bearer invalid',
  });
});

for (const status of [400, 401, 403, 404, 429, 500]) {
  test(`authenticated HTTP ${status} fails without retry or install`, async () => {
    const s = scenario([{ status }]);
    await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
    assert.equal(s.diagnostics.stage, 'authenticated-status');
    assert.deepEqual(s.diagnostics.statuses, [status]);
    assert.equal(s.calls.length, 1);
    assert.equal(s.sleeps.length, 0);
  });
}

for (const field of Object.keys(valid)) {
  for (const value of [undefined, null, 'private-secret', 0, 2, {}, []]) {
    test(`contract rejects ${field} type ${value === null ? 'null' : typeof value}`, async () => {
      const s = scenario([
        {
          status: 200,
          body: { ...valid, [field]: value, token: 'private-token' },
        },
      ]);
      await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
      assert.equal(s.diagnostics.stage, 'capability-contract');
      assert.equal(s.calls.length, 1);
      assert.doesNotMatch(JSON.stringify(s.diagnostics), /private-secret|private-token|workspace-secret/);
    });
  }
}

for (const stage of ['missing-token-refusal', 'invalid-token-refusal']) {
  test(`${stage} remains failing on unexpected success`, async () => {
    const replies = [{ status: 200, body: valid }];

    if (stage === 'invalid-token-refusal') {
      replies.push({ status: 401 });
    }

    replies.push({ status: 200 });

    const s = scenario(replies);
    await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
    assert.equal(s.diagnostics.stage, stage);
  });
}

test('readiness timeout remains a failure', async () => {
  const s = scenario([{ status: 503 }], { elapsed: 180001 });
  await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
  assert.equal(s.diagnostics.stage, 'readiness-deadline');
  assert.equal(s.calls.length, 1);
});

test('network and JSON failures have fixed stages and do not retain exception text', async () => {
  for (const [reply, stage] of [
    [{ error: new Error('private-token') }, 'authenticated-fetch'],
    [{ status: 200, jsonError: new Error('private-token') }, 'authenticated-json'],
  ]) {
    const s = scenario([reply]);
    await assert.rejects(s.run());
    assert.equal(s.diagnostics.stage, stage);
    assert.doesNotMatch(JSON.stringify(s.diagnostics), /private-token/);
  }
});

test('shape contains only fixed types and booleans, no arbitrary keys or values', () => {
  assert.deepEqual(capabilityShape({ ...valid, email: 'private-identity' }), {
    bodyType: 'object',
    versionType: 'number',
    maxBudgetMsType: 'number',
    validatedSpecsType: 'number',
    versionMatches: true,
    maxBudgetMsMatches: true,
    validatedSpecsMatches: true,
  });
  assert.equal(capabilityShape(null).bodyType, 'null');
  assert.equal(capabilityShape([]).bodyType, 'array');
  assert.doesNotMatch(JSON.stringify(capabilityShape({ version: 'private-secret' })), /private-secret/);
});

test('status evidence is strictly bounded and excludes arbitrary values', () => {
  const statuses = [];

  for (const value of ['private-secret', 99, 600, null, 200.5]) {
    recordStatus(statuses, value);
  }
  assert.deepEqual(statuses, [null, null, null, null, null]);

  for (let i = 0; i < 1000; i++) {
    recordStatus(statuses, 200);
  }
  assert.equal(statuses.length, 64);
});

test('transport observes actual POST /commands/run and never mutates requests', () => {
  const evidence = createTransportEvidence();

  let saves = 0;

  for (const [method, path] of [
    ['POST', '/commands/run'],
    ['POST', '/commands'],
    ['GET', '/commands/run'],
    ['POST', '/packages/v1/install'],
    ['GET', '/packages/v1/capabilities'],
  ]) {
    const request = Object.freeze({
      method,
      url: `/workspace-secret${path}`,
      headers: Object.freeze({ authorization: 'private-token' }),
    });

    const response = new EventEmitter();
    response.statusCode = 200;
    observeRequest(request, response, evidence, () => {
      saves++;
    });
    response.emit('finish');
    assert.equal(evidence.genericCommands, 1, 'Only the first POST /commands/run is a generic command');
  }
  assert.deepEqual(evidence, {
    capabilityRequests: 1,
    capabilityStatuses: [200],
    installRequests: 1,
    installStatuses: [200],
    genericCommands: 1,
  });
  assert.equal(saves, 7);
  assert.doesNotMatch(JSON.stringify(evidence), /workspace-secret|private-token/);
});

for (const body of [null, false, 0, '', [], {}]) {
  test(`non-contract response remains failing (${JSON.stringify(body)})`, async () => {
    const s = scenario([{ status: 200, body }]);
    await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
    assert(s.diagnostics.shape);
    assert.equal(s.calls.length, 1);
  });
}

function readinessScenario(replies, elapsed = 0) {
  const calls = [];
  const diagnostics = {};

  let time = 0;
  let sleeps = 0;

  return {
    calls,
    diagnostics,
    sleeps: () => sleeps,
    run: () =>
      waitForWorkspaceRunning(
        'http://manager',
        'local-workspace',
        { authorization: 'Bearer local-fixture' },
        diagnostics,
        {
          now: () => {
            const previous = time;
            time += elapsed;

            return previous;
          },
          sleep: async (ms) => {
            assert.equal(ms, 5000);
            sleeps++;
          },
          request: async (url, options) => {
            calls.push({ url, options });

            const reply = replies.shift();
            assert(reply, 'Unexpected additional readiness request');

            return { status: reply.status ?? 200, ok: (reply.status ?? 200) === 200, json: async () => reply.body };
          },
        },
      ),
  };
}

test('manager RUNNING and derived scheme must precede the single token mint', async () => {
  const s = readinessScenario([
    { body: { id: 'local-workspace', status: 'STARTING' } },
    { body: { id: 'local-workspace', status: 'STARTING', agentTokenScheme: 'derived-v1' } },
    { body: { id: 'local-workspace', status: 'RUNNING', agentTokenScheme: 'derived-v1' } },
  ]);

  let minted = 0;
  await s.run();
  minted++;
  assert.equal(minted, 1);
  assert.equal(s.calls.length, 3);
  assert.equal(s.sleeps(), 2);
  assert.deepEqual(s.diagnostics.states, ['STARTING', 'STARTING', 'RUNNING']);
  assert.equal(s.diagnostics.stage, 'complete');
  assert.equal(s.diagnostics.derivedScheme, true);

  for (const call of s.calls) {
    assert.equal(call.url, 'http://manager/workspaces/local-workspace');
    assert.equal(call.options.method, undefined);
    assert.deepEqual(call.options.headers, { authorization: 'Bearer local-fixture' });
  }
  assert.doesNotMatch(JSON.stringify(s.diagnostics), /local-workspace|local-fixture/);
});

for (const status of [401, 403, 404, 429, 500]) {
  test(`manager readiness HTTP ${status} fails closed without minting or retry`, async () => {
    const s = readinessScenario([{ status }]);
    await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
    assert.equal(s.diagnostics.stage, 'manager-status');
    assert.equal(s.calls.length, 1);
    assert.equal(s.sleeps(), 0);
  });
}

for (const body of [
  { id: 'other-private-identity', status: 'RUNNING', agentTokenScheme: 'derived-v1' },
  { id: 'local-workspace', status: 'RUNNING' },
  { id: 'local-workspace', status: 'RUNNING', agentTokenScheme: 'legacy' },
  { id: 'local-workspace', status: 'RUNNING', agentTokenScheme: 'private-value' },
  ...['FAILED', 'STOPPED', 'DELETED', 'private-value'].map((status) => ({ id: 'local-workspace', status })),
  null,
]) {
  test('manager refuses incorrect identity, legacy/new scheme ambiguity or terminal/unknown state', async () => {
    const s = readinessScenario([{ body }]);
    await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
    assert.equal(s.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(s.diagnostics), /other-private-identity|private-value/);
  });
}

test('manager STARTING deadline fails before token issuance', async () => {
  const s = readinessScenario([{ body: { id: 'local-workspace', status: 'STARTING' } }], 180001);
  await assert.rejects(s.run(), { code: 'ERR_ASSERTION' });
  assert.equal(s.diagnostics.stage, 'manager-deadline');
});

test('manager late RUNNING response cannot pass the total deadline', async () => {
  let time = 0;

  const diagnostics = {};
  await assert.rejects(
    waitForWorkspaceRunning('http://manager', 'local-workspace', {}, diagnostics, {
      now: () => time,
      sleep: async () => assert.fail('No sleep after late response'),
      request: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          time = 180001;
          return { id: 'local-workspace', status: 'RUNNING', agentTokenScheme: 'derived-v1' };
        },
      }),
    }),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(diagnostics.stage, 'manager-deadline');
});

test('manager final sleep uses only remaining deadline budget', async () => {
  let time = 0;
  let calls = 0;

  const sleeps = [];
  const diagnostics = {};
  await assert.rejects(
    waitForWorkspaceRunning('http://manager', 'local-workspace', {}, diagnostics, {
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      request: async () => {
        calls++;
        return {
          ok: true,
          status: 200,
          json: async () => {
            time = 179999;
            return { id: 'local-workspace', status: 'STARTING' };
          },
        };
      },
    }),
    { code: 'ERR_ASSERTION' },
  );
  assert.deepEqual(sleeps, [1]);
  assert.equal(calls, 1);
  assert.equal(diagnostics.stage, 'manager-deadline');
});

test('manager refusal cancels response body before rejecting', async () => {
  let cancelled = false;
  await assert.rejects(
    waitForWorkspaceRunning(
      'http://manager',
      'local-workspace',
      {},
      {},
      {
        request: async () => ({
          ok: false,
          status: 401,
          body: {
            cancel: async () => {
              cancelled = true;
            },
          },
        }),
      },
    ),
    { code: 'ERR_ASSERTION' },
  );
  assert.equal(cancelled, true);
});

test('manager fractional remaining milliseconds yield a valid integer AbortSignal timeout', async () => {
  const times = [0.5, 179999.2, 180000.1];
  const diagnostics = {};
  await waitForWorkspaceRunning('http://manager', 'local-workspace', {}, diagnostics, {
    now: () => times.shift(),
    request: async (_url, options) => {
      assert(options.signal instanceof AbortSignal);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'local-workspace', status: 'RUNNING', agentTokenScheme: 'derived-v1' }),
      };
    },
  });
  assert.equal(diagnostics.stage, 'complete');
});
