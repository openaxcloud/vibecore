import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_ROUTING_CARD } from './agent-routing.js';
import {
  buildExplicitRunPermit,
  ExplicitRunError,
  summarizeExplicitRunBudget,
  reserveExplicitRunBudget,
} from './explicit-run.js';

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

describe('explicit budget read projection', () => {
  const ledger = () => ({ version: 1, reservedMicros: 15260000, runIds: ['test-run'], permits: [make()] });
  it('projects reservations without historical costs or private permit fields', () => {
    expect(summarizeExplicitRunBudget(ledger(), 'project')).toEqual({
      scope: 'explicit-runs-only',
      currency: 'USD',
      limitMicros: 20000000,
      reservedMicros: 15260000,
      remainingMicros: 4740000,
      runCount: 1,
      historicalCostsIncluded: false,
      totalRecipeRemainingMicros: null,
    });
    expect(summarizeExplicitRunBudget(undefined, 'project')).toMatchObject({
      reservedMicros: 0,
      historicalCostsIncluded: false,
    });
  });
  it('rejects corruption, unsafe totals, mismatched identities and duplicate permits', () => {
    for (const value of [
      null,
      {},
      [],
      { ...ledger(), reservedMicros: 0 },
      { ...ledger(), reservedMicros: NaN },
      { ...ledger(), reservedMicros: Number.MAX_SAFE_INTEGER + 1 },
      { ...ledger(), reservedMicros: 20000001 },
      { ...ledger(), runIds: ['different'] },
      { ...ledger(), runIds: ['test-run', 'test-run'] },
      { ...ledger(), permits: [null] },
      { ...ledger(), reservedMicros: 1, permits: [{ ...make(), reservedBudgetMicros: 1 }] },
      { ...ledger(), permits: [{ ...make(), projectId: 'foreign' }] },
      { ...ledger(), permits: [{ ...make(), reservedBudgetMicros: -1 }] },
      { ...ledger(), permits: [{ ...make(), pricing: null }] },
      { ...ledger(), runIds: ['test-run', 'second'], permits: [make(), make()], reservedMicros: 20000000 },
    ]) {
      expect(summarizeExplicitRunBudget(value, 'project')).toBeUndefined();
    }
  });
});
