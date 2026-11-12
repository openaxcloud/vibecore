import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Fixed vocabulary only. Never retain response bodies, headers, IDs or error messages.
export function fieldType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

export function recordStatus(statuses, status) {
  if (statuses.length < 64) {
    statuses.push(Number.isInteger(status) && status >= 100 && status <= 599 ? status : null);
  }
}

export function capabilityShape(cap) {
  return {
    bodyType: fieldType(cap),
    versionType: fieldType(cap?.version),
    maxBudgetMsType: fieldType(cap?.maxBudgetMs),
    validatedSpecsType: fieldType(cap?.validatedSpecs),
    versionMatches: cap?.version === 1,
    maxBudgetMsMatches: cap?.maxBudgetMs === 300000,
    validatedSpecsMatches: cap?.validatedSpecs === 1,
  };
}

export async function checkAgentCapability(
  agent,
  headers,
  diagnostics,
  { request = fetch, sleep = delay, now = () => performance.now() } = {},
) {
  const capabilityDeadline = now() + 180000;
  diagnostics.stage = 'authenticated-fetch';
  diagnostics.statuses = [];

  let cap;

  do {
    diagnostics.stage = 'authenticated-fetch';

    const response = await request(`${agent}/packages/v1/capabilities`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    recordStatus(diagnostics.statuses, response.status);

    if (response.ok) {
      diagnostics.stage = 'authenticated-json';
      cap = await response.json();
      diagnostics.shape = capabilityShape(cap);
      break;
    }

    diagnostics.stage = 'authenticated-status';
    await response.body?.cancel();
    assert([502, 503].includes(response.status), `Capability refused HTTP ${response.status}`);
    await sleep(5000);
  } while (now() < capabilityDeadline);
  diagnostics.stage = 'readiness-deadline';
  assert(cap, 'Actual agent readiness deadline');
  diagnostics.stage = 'capability-contract';
  assert.deepEqual([cap.version, cap.maxBudgetMs, cap.validatedSpecs], [1, 300000, 1]);

  for (const authorization of [undefined, 'Bearer invalid']) {
    diagnostics.stage = authorization ? 'invalid-token-refusal' : 'missing-token-refusal';

    const response = await request(`${agent}/packages/v1/capabilities`, {
      headers: authorization ? { authorization } : {},
      signal: AbortSignal.timeout(10000),
    });
    recordStatus(diagnostics.statuses, response.status);
    assert([401, 403].includes(response.status));
    await response.body?.cancel();
  }
  diagnostics.stage = 'complete';

  return cap;
}

export async function waitForWorkspaceRunning(
  manager,
  workspaceId,
  headers,
  diagnostics,
  { request = fetch, sleep = delay, now = () => performance.now() } = {},
) {
  const deadline = now() + 180000;
  diagnostics.statuses = [];
  diagnostics.states = [];

  do {
    const remaining = Math.floor(deadline - now());

    if (remaining <= 0) {
      break;
    }

    diagnostics.stage = 'manager-fetch';

    const response = await request(`${manager}/workspaces/${workspaceId}`, {
      headers,
      signal: AbortSignal.timeout(Math.min(20000, remaining)),
    });
    recordStatus(diagnostics.statuses, response.status);
    diagnostics.stage = 'manager-status';

    if (!response.ok) {
      await response.body?.cancel();
    }

    assert(response.ok, 'Manager readiness request refused');
    diagnostics.stage = 'manager-json';

    const workspace = await response.json();

    if (now() >= deadline) {
      break;
    }

    const state = ['STARTING', 'RUNNING', 'STOPPED', 'FAILED', 'DELETED'].includes(workspace?.status)
      ? workspace.status
      : 'unknown';

    if (diagnostics.states.length < 64) {
      diagnostics.states.push(state);
    }

    diagnostics.stage = 'manager-identity';
    diagnostics.identityMatches = workspace?.id === workspaceId;
    assert(diagnostics.identityMatches, 'Manager workspace identity mismatch');
    diagnostics.stage = 'manager-state';
    assert(['STARTING', 'RUNNING'].includes(state), 'Workspace is not starting or running');

    if (state === 'RUNNING') {
      diagnostics.stage = 'manager-scheme';
      diagnostics.derivedScheme = workspace.agentTokenScheme === 'derived-v1';
      assert(diagnostics.derivedScheme, 'Fresh workspace must use derived token scheme');
      diagnostics.stage = 'complete';

      return;
    }

    const sleepBudget = deadline - now();

    if (sleepBudget > 0) {
      await sleep(Math.min(5000, sleepBudget));
    }
  } while (now() < deadline);
  diagnostics.stage = 'manager-deadline';
  assert.fail('Manager readiness deadline');
}
