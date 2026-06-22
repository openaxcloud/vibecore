import { describe, expect, it } from 'vitest';

import { shouldRecordDeploymentUsage } from '../deployment-billing.js';

describe('shouldRecordDeploymentUsage', () => {
  it('bills a successful (READY) deployment', () => {
    expect(shouldRecordDeploymentUsage('READY')).toBe(true);
  });

  it('bills a still-building deployment (pollable / queued externally)', () => {
    expect(shouldRecordDeploymentUsage('BUILDING')).toBe(true);
  });

  it('does NOT bill a FAILED build', () => {
    expect(shouldRecordDeploymentUsage('FAILED')).toBe(false);
  });

  it('does NOT bill a build canceled mid-flight (persisted CANCELED)', () => {
    /*
     * Regression: the handler locally computes 'READY' but the row landed as
     * CANCELED via the monotonic guard. Keying on the persisted status must not
     * consume quota for a deploy that serves nothing.
     */
    expect(shouldRecordDeploymentUsage('CANCELED')).toBe(false);
  });
});
