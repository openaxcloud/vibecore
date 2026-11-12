import type { Storage } from '@google-cloud/storage';
import { clusterName, type DatabaseEnvironment } from './database-provisioner.js';

export class RestoreWalInventoryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Metadata only. Implementations must not download objects or change IAM. */
export interface WalMetadataReader {
  metadata(bucket: string, name: string): Promise<unknown>;
}

/** Uses only the caller's already-authorized GCS client; no credentials are created. */
export function gcsWalMetadataReader(storage: Pick<Storage, 'bucket'>): WalMetadataReader {
  return {
    async metadata(bucket, name) {
      const [metadata] = await storage.bucket(bucket).file(name).getMetadata();
      return metadata;
    },
  };
}

export interface WalInventoryInput {
  /** Trusted deployment configuration, never a client-supplied destination. */
  bucket: string;
  projectId: string;
  environment: DatabaseEnvironment;
  sourceName: string;
  sourceUid: string;
  provenanceId: string;

  /** From a verified backup manifest/recovery plan, not inferred from object listing. */
  firstSegment: string;
  lastSegment: string;
  walSegmentSizeBytes: number;
}

const MAX_SEGMENTS = 256;
const SEGMENT = /^[0-9A-F]{24}$/;

/** Same-timeline ranges only. Timeline transitions need separately verified history. */
export function planRestoreWalInventory(input: WalInventoryInput) {
  const size = input.walSegmentSizeBytes;

  if (
    !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(input.bucket) ||
    !/^[a-z0-9][a-z0-9-]{0,45}$/.test(input.projectId) ||
    !['development', 'production'].includes(input.environment) ||
    input.sourceName !== clusterName(input.projectId, input.environment) ||
    !input.sourceUid ||
    !input.provenanceId ||
    !SEGMENT.test(input.firstSegment) ||
    !SEGMENT.test(input.lastSegment) ||
    !Number.isSafeInteger(size) ||
    size < 1024 * 1024 ||
    size > 1024 * 1024 * 1024 ||
    (size & (size - 1)) !== 0
  ) {
    throw new RestoreWalInventoryError('RESTORE_WAL_PLAN_INVALID');
  }

  const timeline = input.firstSegment.slice(0, 8);

  if (timeline === '00000000' || timeline !== input.lastSegment.slice(0, 8)) {
    throw new RestoreWalInventoryError('RESTORE_WAL_TIMELINE_UNSUPPORTED');
  }

  const perLog = BigInt(0x100000000 / size);

  const ordinal = (segment: string) => {
    const index = BigInt(`0x${segment.slice(16)}`);

    if (index >= perLog) {
      throw new RestoreWalInventoryError('RESTORE_WAL_PLAN_INVALID');
    }

    return BigInt(`0x${segment.slice(8, 16)}`) * perLog + index;
  };

  const first = ordinal(input.firstSegment);
  const last = ordinal(input.lastSegment);

  if (last < first || last - first + 1n > BigInt(MAX_SEGMENTS)) {
    throw new RestoreWalInventoryError('RESTORE_WAL_RANGE_UNSUPPORTED');
  }

  const prefix = `db/${input.projectId}/${input.sourceName}/wals/`;
  const objects: string[] = [];

  for (let index = first; index <= last; index++) {
    const segment =
      timeline +
      (index / perLog).toString(16).toUpperCase().padStart(8, '0') +
      (index % perLog).toString(16).toUpperCase().padStart(8, '0');

    // Existing CNPG Barman configuration archives gzip WAL using the 16-char hash directory.
    objects.push(`${prefix}${segment.slice(0, 16)}/${segment}.gz`);
  }

  return { bucket: input.bucket, objects };
}

/**
 * Exact expected-object lookups, never a broad bucket listing. A missing object
 * or malformed metadata fails closed. Object existence is NOT WAL continuity:
 * the future verifier must download these exact generations, decompress and
 * verify PostgreSQL records/system identity before producing an ArchiveReceipt.
 */
export async function inventoryRestoreWal(reader: WalMetadataReader, input: WalInventoryInput) {
  input = { ...input };

  const plan = planRestoreWalInventory(input);
  const objects: Array<{ name: string; generation: string; size: string; crc32c: string }> = [];

  for (const name of plan.objects) {
    let value: unknown;

    try {
      value = await reader.metadata(plan.bucket, name);
    } catch {
      throw new RestoreWalInventoryError('RESTORE_WAL_METADATA_UNAVAILABLE');
    }

    const metadata =
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

    if (
      metadata.bucket !== plan.bucket ||
      metadata.name !== name ||
      typeof metadata.generation !== 'string' ||
      !/^[1-9][0-9]{0,19}$/.test(metadata.generation) ||
      typeof metadata.size !== 'string' ||
      !/^[1-9][0-9]{0,9}$/.test(metadata.size) ||
      BigInt(metadata.size) > BigInt(input.walSegmentSizeBytes) * 2n ||
      typeof metadata.crc32c !== 'string' ||
      !/^[A-Za-z0-9+/]{6}==$/.test(metadata.crc32c) ||
      metadata.timeDeleted !== undefined ||
      metadata.softDeleteTime !== undefined
    ) {
      throw new RestoreWalInventoryError('RESTORE_WAL_METADATA_INVALID');
    }

    objects.push({ name, generation: metadata.generation, size: metadata.size, crc32c: metadata.crc32c });
  }

  return {
    bucket: plan.bucket,
    sourceUid: input.sourceUid,
    provenanceId: input.provenanceId,
    objects,
    archiveVerified: false as const,
    walContinuityVerified: false as const,
  };
}
