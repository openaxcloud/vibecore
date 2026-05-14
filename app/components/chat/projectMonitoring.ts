/**
 * Helpers used by the IDE Monitoring panel. Extracted from BaseChat so they
 * can be unit-tested without rendering the (very large) parent component.
 */

/**
 * Routine, machine-emitted project events that swamp the monitoring feed when
 * surfaced verbatim (eight `project.ide_state.save` rows in a 30-second
 * window is debounce noise, not user activity). They stay available in the
 * Logs panel for forensics, but the monitoring view collapses them to a
 * single counter.
 */
export const ROUTINE_PROJECT_EVENT_PREFIXES = [
  'project.ide_state.',
  'project.ide_panel.',
  'project.workspace_heartbeat.',
] as const;

export function isRoutineProjectEvent(action: string | undefined): boolean {
  if (!action) {
    return false;
  }

  return ROUTINE_PROJECT_EVENT_PREFIXES.some((prefix) => action.startsWith(prefix));
}

export interface MonitoringEvent {
  action?: string;
  createdAt?: string;
}

export function partitionMonitoringEvents<E extends MonitoringEvent>(
  events: readonly E[],
): { userFacingEvents: E[]; hiddenRoutineCount: number } {
  let hiddenRoutineCount = 0;

  const userFacingEvents: E[] = [];

  for (const event of events) {
    if (isRoutineProjectEvent(event?.action)) {
      hiddenRoutineCount += 1;
      continue;
    }

    userFacingEvents.push(event);
  }

  return { userFacingEvents, hiddenRoutineCount };
}

export function deploymentStatusColor(status: string | undefined): string {
  const value = (status ?? '').toLowerCase();

  if (value.includes('fail') || value.includes('error') || value.includes('rollback')) {
    return 'var(--vc-status-error, #ef4444)';
  }

  if (value.includes('cancel')) {
    return 'var(--vc-status-muted, #94a3b8)';
  }

  if (value.includes('pending') || value.includes('queued') || value.includes('building')) {
    return 'var(--vc-status-warn, #f59e0b)';
  }

  if (value.includes('success') || value.includes('complete') || value.includes('ready')) {
    return 'var(--vc-status-ok, #10b981)';
  }

  return 'var(--vc-status-neutral, #64748b)';
}

/**
 * Bucket events by timestamp over the supplied window into `bucketCount`
 * equal-width buckets, with bucket 0 being the oldest and the last bucket
 * being the most recent. Events outside the window are ignored.
 */
export function bucketEventsByTime(
  events: readonly MonitoringEvent[],
  windowMs: number,
  bucketCount: number,
  now: number = Date.now(),
): number[] {
  if (bucketCount <= 0 || windowMs <= 0) {
    return [];
  }

  const counts = new Array<number>(bucketCount).fill(0);
  const bucketSize = windowMs / bucketCount;

  for (const event of events) {
    if (!event?.createdAt) {
      continue;
    }

    const ts = new Date(event.createdAt).getTime();

    if (!Number.isFinite(ts)) {
      continue;
    }

    const offset = now - ts;

    if (offset < 0 || offset > windowMs) {
      continue;
    }

    const bucket = Math.min(bucketCount - 1, Math.floor((windowMs - offset) / bucketSize));
    counts[bucket] += 1;
  }

  return counts;
}
