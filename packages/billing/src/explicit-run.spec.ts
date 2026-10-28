import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_ROUTING_CARD } from './agent-routing.js';
import { buildExplicitRunPermit, ExplicitRunError, reserveExplicitRunBudget } from './explicit-run.js';

const make = (runId = 'test-run') =>
  buildExplicitRunPermit({ runId, projectId: 'project', planKey: 'free', card: BUILTIN_AGENT_ROUTING_CARD });
describe('bounded explicit run budget', () => {
  it('prices active Lite separately from its automatic provider and reserves both charges upward', () => {
    const permit = make();
    expect(permit.model).toBe('gpt-5.6-luna');
    expect(permit.pricing.platformInputCentsPerMillion).toBe(650);
    expect(permit.pricing.platformOutputCentsPerMillion).toBe(2437.5);
    expect(permit.reservedBudgetMicros).toBe(15260000);
    expect(permit.maxCalls).toBe(2);
    expect(permit.accounting).toEqual({
      providerInputCentsPerMillion: 20,
      providerOutputCentsPerMillion: 120,
      platformInputCentsPerMillion: 325,
      platformOutputCentsPerMillion: 1625,
    });
  });
  it('rejects unknown or nonpositive pricing and unavailable plans', () => {
    for (const price of [0, NaN, Infinity, -1]) {
      expect(() =>
        buildExplicitRunPermit({
          runId: 'r',
          projectId: 'p',
          planKey: 'free',
          card: { ...BUILTIN_AGENT_ROUTING_CARD, baseUserInCentsPerM: price },
        }),
      ).toThrow();
    }
    expect(() =>
      buildExplicitRunPermit({ runId: 'r', projectId: 'p', planKey: 'unknown', card: BUILTIN_AGENT_ROUTING_CARD }),
    ).toThrow();
  });
  it('retains reservations, rejects replay and stops at the shared project cap', () => {
    let state: unknown;

    for (let i = 0; i < 1; i++) {
      const result = reserveExplicitRunBudget(state, make(`run-${i}`));
      expect(result.ok).toBe(true);

      if (result.ok) {
        state = result.state;
      }
    }
    expect(reserveExplicitRunBudget(state, make('run-0'))).toMatchObject({ ok: false, code: 'EXPLICIT_RUN_REPLAY' });
    expect(reserveExplicitRunBudget(state, make('run-1'))).toMatchObject({
      ok: false,
      code: 'EXPLICIT_RUN_BUDGET_EXCEEDED',
    });
    expect(reserveExplicitRunBudget(null, make())).toMatchObject({ ok: false, code: 'EXPLICIT_RUN_BUDGET_INVALID' });
  });
});

it('exposes typed machine codes without presenting them as user-facing error messages', () => {
  try {
    buildExplicitRunPermit({ runId: 'r', projectId: 'p', planKey: 'unknown', card: BUILTIN_AGENT_ROUTING_CARD });
    expect.fail('Expected a typed refusal');
  } catch (error) {
    expect(error).toBeInstanceOf(ExplicitRunError);
    expect(error).toMatchObject({ code: 'EXPLICIT_RUN_UNAVAILABLE', message: '' });
  }
});
