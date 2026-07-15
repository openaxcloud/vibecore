import { describe, expect, it } from 'vitest';

import {
  humanizeTechnicalIdentifier,
  KNOWN_QUOTA_KEYS,
  quotaDisplayLabel,
  statusDisplayLabel,
  userFacingLabel,
} from './user-facing-labels';

describe('user-facing API labels', () => {
  it.each(KNOWN_QUOTA_KEYS)('maps %s without leaking implementation punctuation', (key) => {
    const label = quotaDisplayLabel(key);

    expect(label).not.toBe(key);
    expect(label).not.toMatch(/[.:_]/u);
  });

  it('uses explicit product vocabulary for units and acronyms', () => {
    expect(quotaDisplayLabel('workspace.cpuMillicores')).toBe('Workspace CPU capacity');
    expect(quotaDisplayLabel('snapshots.sizeMb')).toBe('Snapshot storage (MB)');
    expect(quotaDisplayLabel('api.rateLimitPerMinute')).toBe('API requests per minute');
  });

  it('humanizes new backend keys instead of echoing them', () => {
    expect(quotaDisplayLabel('future.concurrentGpuMinutes')).toBe('Future concurrent GPU minutes');
    expect(humanizeTechnicalIdentifier('CUSTOM_API_CALLS')).toBe('Custom API calls');
  });

  it('maps backend statuses to customer language', () => {
    expect(statusDisplayLabel('PAST_DUE')).toBe('Past due');
    expect(statusDisplayLabel('uncollectible')).toBe('Payment failed');
    expect(statusDisplayLabel('IN_PROGRESS')).toBe('In progress');
  });

  it('provides stable empty-state labels', () => {
    expect(userFacingLabel('')).toBe('Recorded activity');
    expect(quotaDisplayLabel('')).toBe('Plan allowance');
    expect(statusDisplayLabel('')).toBe('Status unavailable');
  });
});
