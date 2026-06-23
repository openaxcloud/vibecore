import { describe, expect, it } from 'vitest';
import { isDatabasePanelDormant, shouldRefreshAfterRestore } from './DatabaseRollbackPanel';

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

describe('shouldRefreshAfterRestore (refresh-loop guard)', () => {
  it('refreshes on the rising edge of a successful restore', () => {
    expect(shouldRefreshAfterRestore(false, true)).toBe(true);
  });

  it('does NOT refresh while restoreOk stays true (no infinite loop)', () => {
    /*
     * Once the rising edge fired and the ref recorded `true`, subsequent
     * re-renders (e.g. loadFetcher reference churn idle→loading→idle) keep
     * restoreOk === true and must NOT trigger another reload.
     */
    expect(shouldRefreshAfterRestore(true, true)).toBe(false);
  });

  it('does not refresh when there has been no success', () => {
    expect(shouldRefreshAfterRestore(false, false)).toBe(false);
  });

  it('re-arms after restoreOk falls, so the next success fires again', () => {
    expect(shouldRefreshAfterRestore(true, false)).toBe(false);
    expect(shouldRefreshAfterRestore(false, true)).toBe(true);
  });

  it('fires exactly once across a full submit→settle→churn lifecycle', () => {
    /*
     * Simulate the effect threading prevRestoreOk through a ref while the load
     * fetcher churns its reference/.data after each reload. Count the reloads.
     */
    let prev = false;
    let reloads = 0;

    /*
     * restoreOk transitions over the lifecycle of one successful intent.
     * false: idle (pre-submit) / submitting; then true once settled; then the
     * reload churns loadFetcher across several extra renders while restoreOk
     * is still true; finally a new submission resets it to false.
     */
    const restoreOkTimeline = [false, false, true, true, true, true, false];

    for (const restoreOk of restoreOkTimeline) {
      if (shouldRefreshAfterRestore(prev, restoreOk)) {
        reloads += 1;
      }

      prev = restoreOk;
    }

    expect(reloads).toBe(1);

    // A second successful intent fires exactly one more reload.
    for (const restoreOk of [true, true, false]) {
      if (shouldRefreshAfterRestore(prev, restoreOk)) {
        reloads += 1;
      }

      prev = restoreOk;
    }

    expect(reloads).toBe(2);
  });
});
