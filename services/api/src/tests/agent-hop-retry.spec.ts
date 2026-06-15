import { describe, expect, it } from 'vitest';

import { shouldRetryAgentHop } from '../app.js';

/**
 * The api->agent hop flapped 200<->502 (WORKSPACE_AGENT_REQUEST_FAILED) on
 * transient blips (Service-endpoint lag, connection resets). agentRequest now
 * retries via this policy. These assert the transient cases are absorbed while
 * unsafe/exhausted cases are not.
 */
describe('shouldRetryAgentHop', () => {
  const max = 3;

  it('retries a connection-level failure for ANY method (request never reached the agent)', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      expect(shouldRetryAgentHop({ kind: 'connection', method, attempt: 1, maxAttempts: max })).toBe(true);
    }
  });

  it('retries agent 502/503/504 only for idempotent reads', () => {
    for (const status of [502, 503, 504]) {
      expect(shouldRetryAgentHop({ kind: 'http', status, method: 'GET', attempt: 1, maxAttempts: max })).toBe(true);
      expect(shouldRetryAgentHop({ kind: 'http', status, method: 'POST', attempt: 1, maxAttempts: max })).toBe(false);
      expect(shouldRetryAgentHop({ kind: 'http', status, method: 'PUT', attempt: 1, maxAttempts: max })).toBe(false);
    }
  });

  it('does not retry non-transient agent statuses', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      expect(shouldRetryAgentHop({ kind: 'http', status, method: 'GET', attempt: 1, maxAttempts: max })).toBe(false);
    }
  });

  it('never retries once the attempt budget is exhausted', () => {
    expect(shouldRetryAgentHop({ kind: 'connection', method: 'GET', attempt: max, maxAttempts: max })).toBe(false);
    expect(shouldRetryAgentHop({ kind: 'http', status: 503, method: 'GET', attempt: max, maxAttempts: max })).toBe(
      false,
    );
  });
});
