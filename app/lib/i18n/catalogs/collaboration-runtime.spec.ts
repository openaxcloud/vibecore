import { describe, expect, it } from 'vitest';

import { collaborationRuntimeEn, collaborationRuntimeFr, getCollaborationRuntimeCopy } from './collaboration-runtime';

describe('collaboration runtime copy', () => {
  it('keeps complete EN/FR catalogues and selects regional French locales', () => {
    expect(Object.keys(collaborationRuntimeFr).sort()).toEqual(Object.keys(collaborationRuntimeEn).sort());
    expect(getCollaborationRuntimeCopy('fr-CA')).toBe(collaborationRuntimeFr);
    expect(getCollaborationRuntimeCopy('de-DE')).toBe(collaborationRuntimeEn);
  });

  it('uses reviewed recovery copy without transport details', () => {
    expect(collaborationRuntimeFr['collaborationRuntime.connectionFailed']).toContain('Reconnexion');
    expect(JSON.stringify(collaborationRuntimeFr)).not.toMatch(/WebSocket URL|ticket|HTTP 500/iu);
  });
});
