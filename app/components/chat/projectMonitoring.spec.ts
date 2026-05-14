import { describe, expect, it } from 'vitest';
import {
  ROUTINE_PROJECT_EVENT_PREFIXES,
  bucketEventsByTime,
  deploymentStatusColor,
  isRoutineProjectEvent,
  partitionMonitoringEvents,
} from './projectMonitoring';

describe('isRoutineProjectEvent', () => {
  it('returns false for undefined or empty input', () => {
    expect(isRoutineProjectEvent(undefined)).toBe(false);
    expect(isRoutineProjectEvent('')).toBe(false);
  });

  it.each(ROUTINE_PROJECT_EVENT_PREFIXES.map((prefix) => `${prefix}save` as string))(
    'flags %s as routine',
    (action) => {
      expect(isRoutineProjectEvent(action)).toBe(true);
    },
  );

  it('does not flag user-facing project events', () => {
    expect(isRoutineProjectEvent('project.deployment.started')).toBe(false);
    expect(isRoutineProjectEvent('project.file.created')).toBe(false);
    expect(isRoutineProjectEvent('project.snapshot.taken')).toBe(false);
  });
});

describe('partitionMonitoringEvents', () => {
  it('separates routine events from user-facing ones and preserves order', () => {
    const events = [
      { action: 'project.deployment.started', createdAt: '2026-05-14T04:12:00Z' },
      { action: 'project.ide_state.save', createdAt: '2026-05-14T04:12:01Z' },
      { action: 'project.ide_state.save', createdAt: '2026-05-14T04:12:02Z' },
      { action: 'project.file.created', createdAt: '2026-05-14T04:12:03Z' },
      { action: 'project.ide_panel.persisted', createdAt: '2026-05-14T04:12:04Z' },
    ];

    const { userFacingEvents, hiddenRoutineCount } = partitionMonitoringEvents(events);

    expect(userFacingEvents.map((e) => e.action)).toEqual(['project.deployment.started', 'project.file.created']);
    expect(hiddenRoutineCount).toBe(3);
  });

  it('returns zero hidden when no routine events are present', () => {
    const events = [{ action: 'project.deployment.started' }, { action: 'project.file.created' }];

    const result = partitionMonitoringEvents(events);
    expect(result.hiddenRoutineCount).toBe(0);
    expect(result.userFacingEvents).toEqual(events);
  });

  it('handles empty input', () => {
    expect(partitionMonitoringEvents([])).toEqual({ userFacingEvents: [], hiddenRoutineCount: 0 });
  });
});

describe('deploymentStatusColor', () => {
  it.each<[string | undefined, string]>([
    ['success', 'var(--vc-status-ok, #10b981)'],
    ['ready', 'var(--vc-status-ok, #10b981)'],
    ['failed', 'var(--vc-status-error, #ef4444)'],
    ['error', 'var(--vc-status-error, #ef4444)'],
    ['rollback', 'var(--vc-status-error, #ef4444)'],
    ['cancelled', 'var(--vc-status-muted, #94a3b8)'],
    ['pending', 'var(--vc-status-warn, #f59e0b)'],
    ['queued', 'var(--vc-status-warn, #f59e0b)'],
    ['building', 'var(--vc-status-warn, #f59e0b)'],
    ['unknown', 'var(--vc-status-neutral, #64748b)'],
    [undefined, 'var(--vc-status-neutral, #64748b)'],
  ])('maps %s -> %s', (input, expected) => {
    expect(deploymentStatusColor(input)).toBe(expected);
  });
});

describe('bucketEventsByTime', () => {
  const now = new Date('2026-05-14T04:30:00Z').getTime();

  it('buckets events into equal-width slots ordered oldest to newest', () => {
    const windowMs = 60 * 60_000; // 1h

    const events = [
      { createdAt: new Date(now - 55 * 60_000).toISOString() }, // bucket 0 (oldest)
      { createdAt: new Date(now - 5 * 60_000).toISOString() }, // bucket 9 (newest)
      { createdAt: new Date(now - 4 * 60_000).toISOString() }, // bucket 9
    ];

    const buckets = bucketEventsByTime(events, windowMs, 10, now);

    expect(buckets).toHaveLength(10);
    expect(buckets[0]).toBe(1);
    expect(buckets[9]).toBe(2);
    expect(buckets.slice(1, 9).every((c) => c === 0)).toBe(true);
  });

  it('ignores events outside the window', () => {
    const windowMs = 15 * 60_000;

    const events = [
      { createdAt: new Date(now - 20 * 60_000).toISOString() }, // older than window
      { createdAt: new Date(now + 1_000).toISOString() }, // future
      { createdAt: new Date(now - 1_000).toISOString() }, // inside window
    ];

    const buckets = bucketEventsByTime(events, windowMs, 5, now);
    expect(buckets.reduce((sum, c) => sum + c, 0)).toBe(1);
  });

  it('ignores events without a createdAt', () => {
    const buckets = bucketEventsByTime([{}, { action: 'x' }], 60_000, 4, now);
    expect(buckets.every((c) => c === 0)).toBe(true);
  });

  it('returns an empty array for invalid arguments', () => {
    expect(bucketEventsByTime([], 60_000, 0)).toEqual([]);
    expect(bucketEventsByTime([], 0, 5)).toEqual([]);
  });
});
