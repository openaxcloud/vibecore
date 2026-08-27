/**
 * BUG-SELFREPAIR-RUNAWAY-LOOP-001 — the runaway "AI patch accepted" loop must
 * be BOUNDED. These tests reproduce the live incident shape (a persistent
 * error source re-emitting patches for the same files, hundreds of times) and
 * assert the real numbers: without the guard the pipeline admitted every one
 * of the 200 attempts; with it the applies are capped and everything beyond
 * the bound halts with an explicit escalation decision.
 */

import { describe, expect, it } from 'vitest';
import {
  AGENT_PATCH_FLOOD_DEFAULTS,
  AgentPatchFloodGuard,
  patchContentFingerprint,
  type PatchAdmission,
} from './agent-patch-flood-guard';

const T0 = 1_000_000;

function tally(admissions: PatchAdmission[]) {
  return {
    applies: admissions.filter((a) => a.kind === 'apply').length,
    skips: admissions.filter((a) => a.kind === 'skip-identical').length,
    halts: admissions.filter((a) => a.kind === 'halt').length,
  };
}

describe('AgentPatchFloodGuard', () => {
  it('bounds a 200-attempt distinct-content repair loop on one file to the per-file limit (6 applies, 194 halts)', () => {
    const guard = new AgentPatchFloodGuard();
    const admissions: PatchAdmission[] = [];

    for (let attempt = 0; attempt < 200; attempt++) {
      // A persistent error source: every "repair" produces slightly different bytes.
      const admission = guard.admit(
        'src/styles/global.css',
        patchContentFingerprint(`body{--attempt:${attempt}}`),
        T0 + attempt,
      );
      admissions.push(admission);

      if (admission.kind === 'apply') {
        guard.recordAccepted('src/styles/global.css', patchContentFingerprint(`body{--attempt:${attempt}}`));
      }
    }

    const { applies, halts } = tally(admissions);

    // Unbounded pipeline: 200 applies. Bounded: exactly the per-file limit.
    expect(applies).toBe(AGENT_PATCH_FLOOD_DEFAULTS.perFileMaxApplies);
    expect(applies).toBe(6);
    expect(halts).toBe(194);

    const firstHalt = admissions.find((a) => a.kind === 'halt');
    expect(firstHalt).toMatchObject({ kind: 'halt', scope: 'file', reason: 'per-file-limit', attempts: 6, limit: 6 });
  });

  it('collapses the live ×90 identical re-emission storm into ONE apply and 89 silent skips', () => {
    const guard = new AgentPatchFloodGuard();
    const fingerprint = patchContentFingerprint('body { margin: 0; }');
    const admissions: PatchAdmission[] = [];

    for (let attempt = 0; attempt < 90; attempt++) {
      const admission = guard.admit('src/styles/global.css', fingerprint, T0 + attempt);
      admissions.push(admission);

      if (admission.kind === 'apply') {
        guard.recordAccepted('src/styles/global.css', fingerprint);
      }
    }

    const { applies, skips, halts } = tally(admissions);

    // The measured live storm: ~90 "AI patch accepted" for the SAME bytes. Now: 1.
    expect(applies).toBe(1);

    /*
     * Duplicates are skipped SILENTLY (no halt/alert): even healthy generations
     * re-emit identical actions in bulk (BUG-AGENT-001: 19 identical
     * vite.config.ts re-writes in a run that worked), so escalating on
     * duplicates would be a false alarm.
     */
    expect(skips).toBe(89);
    expect(halts).toBe(0);
  });

  it('halts a file after 3 consecutive apply failures (non-convergence)', () => {
    const guard = new AgentPatchFloodGuard();

    for (let attempt = 0; attempt < 3; attempt++) {
      const admission = guard.admit('src/App.tsx', patchContentFingerprint(`broken-${attempt}`), T0 + attempt);
      expect(admission.kind).toBe('apply');
      guard.recordFailure('src/App.tsx');
    }

    const admission = guard.admit('src/App.tsx', patchContentFingerprint('broken-3'), T0 + 10);
    expect(admission).toMatchObject({
      kind: 'halt',
      scope: 'file',
      reason: 'repeated-failures',
      attempts: 3,
      limit: 3,
    });

    // A success elsewhere never unblocks this path; a success HERE does.
    guard.recordAccepted('src/App.tsx', patchContentFingerprint('fixed'));
    expect(guard.admit('src/App.tsx', patchContentFingerprint('follow-up'), T0 + 11).kind).toBe('apply');
  });

  it('enforces the global backstop across many files (121 files → 120 applies, then a global halt)', () => {
    const guard = new AgentPatchFloodGuard();
    const admissions: PatchAdmission[] = [];

    for (let index = 0; index < 121; index++) {
      admissions.push(guard.admit(`src/file-${index}.ts`, patchContentFingerprint(`content-${index}`), T0 + index));
    }

    const { applies, halts } = tally(admissions);

    expect(applies).toBe(AGENT_PATCH_FLOOD_DEFAULTS.globalMaxApplies);
    expect(applies).toBe(120);
    expect(halts).toBe(1);
    expect(admissions[120]).toMatchObject({ kind: 'halt', scope: 'global', reason: 'global-limit' });
  });

  it('applies exponential per-file backoff after repeated applies (0, 0, 0, 500, 1000, 2000 ms)', () => {
    const guard = new AgentPatchFloodGuard();
    const delays: number[] = [];

    for (let attempt = 0; attempt < 6; attempt++) {
      const admission = guard.admit('src/index.ts', patchContentFingerprint(`v${attempt}`), T0 + attempt);

      if (admission.kind !== 'apply') {
        throw new Error(`expected apply, got ${admission.kind}`);
      }

      delays.push(admission.delayMs);
      guard.recordAccepted('src/index.ts', patchContentFingerprint(`v${attempt}`));
    }

    expect(delays).toEqual([0, 0, 0, 500, 1000, 2000]);
  });

  it('lets a resolved problem retry after the sliding window expires', () => {
    const guard = new AgentPatchFloodGuard();

    for (let attempt = 0; attempt < 6; attempt++) {
      expect(guard.admit('src/a.ts', patchContentFingerprint(`v${attempt}`), T0 + attempt).kind).toBe('apply');
    }

    expect(guard.admit('src/a.ts', patchContentFingerprint('v6'), T0 + 6).kind).toBe('halt');

    const afterWindow = T0 + AGENT_PATCH_FLOOD_DEFAULTS.windowMs + 10;
    expect(guard.admit('src/a.ts', patchContentFingerprint('v7'), afterWindow).kind).toBe('apply');
  });

  it('probe (streaming) never consumes budget but still reports duplicates and halts', () => {
    const guard = new AgentPatchFloodGuard();
    const path = 'src/streamed.tsx';

    // 55 streamed chunks (the measured per-file chunk volume) burn NO budget.
    for (let chunk = 0; chunk < 55; chunk++) {
      expect(guard.probe(path, patchContentFingerprint(`partial-${chunk}`), T0 + chunk).kind).toBe('apply');
    }

    // The authoritative close is the FIRST counted apply.
    const close = guard.admit(path, patchContentFingerprint('full content'), T0 + 60);
    expect(close).toMatchObject({ kind: 'apply', delayMs: 0 });

    // A streamed chunk identical to the queued content contributes nothing.
    expect(guard.probe(path, patchContentFingerprint('full content'), T0 + 61).kind).toBe('skip-identical');

    // Once the path is halted (3 consecutive failures), streaming halts too.
    guard.recordFailure(path);
    guard.recordFailure(path);
    guard.recordFailure(path);
    expect(guard.probe(path, patchContentFingerprint('another'), T0 + 62)).toMatchObject({
      kind: 'halt',
      reason: 'repeated-failures',
    });
  });
});
