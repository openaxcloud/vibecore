import { describe, expect, it } from 'vitest';
import { shouldRetryAgentHop } from '../app.js';

/*
 * Prod incident 2026-07-31: the per-request error-budget alert fired
 * (5xx ratio 1.7% → 2.5%). Root cause measured in the API logs: the api→agent
 * hop mapped EVERY non-ok agent response to 502, so agent 404 (missing file,
 * e.g. npm-shrinkwrap.json) and 400 (bad request) were counted as SERVER
 * errors — 119 of 135 5xx in one hour. Two consequences: a polluted SLI, and
 * a needless workspace re-provision (agentMutateEnsuring self-heals on
 * WORKSPACE_AGENT_REQUEST_FAILED).
 *
 * These tests pin the retry contract that the fix must not disturb: client
 * errors were never retried, and the transient 5xx/connection retries stay.
 */
describe('agent hop retry contract (unchanged by the 4xx pass-through fix)', () => {
  it('never retries agent client errors (404/400) — they are terminal', () => {
    for (const status of [400, 404, 409, 422]) {
      expect(
        shouldRetryAgentHop({ kind: 'http', status, method: 'GET', attempt: 1, maxAttempts: 3 }),
      ).toBe(false);
    }
  });

  it('still retries transient agent 5xx on idempotent reads', () => {
    for (const status of [502, 503, 504]) {
      expect(
        shouldRetryAgentHop({ kind: 'http', status, method: 'GET', attempt: 1, maxAttempts: 3 }),
      ).toBe(true);
    }
  });

  it('still retries connection failures regardless of method', () => {
    expect(shouldRetryAgentHop({ kind: 'connection', method: 'POST', attempt: 1, maxAttempts: 3 })).toBe(true);
  });

  it('does not retry a transient 5xx on a mutation (write may have applied)', () => {
    expect(
      shouldRetryAgentHop({ kind: 'http', status: 502, method: 'POST', attempt: 1, maxAttempts: 3 }),
    ).toBe(false);
  });
});
