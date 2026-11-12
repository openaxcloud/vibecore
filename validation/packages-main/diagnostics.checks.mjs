import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { capabilityShape, checkAgentCapability, recordStatus } from './diagnostics.mjs';
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
