import { describe, expect, it, vi } from 'vitest';
import { ImportOperationLeaseLostError, ImportOperationLeaseManager } from './import-operation-lease.js';

describe('ImportOperationLeaseManager', () => {
  it('renews well before TTL and validates the exact token/state', async () => {
    vi.useFakeTimers();

    const renewImportJobLease = vi.fn().mockResolvedValue({ id: 'import-1' });
    const validateImportJobLease = vi.fn().mockResolvedValue(true);

    const manager = new ImportOperationLeaseManager(
      { renewImportJobLease, validateImportJobLease },
      { id: 'import-1', organizationId: 'org-1', operationToken: 'token-1', state: 'COMMITTING' },
      5_000,
      500,
      'IMPORT_COMMIT_OWNERSHIP_LOST',
    );

    manager.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(renewImportJobLease).toHaveBeenCalledWith(
      expect.objectContaining({ operationToken: 'token-1', expectedStates: ['COMMITTING'] }),
    );
    await manager.guard();
    expect(validateImportJobLease).toHaveBeenCalledTimes(1);
    await manager.stop();
    vi.useRealTimers();
  });

  it('becomes permanently lost after a failed renewal', async () => {
    vi.useFakeTimers();

    const manager = new ImportOperationLeaseManager(
      { renewImportJobLease: vi.fn().mockResolvedValue(undefined), validateImportJobLease: vi.fn() },
      { id: 'import-2', organizationId: 'org-2', operationToken: 'token-2', state: 'CLEANUP_PENDING' },
      5_000,
      500,
      'IMPORT_CLEANUP_OWNERSHIP_LOST',
    );

    manager.start();
    await vi.advanceTimersByTimeAsync(500);
    await expect(manager.guard()).rejects.toEqual(
      expect.objectContaining<Partial<ImportOperationLeaseLostError>>({
        code: 'IMPORT_CLEANUP_OWNERSHIP_LOST',
        statusCode: 409,
      }),
    );
    await manager.stop();
    vi.useRealTimers();
  });
});
