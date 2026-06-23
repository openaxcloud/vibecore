import { describe, expect, it } from 'vitest';

import { shouldMeterDeployment } from '../app.js';

/**
 * Deploy metering must be EXACTLY ONCE. reconcileDeploymentStatus runs on every
 * deployments-list and single-deployment GET (both client-polled), so a
 * freshly-READY deployment is observed concurrently. meterDeployment has no
 * idempotency guard of its own, so the only thing standing between a deployment
 * and a double `deployment.compute` charge is (a) this eligibility predicate and
 * (b) the per-deployment advisory lock + in-lock re-read in meterDeploymentOnce.
 *
 * These pin the predicate: only a READY, not-yet-metered row is eligible. The
 * in-lock re-read passes the *fresh* row through this predicate, so once one pod
 * stamps lastMeteredAt every other contender is rejected here.
 */
describe('shouldMeterDeployment (deploy metering exactly-once)', () => {
  it('meters a freshly READY deployment that has not been metered yet', () => {
    expect(shouldMeterDeployment({ status: 'READY' })).toBe(true);
    expect(shouldMeterDeployment({ status: 'READY', lastMeteredAt: undefined })).toBe(true);
  });

  it('does NOT re-meter a READY deployment already stamped (the double-charge guard)', () => {
    expect(shouldMeterDeployment({ status: 'READY', lastMeteredAt: '2026-06-23T00:00:00.000Z' })).toBe(false);
  });

  it('does not meter deployments that are not yet READY', () => {
    expect(shouldMeterDeployment({ status: 'QUEUED' })).toBe(false);
    expect(shouldMeterDeployment({ status: 'BUILDING' })).toBe(false);
    expect(shouldMeterDeployment({ status: 'FAILED' })).toBe(false);
    expect(shouldMeterDeployment({ status: 'CANCELED' })).toBe(false);
  });

  it('treats any already-stamped row as ineligible regardless of status', () => {
    expect(shouldMeterDeployment({ status: 'FAILED', lastMeteredAt: '2026-06-23T00:00:00.000Z' })).toBe(false);
  });
});
