import { describe, expect, it } from 'vitest';

import {
  humanizeTechnicalIdentifier,
  KNOWN_QUOTA_KEYS,
  memberDisplayLabel,
  oauthErrorDisplayMessage,
  providerDisplayLabel,
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

  it('never exposes an internal user identifier as a member label', () => {
    expect(memberDisplayLabel({ name: '  Ada Lovelace  ', email: 'ada@example.com' }, 0)).toBe('Ada Lovelace');
    expect(memberDisplayLabel({ email: '  ada@example.com  ' }, 0)).toBe('ada@example.com');
    expect(memberDisplayLabel({}, 0)).toBe('Member 1');
    expect(memberDisplayLabel({})).toBe('Organization member');
  });

  it('maps OAuth providers and failures without echoing query-string values', () => {
    expect(providerDisplayLabel('github')).toBe('GitHub');
    expect(providerDisplayLabel('unknown_provider')).toBe('Identity provider');
    expect(oauthErrorDisplayMessage('access_denied')).toBe('The request was cancelled or denied.');
    expect(oauthErrorDisplayMessage('internal_stack_trace')).toBe('The request could not be completed. Try again.');
  });
});
