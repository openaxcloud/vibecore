import { createHash } from 'node:crypto';

import { Prisma, type DatabaseClient } from '@vibecore/database';

type SqlClient = DatabaseClient | Prisma.TransactionClient;

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

export async function seedVerifiedEmptyProjectVolumeErasure(
  client: SqlClient,
  input: {
    operationId: string;
    projectId: string;
    organizationId: string;
    ownershipEpoch: number;
    fencingToken: bigint;
    namespace?: string;
  },
) {
  const sourceSnapshot = {
    snapshotId: input.operationId,
    completeness: 'all-active-references-for-candidate-claims',
    candidates: [],
    references: [],
  };
  const unsignedInventory = {
    schemaVersion: 1,
    scope: { organizationId: input.organizationId, projectId: input.projectId },
    referenceSnapshotHash: sha256(sourceSnapshot),
    entries: [],
  };
  const inventory = { ...unsignedInventory, inventoryHash: sha256(unsignedInventory) };
  const unsignedEvidence = {
    schemaVersion: 1,
    inventoryHash: inventory.inventoryHash,
    entries: [],
    verified: true,
  };
  const evidence = { ...unsignedEvidence, verificationHash: sha256(unsignedEvidence) };
  const quiescenceSnapshot = {
    schemaVersion: 1,
    projectId: input.projectId,
    organizationId: input.organizationId,
    ownershipEpoch: input.ownershipEpoch,
    effects: [],
  };
  const quiescenceHash = sha256(quiescenceSnapshot);
  const unsignedFinalScan = {
    schemaVersion: 1,
    inventoryHash: inventory.inventoryHash,
    quiescenceHash,
    inspectedProviderVolumeCount: 0,
    persistentVolumeListingComplete: true,
    verified: true,
  };
  const finalScanEvidence = { ...unsignedFinalScan, finalScanHash: sha256(unsignedFinalScan) };

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "ProjectVolumeErasure" (
      "operationId", "projectIdSnapshot", "organizationId", "ownershipEpoch", "namespace", "state",
      "sourceSnapshot", "inventory", "inventoryHash", "evidence", "verificationHash",
      "verificationFencingToken", "quiescenceSnapshot", "quiescenceHash", "finalScanEvidence",
      "finalScanHash", "finalScanFencingToken", "finalScannedAt", "inventoriedAt", "erasingAt",
      "verifiedAt", "updatedAt"
    ) VALUES (
      ${input.operationId}, ${input.projectId}, ${input.organizationId}, ${input.ownershipEpoch},
      ${input.namespace ?? 'workspaces'}, 'VERIFIED'::"ProjectVolumeErasureState",
      CAST(${JSON.stringify(sourceSnapshot)} AS jsonb), CAST(${JSON.stringify(inventory)} AS jsonb),
      ${inventory.inventoryHash}, CAST(${JSON.stringify(evidence)} AS jsonb), ${evidence.verificationHash},
      ${input.fencingToken}, CAST(${JSON.stringify(quiescenceSnapshot)} AS jsonb), ${quiescenceHash},
      CAST(${JSON.stringify(finalScanEvidence)} AS jsonb), ${finalScanEvidence.finalScanHash},
      ${input.fencingToken}, clock_timestamp(), clock_timestamp(), clock_timestamp(), clock_timestamp(),
      clock_timestamp()
    )
    ON CONFLICT ("operationId") DO UPDATE SET
      "evidence" = EXCLUDED."evidence",
      "verificationHash" = EXCLUDED."verificationHash",
      "verificationFencingToken" = EXCLUDED."verificationFencingToken",
      "quiescenceSnapshot" = EXCLUDED."quiescenceSnapshot",
      "quiescenceHash" = EXCLUDED."quiescenceHash",
      "finalScanEvidence" = EXCLUDED."finalScanEvidence",
      "finalScanHash" = EXCLUDED."finalScanHash",
      "finalScanFencingToken" = EXCLUDED."finalScanFencingToken",
      "finalScannedAt" = clock_timestamp(),
      "verifiedAt" = clock_timestamp(),
      "updatedAt" = clock_timestamp()
  `);

  return {
    schemaVersion: 'project-volume-erasure-receipt-v1' as const,
    operationId: input.operationId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    inventoryHash: inventory.inventoryHash,
    verificationHash: evidence.verificationHash,
    finalScanHash: finalScanEvidence.finalScanHash,
    quiescenceHash,
    entryCount: 0,
    erasedEntryCount: 0,
    alreadyAbsentEntryCount: 0,
    persistentVolumeClaimsAbsent: true as const,
    persistentVolumesAbsent: true as const,
    providerVolumesAbsent: true as const,
  };
}
