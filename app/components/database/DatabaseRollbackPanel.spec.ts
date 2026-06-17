import { describe, expect, it } from 'vitest';
import { isDatabasePanelDormant } from './DatabaseRollbackPanel';

describe('isDatabasePanelDormant (DB-PITR shell gate)', () => {
  it('stays dormant before any data has loaded', () => {
    expect(isDatabasePanelDormant(undefined)).toBe(true);
  });

  it('stays dormant when the feature endpoint 404s (ok:false / enabled:false)', () => {
    expect(isDatabasePanelDormant({ ok: false, enabled: false })).toBe(true);
    expect(isDatabasePanelDormant({ ok: false })).toBe(true);
  });

  it('renders once the feature returns an enabled payload', () => {
    expect(
      isDatabasePanelDormant({
        ok: true,
        entitlement: { allowed: true, retentionDays: 28 },
        instance: null,
        snapshots: [],
        restores: [],
      }),
    ).toBe(false);
  });
});
