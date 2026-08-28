import { describe, expect, it } from 'vitest';

import { advanceProjectVolumeErasureSaga } from './project-volume-erasure-coordinator.js';

describe('project volume erasure coordinator', () => {
  it('replays one persisted batch at a time and returns the same Retain-volume receipt to account purge', async () => {
    const scope = {
      operationId: 'account-purge:plan-1:project-1',
      projectId: 'project-1',
      organizationId: 'organization-1',
    };
    let invocation = 0;
    const port = {
      async advance() {
        invocation += 1;
        if (invocation === 1) {
          return {
            schemaVersion: 'workspace-project-erasure-progress-v1' as const,
            complete: false as const,
            phase: 'volume-erasure' as const,
            processed: 1,
            remaining: 1,
          };
        }
        return {
          volumes: {
            schemaVersion: 'project-volume-erasure-receipt-v1' as const,
            ...scope,
            inventoryHash: 'a'.repeat(64),
            verificationHash: 'b'.repeat(64),
            finalScanHash: 'c'.repeat(64),
            quiescenceHash: 'd'.repeat(64),
            entryCount: 2,
            erasedEntryCount: 1,
            alreadyAbsentEntryCount: 1,
            persistentVolumeClaimsAbsent: true as const,
            persistentVolumesAbsent: true as const,
            providerVolumesAbsent: true as const,
          },
        };
      },
    };

    await expect(
      advanceProjectVolumeErasureSaga({ scope, assertLease: async () => undefined, port }),
    ).resolves.toMatchObject({ complete: false, progress: { remaining: 1 } });
    await expect(
      advanceProjectVolumeErasureSaga({ scope, assertLease: async () => undefined, port }),
    ).resolves.toMatchObject({
      complete: true,
      receipt: { operationId: scope.operationId, erasedEntryCount: 1 },
    });
  });
});
