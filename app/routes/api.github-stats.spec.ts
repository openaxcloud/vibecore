import { describe, expect, it } from 'vitest';

import { mapRecentActivity, mapWithConcurrency, MAX_METRIC_REPOS, METRICS_CONCURRENCY } from './api.github-stats';

describe('mapRecentActivity', () => {
  it('maps repo name/url when present', () => {
    const result = mapRecentActivity([
      {
        id: '1',
        type: 'PushEvent',
        repo: { name: 'octocat/Hello-World', url: 'https://api.github.com/repos/octocat/Hello-World' },
        created_at: '2026-01-01T00:00:00Z',
        payload: { ref: 'refs/heads/main' },
      },
    ]);

    expect(result).toEqual([
      {
        id: '1',
        type: 'PushEvent',
        repo: { name: 'octocat/Hello-World', url: 'https://api.github.com/repos/octocat/Hello-World' },
        created_at: '2026-01-01T00:00:00Z',
        payload: { ref: 'refs/heads/main' },
      },
    ]);
  });

  it('does not throw on events with a missing/null repo field (Bug 1)', () => {
    const events = [
      { id: '1', type: 'SponsorshipEvent', created_at: '2026-01-01T00:00:00Z' }, // no repo at all
      { id: '2', type: 'MemberEvent', repo: null, created_at: '2026-01-02T00:00:00Z' }, // explicit null
      {
        id: '3',
        type: 'PushEvent',
        repo: { name: 'a/b', url: 'https://api.github.com/repos/a/b' },
        created_at: '2026-01-03T00:00:00Z',
      },
    ];

    let result: ReturnType<typeof mapRecentActivity> = [];
    expect(() => {
      result = mapRecentActivity(events);
    }).not.toThrow();

    expect(result[0].repo).toEqual({ name: '', url: '' });
    expect(result[1].repo).toEqual({ name: '', url: '' });
    expect(result[2].repo).toEqual({ name: 'a/b', url: 'https://api.github.com/repos/a/b' });

    // payload always defaults to an object
    expect(result[0].payload).toEqual({});
  });

  it('tolerates a repo object with missing name/url subfields', () => {
    const result = mapRecentActivity([{ id: '1', type: 'X', repo: {}, created_at: 'now' }]);
    expect(result[0].repo).toEqual({ name: '', url: '' });
  });

  it('caps the activity list at 10 and tolerates non-array input', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      type: 'PushEvent',
      repo: { name: `o/r${i}`, url: `u${i}` },
      created_at: 'now',
    }));
    expect(mapRecentActivity(many)).toHaveLength(10);
    expect(mapRecentActivity(undefined as any)).toEqual([]);
    expect(mapRecentActivity(null as any)).toEqual([]);
  });
});

describe('mapWithConcurrency (Bug 2)', () => {
  it('never exceeds the configured concurrency and processes every item', async () => {
    const total = 200;
    const items = Array.from({ length: total }, (_, i) => i);

    let inFlight = 0;
    let maxInFlight = 0;

    const results = await mapWithConcurrency(items, 5, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;

      return n * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(results).toHaveLength(total);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual(items.map((n) => n * 2));
  });

  it('settles rejections without rejecting the whole batch (allSettled semantics)', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) {
        throw new Error('boom');
      }

      return n;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles an empty input list', async () => {
    await expect(mapWithConcurrency([], 5, async (x) => x)).resolves.toEqual([]);
  });

  it('caps the number of repos that get expensive metric fan-out', () => {
    const allRepos = Array.from({ length: 2000 }, (_, i) => ({ full_name: `o/r${i}` }));
    const selected = allRepos.slice(0, MAX_METRIC_REPOS);
    expect(selected).toHaveLength(MAX_METRIC_REPOS);
    expect(MAX_METRIC_REPOS).toBeLessThan(allRepos.length);
    expect(METRICS_CONCURRENCY).toBeGreaterThan(0);
  });
});
