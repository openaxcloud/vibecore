import { describe, expect, it } from 'vitest';
import { previousRollbackTarget } from './publication';

const current = { id: 'failed', status: 'FAILED', provider: 'server', environment: 'production' };
const ready = { ...current, id: 'ready', status: 'READY' };
describe('rollback target matches the successful-target API contract', () => {
  it('restores a previous successful release after a failure', () => {
    expect(previousRollbackTarget([current, ready])?.id).toBe('ready');
  });
  it('does not restore a different environment, provider, or unavailable artifact', () => {
    expect(
      previousRollbackTarget([
        current,
        { ...ready, id: 'preview', environment: 'preview' },
        { ...ready, id: 'other-provider', provider: 'static' },
        { ...ready, id: 'unavailable', rollbackUnavailableReason: 'NO_RETAINED_DIGEST' },
        { ...ready, id: 'queued', status: 'QUEUED' },
        ready,
      ])?.id,
    ).toBe('ready');
  });
  it('does not offer the current successful release as its own previous release', () => {
    expect(previousRollbackTarget([ready])).toBeUndefined();
    expect(previousRollbackTarget([])).toBeUndefined();
  });
});
