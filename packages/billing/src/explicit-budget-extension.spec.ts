import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENT_ROUTING_CARD } from './agent-routing.js';
import {
  applyExplicitBudgetExtension,
  buildExplicitRunPermit,
  reserveExplicitRunBudget,
  summarizeExplicitRunBudget,
  type ExplicitBudgetExtensionInput,
} from './explicit-run.js';

const permit = (runId = 'old', projectId = 'aster') =>
  buildExplicitRunPermit({ runId, projectId, planKey: 'free', card: BUILTIN_AGENT_ROUTING_CARD });

const baseline = () => ({ version: 1 as const, reservedMicros: 15260000, runIds: ['old'], permits: [permit()] });

const approval = (): ExplicitBudgetExtensionInput => ({
  projectId: 'aster',
  approvalId: 'approval-one',
  approvedBy: 'verified-admin',
  approvedAt: '2026-11-01T12:26:00.000Z',
  expectedRunIds: ['old'],
  baselineReservedMicros: 15260000,
  limitMicros: 30520000,
  maxAdditionalRuns: 1,
  maxRunReservationMicros: 15260000,
  maxCalls: 2,
  routingVersion: BUILTIN_AGENT_ROUTING_CARD.version,
});

function granted() {
  const result = applyExplicitBudgetExtension(baseline(), approval());

  if (!result.ok) {
    throw new Error('fixture grant failed');
  }

  return result.state;
}

describe('project-scoped explicit budget extension', () => {
  it('preserves historical permits byte for byte and grants exactly one bounded additional reservation', () => {
    const original = baseline();
    const before = JSON.stringify(original);
    const result = applyExplicitBudgetExtension(original, approval());
    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.idempotent).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.state.permits).toBe(original.permits);
    expect(result.state.runIds).toBe(original.runIds);
    expect(summarizeExplicitRunBudget(result.state, 'aster')).toMatchObject({
      limitMicros: 30520000,
      reservedMicros: 15260000,
      remainingMicros: 15260000,
    });

    const next = reserveExplicitRunBudget(result.state, permit('new'));
    expect(next.ok).toBe(true);

    if (!next.ok) {
      return;
    }

    expect(next.state.permits[0]).toEqual(original.permits[0]);
    expect(next.state.permits[1].budgetLimitMicros).toBe(20000000);
    expect(summarizeExplicitRunBudget(next.state, 'aster')).toMatchObject({
      limitMicros: 30520000,
      reservedMicros: 30520000,
      remainingMicros: 0,
    });
    expect(reserveExplicitRunBudget(next.state, permit('third'))).toMatchObject({
      ok: false,
      code: 'EXPLICIT_RUN_BUDGET_EXCEEDED',
    });
    expect(reserveExplicitRunBudget(next.state, permit('new'))).toMatchObject({
      ok: false,
      code: 'EXPLICIT_RUN_REPLAY',
    });
  });
  it('is idempotent only for the exact approval, even after the additional run', () => {
    const first = granted();
    expect(applyExplicitBudgetExtension(first, approval())).toEqual({ ok: true, state: first, idempotent: true });

    const used = reserveExplicitRunBudget(first, permit('new'));

    if (!used.ok) {
      throw new Error('fixture reservation failed');
    }

    expect(applyExplicitBudgetExtension(used.state, approval())).toEqual({
      ok: true,
      state: used.state,
      idempotent: true,
    });

    for (const change of [
      { approvalId: 'other' },
      { approvedBy: 'other' },
      { approvedAt: '2026-11-01T12:27:00.000Z' },
    ]) {
      expect(applyExplicitBudgetExtension(first, { ...approval(), ...change }).ok).toBe(false);
    }
  });
  it('rejects stale baselines, another project, unknown fields and noncanonical timestamps', () => {
    for (const change of [
      { expectedRunIds: [] },
      { expectedRunIds: ['wrong'] },
      { projectId: 'other' },
      { baselineReservedMicros: 0 },
      { limitMicros: 40000000 },
      { maxAdditionalRuns: 2 },
      { maxCalls: 3 },
      { routingVersion: 999 },
      { maxRunReservationMicros: 20000000 },
      { approvedAt: 'yesterday' },
      { approvedBy: '' },
      { arbitrary: true },
      { baselineRunIds: ['old'] },
    ]) {
      expect(
        applyExplicitBudgetExtension(baseline(), { ...approval(), ...change } as ExplicitBudgetExtensionInput).ok,
      ).toBe(false);
    }
  });
  it('does not grant missing, inconsistent or replay-corrupted history', () => {
    for (const state of [
      undefined,
      null,
      { ...baseline(), reservedMicros: 1 },
      { ...baseline(), runIds: ['old', 'old'] },
      { ...baseline(), permits: [{ ...permit(), reservedBudgetMicros: 1 }] },
    ]) {
      expect(applyExplicitBudgetExtension(state, approval()).ok).toBe(false);
    }
  });
  it('rejects another project and a changed routing card for the additional run', () => {
    expect(reserveExplicitRunBudget(granted(), permit('new', 'other')).ok).toBe(false);
    expect(reserveExplicitRunBudget(granted(), { ...permit('new'), routingVersion: 999 }).ok).toBe(false);
    expect(reserveExplicitRunBudget(granted(), { ...permit('new'), maxCalls: 3 }).ok).toBe(false);
  });
  it('fails closed on corrupted extension fields and forged appended histories', () => {
    const state = granted();

    for (const change of [
      { projectId: 'other' },
      { baselineRunIds: ['wrong'] },
      { baselineReservedMicros: 0 },
      { limitMicros: 40000000 },
      { maxAdditionalRuns: 2 },
      { maxCalls: 3 },
      { routingVersion: 999 },
      { extra: true },
    ]) {
      const corrupt = { ...state, extension: { ...state.extension, ...change } };
      expect(summarizeExplicitRunBudget(corrupt, 'aster')).toBeUndefined();
      expect(reserveExplicitRunBudget(corrupt, permit('new')).ok).toBe(false);
    }
    expect(
      summarizeExplicitRunBudget(
        { ...state, runIds: ['new', 'old'], permits: [permit('new'), permit()], reservedMicros: 30520000 },
        'aster',
      ),
    ).toBeUndefined();
    expect(
      summarizeExplicitRunBudget(
        {
          ...state,
          runIds: ['old', 'new', 'third'],
          permits: [permit(), permit('new'), permit('third')],
          reservedMicros: 45780000,
        },
        'aster',
      ),
    ).toBeUndefined();
  });
  it('keeps the legacy ceiling and never releases already reserved money', () => {
    expect(summarizeExplicitRunBudget(baseline(), 'aster')).toMatchObject({
      limitMicros: 20000000,
      remainingMicros: 4740000,
    });
    expect(reserveExplicitRunBudget(baseline(), permit('new'))).toMatchObject({
      ok: false,
      code: 'EXPLICIT_RUN_BUDGET_EXCEEDED',
    });

    const used = reserveExplicitRunBudget(granted(), permit('new'));

    if (!used.ok) {
      throw new Error('fixture reservation failed');
    }

    const { extension: _extension, ...stripped } = used.state;
    expect(summarizeExplicitRunBudget(stripped, 'aster')).toBeUndefined();
    expect(reserveExplicitRunBudget(stripped, permit('third')).ok).toBe(false);
  });
});

it('consumes the single extra-run slot even when a valid cheaper run leaves a balance', () => {
  const cheaper = { ...permit('cheap'), maxCalls: 1, reservedBudgetMicros: 7630000 };
  const result = reserveExplicitRunBudget(granted(), cheaper);
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error('fixture reservation failed');
  }

  expect(summarizeExplicitRunBudget(result.state, 'aster')).toMatchObject({ remainingMicros: 7630000 });
  expect(reserveExplicitRunBudget(result.state, { ...cheaper, runId: 'third' })).toMatchObject({
    ok: false,
    code: 'EXPLICIT_RUN_BUDGET_EXCEEDED',
  });
});

it('rejects malformed extension rather than silently falling back to a default ceiling', () => {
  for (const extension of [undefined, null, [], { limitMicros: 30520000 }]) {
    expect(summarizeExplicitRunBudget({ ...baseline(), extension }, 'aster')).toBeUndefined();
  }

  const inherited = Object.assign(Object.create({ extension: { limitMicros: 90000000 } }), baseline());
  expect(summarizeExplicitRunBudget(inherited, 'aster')).toBeUndefined();
});
