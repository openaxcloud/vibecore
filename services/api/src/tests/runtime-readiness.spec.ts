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

  it('is ready once an HTTP request returns a non-5xx response', () => {
    const probes: PortProbeResult[] = [
      { kind: 'response', status: 200 },
      { kind: 'response', status: 304 },
      { kind: 'response', status: 404 },
      { kind: 'response', status: 401 },
    ];

    for (const probe of probes) {
      expect(isPortReadyFromProbe(probe)).toBe(true);
    }
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
