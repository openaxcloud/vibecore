import { describe, expect, it, vi } from 'vitest';

import { SkillDisclosureSession, type DisclosureSkillSpec } from './skill-disclosure.js';

/** A fixed, monotonic clock so the trace is deterministic. */
function fakeClock() {
  let n = 0;

  return () => `2026-07-24T00:00:${String(n++).padStart(2, '0')}.000Z`;
}

function makeSpec(name: string, body: string, resources: Record<string, string>): {
  spec: DisclosureSkillSpec;
  loadBody: ReturnType<typeof vi.fn>;
  loadResource: ReturnType<typeof vi.fn>;
} {
  const loadBody = vi.fn(() => body);
  const loadResource = vi.fn((path: string) => resources[path]);

  return {
    loadBody,
    loadResource,
    spec: {
      name,
      description: `does ${name}`,
      resources: Object.keys(resources).map((path) => ({ path, bytes: resources[path].length })),
      loadBody,
      loadResource,
    },
  };
}

describe('SkillDisclosureSession — progressive disclosure proof', () => {
  it('loads L2/L3 ONLY on demand, and the trace proves the order', () => {
    const commit = makeSpec('commit-helper', 'BODY: how to commit', {
      'references/conventional-commits.md': 'REF: the type table',
    });
    const review = makeSpec('code-review', 'BODY: how to review', {});

    const session = new SkillDisclosureSession([commit.spec, review.spec], fakeClock());

    // L1 is emitted by building the context manifest. No body/resource loader ran.
    const manifest = session.contextManifest();
    expect(manifest).toContain('- commit-helper: does commit-helper');
    expect(manifest).toContain('- code-review: does code-review');
    expect(commit.loadBody).not.toHaveBeenCalled();
    expect(commit.loadResource).not.toHaveBeenCalled();
    expect(review.loadBody).not.toHaveBeenCalled();

    // Trace so far: two L1 entries, nothing else.
    expect(session.trace().map((e) => e.level)).toEqual([1, 1]);

    // Agent triggers commit-helper => L2 loads, exactly once, and only for it.
    expect(session.open('commit-helper')).toBe('BODY: how to commit');
    expect(commit.loadBody).toHaveBeenCalledTimes(1);
    expect(review.loadBody).not.toHaveBeenCalled(); // the OTHER skill's body never loaded

    // Agent asks for the reference => L3 loads, exactly once.
    expect(session.openResource('commit-helper', 'references/conventional-commits.md')).toBe('REF: the type table');
    expect(commit.loadResource).toHaveBeenCalledTimes(1);

    // The full trace is L1, L1, then L2, then L3 — higher levels strictly after demand.
    const trace = session.trace();
    expect(trace.map((e) => e.level)).toEqual([1, 1, 2, 3]);
    expect(trace[2]).toMatchObject({ level: 2, skill: 'commit-helper' });
    expect(trace[3]).toMatchObject({ level: 3, skill: 'commit-helper', resource: 'references/conventional-commits.md' });

    // seq is monotonic and timestamps are recorded.
    expect(trace.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(trace.every((e) => /^2026-07-24T/.test(e.at))).toBe(true);
  });

  it('caches: re-opening does not reload or re-trace', () => {
    const commit = makeSpec('commit-helper', 'BODY', { 'r.md': 'R' });
    const session = new SkillDisclosureSession([commit.spec], fakeClock());

    session.open('commit-helper');
    session.open('commit-helper');
    session.openResource('commit-helper', 'r.md');
    session.openResource('commit-helper', 'r.md');

    expect(commit.loadBody).toHaveBeenCalledTimes(1);
    expect(commit.loadResource).toHaveBeenCalledTimes(1);
    // L1 emit happens lazily on first manifest build; here we only opened, so 1×L2 + 1×L3.
    expect(session.trace().map((e) => e.level)).toEqual([2, 3]);
  });

  it('bytesByLevel summarizes what each level cost', () => {
    const commit = makeSpec('commit-helper', 'BODYBODY', { 'r.md': 'RRR' });
    const session = new SkillDisclosureSession([commit.spec], fakeClock());

    session.contextManifest();
    session.open('commit-helper');
    session.openResource('commit-helper', 'r.md');

    const totals = session.bytesByLevel();
    expect(totals[2]).toBe(Buffer.byteLength('BODYBODY'));
    expect(totals[3]).toBe(Buffer.byteLength('RRR'));
    expect(totals[1]).toBeGreaterThan(0);
  });

  it('rejects unknown skills and undeclared resources', () => {
    const commit = makeSpec('commit-helper', 'BODY', { 'r.md': 'R' });
    const session = new SkillDisclosureSession([commit.spec], fakeClock());

    expect(() => session.open('nope')).toThrow(/Unknown skill/);
    expect(() => session.openResource('commit-helper', 'secret.md')).toThrow(/declares no resource/);
  });
});
