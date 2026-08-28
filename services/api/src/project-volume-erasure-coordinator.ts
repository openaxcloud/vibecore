import { z } from 'zod';

export const projectVolumeErasureReceiptSchema = z.object({
  schemaVersion: z.literal('project-volume-erasure-receipt-v1'),
  operationId: z.string().min(1),
  projectId: z.string().min(1),
  organizationId: z.string().min(1),
  inventoryHash: z.string().regex(/^[a-f0-9]{64}$/u),
  verificationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  finalScanHash: z.string().regex(/^[a-f0-9]{64}$/u),
  quiescenceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  entryCount: z.number().int().nonnegative(),
  erasedEntryCount: z.number().int().nonnegative(),
  alreadyAbsentEntryCount: z.number().int().nonnegative(),
  persistentVolumeClaimsAbsent: z.literal(true),
  persistentVolumesAbsent: z.literal(true),
  providerVolumesAbsent: z.literal(true),
});

export type ProjectVolumeErasureReceipt = z.infer<typeof projectVolumeErasureReceiptSchema>;

export const projectVolumeErasureProgressSchema = z.object({
  schemaVersion: z.literal('workspace-project-erasure-progress-v1'),
  complete: z.literal(false),
  phase: z.enum(['kubernetes', 'volume-inventory', 'volume-erasure']),
  processed: z.number().int().nonnegative(),
  remaining: z.number().int().positive(),
});

export type ProjectVolumeErasureProgress = z.infer<typeof projectVolumeErasureProgressSchema>;

function isProjectVolumeErasureProgress(
  value: unknown,
): value is ProjectVolumeErasureProgress {
  return projectVolumeErasureProgressSchema.safeParse(value).success;
}

export interface ProjectVolumeErasureCoordinatorScope {
  operationId: string;
  projectId: string;
  organizationId: string;
}

/** Transport-free batch seam shared by hard-delete, account purge, and CNPG. */
export interface ProjectVolumeErasureBatchPort<TProof extends { volumes: unknown }> {
  advance(): Promise<TProof | ProjectVolumeErasureProgress>;
}

/**
 * Advances exactly one durably persisted batch. It never loops inside an API
 * timeout: callers replay the same deterministic ObjectStorageOperation until
 * a receipt is returned.
 */
export async function advanceProjectVolumeErasureSaga<TProof extends { volumes: unknown }>(input: {
  scope: ProjectVolumeErasureCoordinatorScope;
  assertLease: () => Promise<void>;
  port: ProjectVolumeErasureBatchPort<TProof>;
}): Promise<
  | { complete: false; progress: ProjectVolumeErasureProgress }
  | { complete: true; proof: TProof; receipt: ProjectVolumeErasureReceipt }
> {
  await input.assertLease();
  const result = await input.port.advance();
  await input.assertLease();
  if (isProjectVolumeErasureProgress(result)) {
    if (result.processed === 0) {
      throw Object.assign(new Error('Project volume erasure made no durable progress'), {
        code: 'PROJECT_VOLUME_ERASURE_STALLED',
        statusCode: 503,
      });
    }
    return { complete: false, progress: result };
  }
  const receipt = projectVolumeErasureReceiptSchema.parse(result.volumes);
  if (
    receipt.operationId !== input.scope.operationId ||
    receipt.projectId !== input.scope.projectId ||
    receipt.organizationId !== input.scope.organizationId ||
    receipt.erasedEntryCount + receipt.alreadyAbsentEntryCount !== receipt.entryCount
  ) {
    throw Object.assign(new Error('Project volume receipt does not match its durable operation scope'), {
      code: 'PROJECT_VOLUME_ERASURE_RECEIPT_MISMATCH',
      statusCode: 409,
    });
  }
  return { complete: true, proof: result, receipt };
}
