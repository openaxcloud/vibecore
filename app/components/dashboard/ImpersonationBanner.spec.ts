import { describe, expect, it } from 'vitest';

import { IMPERSONATION_STOP_ERROR, deriveStopState } from './ImpersonationBanner';

describe('impersonation banner stop state', () => {
  it('shows "Stopping…" while the stop request is in flight', () => {
    expect(deriveStopState('submitting', undefined)).toEqual({
      stopping: true,
      failed: false,
      error: null,
    });
    expect(deriveStopState('loading', undefined)).toEqual({
      stopping: true,
      failed: false,
      error: null,
    });
  });

  it('stays idle with no error before any stop attempt', () => {
    expect(deriveStopState('idle', undefined)).toEqual({
      stopping: false,
      failed: false,
      error: null,
    });
  });

  it('does not surface an error for a successful stop (the page reloads instead)', () => {
    expect(deriveStopState('idle', { stopped: true })).toEqual({
      stopping: false,
      failed: false,
      error: null,
    });
  });

  it('surfaces an inline error when the stop resolved but did not take (action returned stopped:false)', () => {
    const result = deriveStopState('idle', { stopped: false });

    expect(result.failed).toBe(true);
    expect(result.stopping).toBe(false);
    expect(result.error).toBe(IMPERSONATION_STOP_ERROR);
  });

  it('does not flag failure while a retry is still submitting even if the last response failed', () => {
    // The failed response is only meaningful once the fetcher returns to idle.
    expect(deriveStopState('submitting', { stopped: false }).failed).toBe(false);
  });
});
