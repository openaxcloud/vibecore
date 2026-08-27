import { describe, expect, it } from 'vitest';

import { ACTIONABLE_PANEL_CODES, actionablePanelFailure } from './api.projects.$projectId.ide-panel.$panel';

/**
 * Reported from an iPhone: tapping "Create a database" made the whole Database
 * panel VANISH — `[data-panel="database"]` was gone from the DOM at 8s, 20s and
 * 40s, leaving a blank IDE with no error and no way back.
 *
 * Two defects stacked up behind that blank screen:
 *
 *  1. The API answers `503 DATABASE_PROVISION_UNAVAILABLE` with a `reason` (the
 *     environment is missing its shared-tenant secret). The panel route
 *     flattened that into the catch-all "the panel service is temporarily
 *     unavailable, please retry" — advice that is false, because no retry can
 *     succeed until the platform is configured.
 *  2. The failure was THROWN as a Response, so the panel unmounted instead of
 *     rendering its own failure state — which already exists (DatabasePanel
 *     renders `ok === false` in a `role="alert"` block); it simply never
 *     received the payload.
 */
const UPSTREAM_503 = {
  ok: false,
  error: 'Managed database provisioning is unavailable.',
  code: 'DATABASE_PROVISION_UNAVAILABLE',
  reason: 'SHARED_TENANT_UNAVAILABLE',
};

describe('IDE panel actions keep a failure the user can act on', () => {
  it('preserves DATABASE_PROVISION_UNAVAILABLE, its message and its reason', () => {
    const failure = actionablePanelFailure(UPSTREAM_503);

    expect(failure).toBeDefined();
    expect(failure!.ok).toBe(false);
    expect(failure!.code).toBe('DATABASE_PROVISION_UNAVAILABLE');
    expect(failure!.error).toBe('Managed database provisioning is unavailable.');
    expect((failure as { reason?: string }).reason).toBe('SHARED_TENANT_UNAVAILABLE');

    // The wording that sent users into a retry loop that could never succeed.
    expect(JSON.stringify(failure)).not.toContain('PANEL_REQUEST_FAILED');
  });

  it('preserves a disabled feature, which retrying cannot fix either', () => {
    const failure = actionablePanelFailure({ code: 'FEATURE_NOT_ENABLED', error: 'Rollback is disabled.' });

    expect(failure?.code).toBe('FEATURE_NOT_ENABLED');
    expect(failure?.error).toBe('Rollback is disabled.');
  });

  it('falls back to the code when the upstream message is empty, never to an empty string', () => {
    expect(actionablePanelFailure({ code: 'FEATURE_NOT_ENABLED', error: '   ' })?.error).toBe('FEATURE_NOT_ENABLED');
    expect(actionablePanelFailure({ code: 'FEATURE_NOT_ENABLED' })?.error).toBe('FEATURE_NOT_ENABLED');
  });

  it('omits `reason` entirely when upstream did not name one', () => {
    expect(actionablePanelFailure({ code: 'DATABASE_PROVISION_UNAVAILABLE' })).not.toHaveProperty('reason');
  });

  it('leaves every other failure masked, so no internal detail leaks', () => {
    expect(actionablePanelFailure({ code: 'SOMETHING_INTERNAL', error: 'boom' })).toBeUndefined();
    expect(actionablePanelFailure({ error: 'boom' })).toBeUndefined();
    expect(actionablePanelFailure(undefined)).toBeUndefined();
    expect(actionablePanelFailure('not json')).toBeUndefined();
  });

  it('keeps the pass-through list deliberately small', () => {
    expect([...ACTIONABLE_PANEL_CODES].sort()).toEqual(['DATABASE_PROVISION_UNAVAILABLE', 'FEATURE_NOT_ENABLED']);
  });
});
