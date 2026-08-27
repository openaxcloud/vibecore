import { describe, expect, it } from 'vitest';
import {
  computeWorkspaceRestorePlan,
  isPortReadyFromProbe,
  type PortProbeResult,
} from '../runtime-readiness.js';

describe('isPortReadyFromProbe', () => {
  it('is not ready when the port is unreachable (bound but not serving yet)', () => {
    expect(isPortReadyFromProbe({ kind: 'unreachable' })).toBe(false);
  });

  it('is not ready when the dev server / proxy returns a 5xx', () => {
    expect(isPortReadyFromProbe({ kind: 'response', status: 502 })).toBe(false);
    expect(isPortReadyFromProbe({ kind: 'response', status: 503 })).toBe(false);
    expect(isPortReadyFromProbe({ kind: 'response', status: 500 })).toBe(false);
  });

  it('is ready once an HTTP request returns a 2xx/3xx response', () => {
    const probes: PortProbeResult[] = [
      { kind: 'response', status: 200 },
      { kind: 'response', status: 304 },
      { kind: 'response', status: 200, bodyBytes: 512 },
    ];

    for (const probe of probes) {
      expect(isPortReadyFromProbe(probe)).toBe(true);
    }
  });

  /*
   * REGRESSION — SOLUTIONS_REAL_PROOF_BLOCKERS.md §5.
   *
   * 404/401 previously counted as READY (the rule was `status < 500`). A dev
   * server that bound its port but served nothing at `/`, or a proxy answering
   * "not found" for the workspace, therefore latched the preview to ready —
   * which both showed a green light over a blank webview AND disarmed the
   * not-ready -> ready auto-reload recovery.
   */
  it('is NOT ready on a 4xx: the port answers, but not with the app', () => {
    expect(isPortReadyFromProbe({ kind: 'response', status: 404 })).toBe(false);
    expect(isPortReadyFromProbe({ kind: 'response', status: 401 })).toBe(false);
    expect(isPortReadyFromProbe({ kind: 'response', status: 403 })).toBe(false);
  });

  it('is NOT ready on a 200 with an empty body (bound socket, nothing served)', () => {
    expect(isPortReadyFromProbe({ kind: 'response', status: 200, bodyBytes: 0 })).toBe(false);

    // Body unknown (caller did not read it) still falls back to the status check.
    expect(isPortReadyFromProbe({ kind: 'response', status: 200 })).toBe(true);
  });

  it('models the not-ready -> ready transition the Preview auto-reload edge depends on', () => {
    // A freshly-bound port: connection refused, then 502 through the proxy, then 200.
    const sequence: PortProbeResult[] = [
      { kind: 'unreachable' },
      { kind: 'response', status: 502 },
      { kind: 'response', status: 200 },
    ];

    const readiness = sequence.map(isPortReadyFromProbe);

    expect(readiness).toEqual([false, false, true]);

    /*
     * The bug was emitting ready=true unconditionally, which never produces a
     * false value first and so makes the reload edge dead code. Assert at least
     * one not-ready precedes the ready.
     */
    expect(readiness.indexOf(true)).toBeGreaterThan(0);
  });
});

describe('computeWorkspaceRestorePlan', () => {
  it('writes every restored file', () => {
    const restored = [
      { path: 'src/index.ts', content: 'a' },
      { path: 'package.json', content: 'b' },
    ];

    const plan = computeWorkspaceRestorePlan(restored, ['src/index.ts', 'package.json']);

    expect(plan.writes).toEqual(restored);
    expect(plan.deletes).toEqual([]);
  });

  it('deletes live paths that the snapshot no longer contains', () => {
    const restored = [{ path: 'src/index.ts', content: 'a' }];
    const live = ['src/index.ts', 'src/removed.ts', 'stale.txt'];

    const plan = computeWorkspaceRestorePlan(restored, live);

    expect(plan.deletes).toEqual(['src/removed.ts', 'stale.txt']);
  });

  it('normalises leading ./ and / so a path is not both written and deleted', () => {
    const restored = [{ path: 'src/index.ts', content: 'a' }];
    const live = ['./src/index.ts', '/src/index.ts'];

    const plan = computeWorkspaceRestorePlan(restored, live);

    // The same logical file appears restored AND live -> never deleted.
    expect(plan.deletes).toEqual([]);
  });

  it('keeps a file that exists only in the snapshot (pure addition, no delete)', () => {
    const restored = [
      { path: 'a.ts', content: '1' },
      { path: 'b.ts', content: '2' },
    ];

    const plan = computeWorkspaceRestorePlan(restored, ['a.ts']);

    expect(plan.writes.map((file) => file.path)).toEqual(['a.ts', 'b.ts']);
    expect(plan.deletes).toEqual([]);
  });
});

import { aggregatePreviewReadiness } from '../runtime-readiness.js';

describe('aggregatePreviewReadiness (Blocker #5 — the 4 actors must agree)', () => {
  const ready = { portReady: true, hasLiveProcess: true, managerStatus: 'RUNNING', clientBeacon: 'none' as const };

  it('is ready only when all signals agree', () => {
    expect(aggregatePreviewReadiness(ready)).toEqual({ ready: true });
  });

  it('port veto: a failed probe is never ready (even if everything else is fine)', () => {
    expect(aggregatePreviewReadiness({ ...ready, portReady: false })).toEqual({ ready: false, blockedBy: 'port' });
  });

  it('process veto: a bound port with no live dev-server process is a ghost', () => {
    expect(aggregatePreviewReadiness({ ...ready, hasLiveProcess: false })).toEqual({
      ready: false,
      blockedBy: 'process',
    });
  });

  it('manager veto: a known non-RUNNING workspace is never ready', () => {
    expect(aggregatePreviewReadiness({ ...ready, managerStatus: 'STOPPED' })).toEqual({
      ready: false,
      blockedBy: 'manager',
    });
  });

  it('manager unknown (undefined) is neutral — a brand-new workspace still passes', () => {
    expect(aggregatePreviewReadiness({ ...ready, managerStatus: undefined })).toEqual({ ready: true });
  });

  it('client veto: a fresh blank/error beacon drops readiness even when the port probe passed', () => {
    expect(aggregatePreviewReadiness({ ...ready, clientBeacon: 'blank' })).toEqual({
      ready: false,
      blockedBy: 'client',
    });
    expect(aggregatePreviewReadiness({ ...ready, clientBeacon: 'error' })).toEqual({
      ready: false,
      blockedBy: 'client',
    });
  });

  it("client 'ok' does not veto (it clears a prior blank)", () => {
    expect(aggregatePreviewReadiness({ ...ready, clientBeacon: 'ok' })).toEqual({ ready: true });
  });
});
