import { createHash } from 'node:crypto';

import {
  objectStoragePinnedInventoryDigest,
  type ObjectStoragePinnedInventory,
  type ObjectStorageJsonObject,
  type ObjectStorageJsonValue,
  type ObjectStorageVerification,
} from './object-storage-operation.js';
import {
  OBJECT_STORAGE_LOCATION,
  assertValidObjectKey,
  ObjectStorageError,
  projectBucketName,
  type ObjectStorage,
  type ObjectStorageInventory,
} from './object-storage.js';
import { appPublicEnglish } from './app-public-copy.js';

export type TenantObjectStorageCommand =
  | { type: 'ENSURE_BUCKET'; projectId: string; bucketExistedBefore?: boolean }
  | { type: 'DELETE_BUCKET'; projectId: string; bucketExistedBefore?: boolean }
  | {
      type: 'MOVE_OBJECT';
      projectId: string;
      from: string;
      to: string;
      sourceGeneration: string;
      sourceContentHash: string;
    }
  | {
      type: 'DELETE_OBJECT';
      projectId: string;
      key: string;
      objectExistedBefore?: boolean;
      expectedObjectGeneration?: string | null;
    }
  | {
      type: 'DELETE_PREFIX';
      projectId: string;
      prefix: string;
      prefixObjectCountBefore?: number;
      prefixInventoryDigest?: string;
      prefixVersionCountBefore?: number;
      prefixVersionInventoryDigest?: string;
    }
  | {
      type: 'PUT_OBJECT';
      projectId: string;
      key: string;
      body: Uint8Array;
      contentType?: string;
      /** Null means create-only; a value means compare-and-swap that exact live generation. */
      expectedTargetGeneration: string | null;
    }
  | {
      type: 'CLONE_PROJECT';
      sourceProjectId: string;
      targetProjectId: string;
      inventory: ObjectStorageInventory;
      /** Provider state pinned while source and target physical barriers are held. */
      targetBucketExistedBefore?: boolean;
      targetObjectCountBefore?: number;
      targetInventoryDigest?: string;
    };

export type TenantObjectStorageCommandIntent =
  | Omit<Extract<TenantObjectStorageCommand, { type: 'ENSURE_BUCKET' | 'DELETE_BUCKET' }>, 'bucketExistedBefore'>
  | Omit<
      Extract<TenantObjectStorageCommand, { type: 'DELETE_OBJECT' }>,
      'objectExistedBefore' | 'expectedObjectGeneration'
    >
  | Omit<
      Extract<TenantObjectStorageCommand, { type: 'DELETE_PREFIX' }>,
      'prefixObjectCountBefore' | 'prefixInventoryDigest' | 'prefixVersionCountBefore' | 'prefixVersionInventoryDigest'
    >
  | Omit<Extract<TenantObjectStorageCommand, { type: 'MOVE_OBJECT' }>, 'sourceGeneration' | 'sourceContentHash'>
  | Omit<Extract<TenantObjectStorageCommand, { type: 'PUT_OBJECT' }>, 'expectedTargetGeneration'>;

function assertExactObjectKey(key: string): void {
  if (assertValidObjectKey(key) !== key) {
    throw new ObjectStorageError('Object keys must not contain surrounding whitespace', 'INVALID_KEY');
  }
}

/** Reject malformed provider commands before a durable operation can be claimed. */
export function assertValidObjectStorageCommandIntent(intent: TenantObjectStorageCommandIntent): void {
  switch (intent.type) {
    case 'ENSURE_BUCKET':
    case 'DELETE_BUCKET':
      return;
    case 'MOVE_OBJECT':
      assertExactObjectKey(intent.from);
      assertExactObjectKey(intent.to);
      if (intent.from === intent.to) {
        throw new ObjectStorageError('Source and target object keys must differ', 'INVALID_KEY');
      }
      return;
    case 'DELETE_OBJECT':
      assertExactObjectKey(intent.key);
      return;
    case 'DELETE_PREFIX':
      assertExactObjectKey(intent.prefix);
      return;
    case 'PUT_OBJECT':
      assertExactObjectKey(intent.key);
      return;
    default:
      return exhaustive(intent);
  }
}

export function assertValidObjectStorageCommand(command: TenantObjectStorageCommand): void {
  if (command.type === 'CLONE_PROJECT') {
    for (const object of command.inventory.objects) assertExactObjectKey(object.key);
    return;
  }
  assertValidObjectStorageCommandIntent(command);
}

type ObjectStorageObjectCollection = {
  objects: Array<ObjectStorageInventory['objects'][number]>;
};

function exactInventoryObject(inventory: ObjectStorageObjectCollection, key: string) {
  return inventory.objects.find((object) => object.key === key);
}

function mutationInventoryDigest(inventory: ObjectStorageObjectCollection): string {
  const objects = [...inventory.objects]
    .map(({ key, size, generation, contentHash }) => ({ key, size, generation, contentHash }))
    .sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        String(left.generation).localeCompare(String(right.generation)) ||
        String(left.contentHash).localeCompare(String(right.contentHash)) ||
        left.size - right.size,
    );
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex');
}

async function listObjectVersions(storage: ObjectStorage, projectId: string, prefix: string) {
  if (!storage.listObjectVersions) {
    throw new ObjectStorageError(
      'Object generation history cannot be inspected',
      'VERSION_HISTORY_INSPECTION_REQUIRED',
    );
  }
  return storage.listObjectVersions(projectId, { prefix });
}

function exactInventoriesEqual(expected: ObjectStorageInventory, actual: ObjectStorageInventory): boolean {
  return (
    expected.bucketExists === actual.bucketExists &&
    expected.objects.length === actual.objects.length &&
    mutationInventoryDigest(expected) === mutationInventoryDigest(actual)
  );
}

/** Pin live generations while the caller retains the project physical/NFS fence. */
export async function pinObjectStorageCommandIntent(
  storage: ObjectStorage,
  intent: TenantObjectStorageCommandIntent,
): Promise<TenantObjectStorageCommand> {
  assertValidObjectStorageCommandIntent(intent);

  if (intent.type === 'ENSURE_BUCKET' || intent.type === 'DELETE_BUCKET') {
    return { ...intent, bucketExistedBefore: await storage.bucketExists(intent.projectId) };
  }

  if (intent.type === 'DELETE_OBJECT') {
    const inventory = await storage.listObjects(intent.projectId, { prefix: intent.key });
    const object = exactInventoryObject(inventory, intent.key);
    if (object && !object.generation) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_TARGET_UNPINNABLE'), 'TARGET_UNPINNABLE');
    }
    return {
      ...intent,
      objectExistedBefore: Boolean(object),
      expectedObjectGeneration: object?.generation ?? null,
    };
  }

  if (intent.type === 'DELETE_PREFIX') {
    const [inventory, versions] = await Promise.all([
      storage.listObjects(intent.projectId, { prefix: intent.prefix }),
      listObjectVersions(storage, intent.projectId, intent.prefix),
    ]);
    return {
      ...intent,
      prefixObjectCountBefore: inventory.objects.length,
      prefixInventoryDigest: mutationInventoryDigest(inventory),
      prefixVersionCountBefore: versions.objects.length,
      prefixVersionInventoryDigest: mutationInventoryDigest(versions),
    };
  }

  if (intent.type === 'MOVE_OBJECT') {
    const [sourceInventory, targetInventory] = await Promise.all([
      storage.listObjects(intent.projectId, { prefix: intent.from }),
      storage.listObjects(intent.projectId, { prefix: intent.to }),
    ]);
    const source = exactInventoryObject(sourceInventory, intent.from);
    if (!source?.generation || !source.contentHash) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_SOURCE_UNPINNABLE'), 'SOURCE_UNPINNABLE');
    }
    if (exactInventoryObject(targetInventory, intent.to)) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return {
      ...intent,
      sourceGeneration: source.generation,
      sourceContentHash: source.contentHash,
    };
  }

  if (intent.type === 'PUT_OBJECT') {
    const inventory = await storage.listObjects(intent.projectId, { prefix: intent.key });
    const target = exactInventoryObject(inventory, intent.key);
    if (target && !target.generation) {
      throw new ObjectStorageError(appPublicEnglish('OBJECT_STORAGE_TARGET_UNPINNABLE'), 'TARGET_UNPINNABLE');
    }
    return { ...intent, expectedTargetGeneration: target?.generation ?? null };
  }

  return intent;
}

/** Re-pin a caller-supplied command; supplied live observations are never trusted. */
export async function pinObjectStorageCommand(
  storage: ObjectStorage,
  command: TenantObjectStorageCommand,
): Promise<TenantObjectStorageCommand> {
  if (command.type === 'CLONE_PROJECT') {
    const [source, target] = await Promise.all([
      storage.inventoryProjectObjects(command.sourceProjectId),
      storage.inventoryProjectObjects(command.targetProjectId),
    ]);
    if (!exactInventoriesEqual(command.inventory, source)) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_SOURCE_PRECONDITION_CHANGED'),
        'SOURCE_PRECONDITION_CHANGED',
      );
    }
    if (target.bucketExists || target.objects.length > 0) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return {
      ...command,
      targetBucketExistedBefore: target.bucketExists,
      targetObjectCountBefore: target.objects.length,
      targetInventoryDigest: mutationInventoryDigest(target),
    };
  }
  return pinObjectStorageCommandIntent(storage, command);
}

/**
 * Last read-only provider check before EFFECT_STARTED. A deterministic mismatch
 * can therefore fail safe without leaving an ambiguous durable freeze.
 */
export async function assertObjectStorageCommandPreconditions(
  storage: ObjectStorage,
  command: TenantObjectStorageCommand,
): Promise<void> {
  assertValidObjectStorageCommand(command);
  if (command.type === 'CLONE_PROJECT') {
    if (
      typeof command.targetBucketExistedBefore !== 'boolean' ||
      command.targetObjectCountBefore === undefined ||
      command.targetInventoryDigest === undefined
    ) {
      throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
    }
    const [source, target] = await Promise.all([
      storage.inventoryProjectObjects(command.sourceProjectId),
      storage.inventoryProjectObjects(command.targetProjectId),
    ]);
    if (!exactInventoriesEqual(command.inventory, source)) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_SOURCE_PRECONDITION_CHANGED'),
        'SOURCE_PRECONDITION_CHANGED',
      );
    }
    if (
      target.bucketExists !== command.targetBucketExistedBefore ||
      target.objects.length !== command.targetObjectCountBefore ||
      mutationInventoryDigest(target) !== command.targetInventoryDigest
    ) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return;
  }

  if (command.type === 'ENSURE_BUCKET' || command.type === 'DELETE_BUCKET') {
    if (
      typeof command.bucketExistedBefore !== 'boolean' ||
      (await storage.bucketExists(command.projectId)) !== command.bucketExistedBefore
    ) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return;
  }

  if (command.type === 'DELETE_OBJECT') {
    const inventory = await storage.listObjects(command.projectId, { prefix: command.key });
    const object = exactInventoryObject(inventory, command.key);
    if (
      typeof command.objectExistedBefore !== 'boolean' ||
      command.expectedObjectGeneration === undefined ||
      Boolean(object) !== command.objectExistedBefore ||
      (object?.generation ?? null) !== command.expectedObjectGeneration
    ) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return;
  }

  if (command.type === 'DELETE_PREFIX') {
    const [inventory, versions] = await Promise.all([
      storage.listObjects(command.projectId, { prefix: command.prefix }),
      listObjectVersions(storage, command.projectId, command.prefix),
    ]);
    if (
      command.prefixObjectCountBefore === undefined ||
      command.prefixInventoryDigest === undefined ||
      command.prefixVersionCountBefore === undefined ||
      command.prefixVersionInventoryDigest === undefined ||
      inventory.objects.length !== command.prefixObjectCountBefore ||
      mutationInventoryDigest(inventory) !== command.prefixInventoryDigest ||
      versions.objects.length !== command.prefixVersionCountBefore ||
      mutationInventoryDigest(versions) !== command.prefixVersionInventoryDigest
    ) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return;
  }

  if (command.type === 'MOVE_OBJECT') {
    const [sourceInventory, targetInventory] = await Promise.all([
      storage.listObjects(command.projectId, { prefix: command.from }),
      storage.listObjects(command.projectId, { prefix: command.to }),
    ]);
    const source = exactInventoryObject(sourceInventory, command.from);
    const target = exactInventoryObject(targetInventory, command.to);
    if (source?.generation !== command.sourceGeneration || source.contentHash !== command.sourceContentHash) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_SOURCE_PRECONDITION_CHANGED'),
        'SOURCE_PRECONDITION_CHANGED',
      );
    }
    if (target) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
    return;
  }

  if (command.type === 'PUT_OBJECT') {
    const inventory = await storage.listObjects(command.projectId, { prefix: command.key });
    const target = exactInventoryObject(inventory, command.key);
    if (
      (command.expectedTargetGeneration === null && target) ||
      (command.expectedTargetGeneration !== null && target?.generation !== command.expectedTargetGeneration)
    ) {
      throw new ObjectStorageError(
        appPublicEnglish('OBJECT_STORAGE_TARGET_PRECONDITION_CHANGED'),
        'TARGET_PRECONDITION_CHANGED',
      );
    }
  }
}

export type ObjectStorageCommandExecution =
  | { type: 'ENSURE_BUCKET'; result: Awaited<ReturnType<ObjectStorage['ensureBucket']>> }
  | { type: 'DELETE_BUCKET'; result: Awaited<ReturnType<ObjectStorage['deleteBucket']>> }
  | { type: 'MOVE_OBJECT'; result: Awaited<ReturnType<ObjectStorage['moveObject']>> }
  | { type: 'DELETE_OBJECT'; result: Awaited<ReturnType<ObjectStorage['deleteObject']>> }
  | { type: 'DELETE_PREFIX'; result: Awaited<ReturnType<ObjectStorage['deletePrefix']>> }
  | {
      type: 'PUT_OBJECT';
      result: Awaited<ReturnType<ObjectStorage['putObject']>> & { expectedContentHash: string };
    }
  | {
      type: 'CLONE_PROJECT';
      result: { bucketExists: boolean; objectCount: number; inventoryDigest: string };
    };

export interface ObjectStorageCommandReceipt extends ObjectStorageJsonObject {
  schemaVersion: 'tenant-object-storage-command-v1';
  command: string;
  execution: ObjectStorageJsonValue;
}

function exhaustive(value: never): never {
  throw new TypeError(`Unsupported object-storage command: ${JSON.stringify(value)}`);
}

export function objectStorageCommandIdentity(command: TenantObjectStorageCommand): ObjectStorageJsonObject {
  switch (command.type) {
    case 'ENSURE_BUCKET':
    case 'DELETE_BUCKET': {
      if (typeof command.bucketExistedBefore !== 'boolean') {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      return {
        command: command.type,
        projectId: command.projectId,
        bucketExistedBefore: command.bucketExistedBefore,
      };
    }
    case 'MOVE_OBJECT':
      return {
        command: command.type,
        projectId: command.projectId,
        from: command.from,
        to: command.to,
        sourceGeneration: command.sourceGeneration,
        sourceContentHash: command.sourceContentHash,
        targetPrecondition: 'CREATE_ONLY',
      };
    case 'DELETE_OBJECT': {
      if (typeof command.objectExistedBefore !== 'boolean' || command.expectedObjectGeneration === undefined) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      return {
        command: command.type,
        projectId: command.projectId,
        key: command.key,
        objectExistedBefore: command.objectExistedBefore,
        expectedObjectGeneration: command.expectedObjectGeneration,
      };
    }
    case 'DELETE_PREFIX': {
      if (
        command.prefixObjectCountBefore === undefined ||
        command.prefixInventoryDigest === undefined ||
        command.prefixVersionCountBefore === undefined ||
        command.prefixVersionInventoryDigest === undefined
      ) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      return {
        command: command.type,
        projectId: command.projectId,
        prefix: command.prefix,
        prefixObjectCountBefore: command.prefixObjectCountBefore,
        prefixInventoryDigest: command.prefixInventoryDigest,
        prefixVersionCountBefore: command.prefixVersionCountBefore,
        prefixVersionInventoryDigest: command.prefixVersionInventoryDigest,
      };
    }
    case 'PUT_OBJECT':
      return {
        command: command.type,
        projectId: command.projectId,
        key: command.key,
        contentType: command.contentType ?? null,
        expectedContentHash: `sha256:${createHash('sha256').update(command.body).digest('hex')}`,
        byteLength: command.body.byteLength,
        expectedTargetGeneration: command.expectedTargetGeneration,
      };
    case 'CLONE_PROJECT': {
      const pinnedInventory = objectStorageCommandPinnedInventory(command)!;
      if (
        typeof command.targetBucketExistedBefore !== 'boolean' ||
        command.targetObjectCountBefore === undefined ||
        command.targetInventoryDigest === undefined
      ) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      return {
        command: command.type,
        sourceProjectId: command.sourceProjectId,
        targetProjectId: command.targetProjectId,
        inventoryDigest: objectStoragePinnedInventoryDigest(pinnedInventory),
        objectCount: pinnedInventory.objects.length,
        sourceBucketExists: pinnedInventory.bucketExists,
        targetBucketExistedBefore: command.targetBucketExistedBefore,
        targetObjectCountBefore: command.targetObjectCountBefore,
        targetInventoryDigest: command.targetInventoryDigest,
      };
    }
    default:
      return exhaustive(command);
  }
}

/** Stable identity for replay before the target provider state is re-pinned. */
export function objectStorageCloneIntentHash(
  command: Extract<TenantObjectStorageCommand, { type: 'CLONE_PROJECT' }>,
): string {
  const pinnedInventory = objectStorageCommandPinnedInventory(command)!;
  return createHash('sha256')
    .update(
      JSON.stringify({
        command: command.type,
        sourceProjectId: command.sourceProjectId,
        targetProjectId: command.targetProjectId,
        sourceBucketExists: pinnedInventory.bucketExists,
        sourceObjectCount: pinnedInventory.objects.length,
        sourceInventoryDigest: objectStoragePinnedInventoryDigest(pinnedInventory),
      }),
    )
    .digest('hex');
}

/** Stable HTTP/job intent identity. Live provider generations are deliberately excluded. */
export function objectStorageCommandIntentHash(intent: TenantObjectStorageCommandIntent): string {
  let identity: ObjectStorageJsonObject;
  switch (intent.type) {
    case 'ENSURE_BUCKET':
    case 'DELETE_BUCKET':
      identity = { command: intent.type, projectId: intent.projectId };
      break;
    case 'MOVE_OBJECT':
      identity = { command: intent.type, projectId: intent.projectId, from: intent.from, to: intent.to };
      break;
    case 'DELETE_OBJECT':
      identity = { command: intent.type, projectId: intent.projectId, key: intent.key };
      break;
    case 'DELETE_PREFIX':
      identity = { command: intent.type, projectId: intent.projectId, prefix: intent.prefix };
      break;
    case 'PUT_OBJECT':
      identity = {
        command: intent.type,
        projectId: intent.projectId,
        key: intent.key,
        contentType: intent.contentType ?? null,
        expectedContentHash: `sha256:${createHash('sha256').update(intent.body).digest('hex')}`,
        byteLength: intent.body.byteLength,
      };
      break;
    default:
      return exhaustive(intent);
  }
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function objectStorageCommandProjectIds(command: TenantObjectStorageCommand): string[] {
  return command.type === 'CLONE_PROJECT' ? [command.sourceProjectId, command.targetProjectId] : [command.projectId];
}

export function objectStorageCommandMutationProjectIds(command: TenantObjectStorageCommand): string[] {
  return command.type === 'CLONE_PROJECT' ? [command.targetProjectId] : [command.projectId];
}

export function objectStorageCommandPinnedInventory(
  command: TenantObjectStorageCommand,
): ObjectStoragePinnedInventory | undefined {
  if (command.type !== 'CLONE_PROJECT') return undefined;
  return {
    bucketExists: command.inventory.bucketExists,
    objects: command.inventory.objects.map((object) => {
      if (!object.generation || !object.contentHash) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_SOURCE_UNPINNABLE');
      }
      return {
        key: object.key,
        size: object.size,
        generation: object.generation,
        contentHash: object.contentHash,
      };
    }),
  };
}

function jsonClone(value: unknown): ObjectStorageJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  return JSON.parse(serialized) as ObjectStorageJsonValue;
}

export function objectStorageCommandReceipt(
  command: TenantObjectStorageCommand,
  execution: ObjectStorageCommandExecution,
): ObjectStorageCommandReceipt {
  if (command.type !== execution.type) throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_MISMATCH');
  return objectStorageCommandReceiptFromExecution(execution);
}

export function objectStorageCommandReceiptFromExecution(
  execution: ObjectStorageCommandExecution,
): ObjectStorageCommandReceipt {
  return {
    schemaVersion: 'tenant-object-storage-command-v1',
    command: execution.type,
    execution: jsonClone(execution),
  };
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  return value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record, key);
  if (value === undefined) throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  }
  return value;
}

function storageInventorySummary(inventory: ObjectStorageInventory) {
  const objects = [...inventory.objects]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ key, size, generation, contentHash }) => ({ key, size, generation, contentHash }));
  return {
    bucketExists: inventory.bucketExists,
    objectCount: objects.length,
    inventoryDigest: createHash('sha256')
      .update(JSON.stringify({ bucketExists: inventory.bucketExists, objects }))
      .digest('hex'),
  };
}

/** Parse an untrusted durable receipt before returning a replay to a caller. */
export function parseObjectStorageCommandReceipt(
  command: TenantObjectStorageCommand,
  value: unknown,
): ObjectStorageCommandExecution {
  return parseObjectStorageCommandReceiptByType(command.type, value);
}

/** Parse a durable replay before live provider pins are re-read. */
export function parseObjectStorageCommandReceiptByType(
  commandType: TenantObjectStorageCommand['type'],
  value: unknown,
): ObjectStorageCommandExecution {
  const receipt = objectRecord(value);
  const execution = objectRecord(receipt?.execution);
  if (
    receipt?.schemaVersion !== 'tenant-object-storage-command-v1' ||
    receipt.command !== commandType ||
    !execution ||
    execution.type !== commandType
  ) {
    throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');
  }
  const result = objectRecord(execution.result);
  if (!result) throw new TypeError('OBJECT_STORAGE_COMMAND_RECEIPT_INVALID');

  switch (commandType) {
    case 'ENSURE_BUCKET':
      return {
        type: commandType,
        result: {
          bucket: requiredString(result, 'bucket'),
          created: requiredBoolean(result, 'created'),
          location: requiredString(result, 'location'),
        },
      };
    case 'DELETE_BUCKET':
      return {
        type: commandType,
        result: { deleted: requiredBoolean(result, 'deleted'), bucket: requiredString(result, 'bucket') },
      };
    case 'MOVE_OBJECT': {
      const generation = optionalString(result, 'generation');
      return {
        type: commandType,
        result: {
          moved: requiredBoolean(result, 'moved'),
          key: requiredString(result, 'key'),
          ...(generation ? { generation } : {}),
        },
      };
    }
    case 'DELETE_OBJECT':
    case 'DELETE_PREFIX':
      return {
        type: commandType,
        result: { deleted: requiredBoolean(result, 'deleted'), count: requiredNumber(result, 'count') },
      };
    case 'PUT_OBJECT': {
      const generation = optionalString(result, 'generation');
      const contentHash = optionalString(result, 'contentHash');
      return {
        type: commandType,
        result: {
          key: requiredString(result, 'key'),
          size: requiredNumber(result, 'size'),
          expectedContentHash: requiredString(result, 'expectedContentHash'),
          ...(generation ? { generation } : {}),
          ...(contentHash ? { contentHash } : {}),
        },
      };
    }
    case 'CLONE_PROJECT':
      return {
        type: commandType,
        result: {
          bucketExists: requiredBoolean(result, 'bucketExists'),
          objectCount: requiredNumber(result, 'objectCount'),
          inventoryDigest: requiredString(result, 'inventoryDigest'),
        },
      };
    default:
      return exhaustive(commandType);
  }
}

function persistedString(payload: ObjectStorageJsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PAYLOAD_INVALID');
  }
  return value;
}

function persistedNumber(payload: ObjectStorageJsonObject, key: string): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PAYLOAD_INVALID');
  }
  return value;
}

function persistedBoolean(payload: ObjectStorageJsonObject, key: string): boolean {
  const value = payload[key];
  if (typeof value !== 'boolean') throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PAYLOAD_INVALID');
  return value;
}

function persistedNullableString(payload: ObjectStorageJsonObject, key: string): string | null {
  const value = payload[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PAYLOAD_INVALID');
  }
  return value;
}

function objectStorageCommandError(code: Parameters<typeof appPublicEnglish>[0]): Error & { code: string } {
  return Object.assign(new Error(appPublicEnglish(code)), { code });
}

async function assertBucketVersioningEnabled(storage: ObjectStorage, projectId: string): Promise<void> {
  if (!storage.bucketVersioningEnabled || !(await storage.bucketVersioningEnabled(projectId))) {
    throw objectStorageCommandError('OBJECT_STORAGE_BUCKET_VERSIONING_VERIFICATION_FAILED');
  }
}

export async function recoverPersistedObjectStorageCommand(
  storage: ObjectStorage,
  input: {
    payload: ObjectStorageJsonObject;
    pinnedInventory?: ObjectStoragePinnedInventory;
  },
): Promise<{ execution: ObjectStorageCommandExecution; verification: ObjectStorageVerification }> {
  const command = persistedString(input.payload, 'command');
  const projectId =
    command === 'CLONE_PROJECT'
      ? persistedString(input.payload, 'targetProjectId')
      : persistedString(input.payload, 'projectId');
  let execution: ObjectStorageCommandExecution;
  let evidence: ObjectStorageJsonObject;

  switch (command) {
    case 'ENSURE_BUCKET': {
      if (!(await storage.bucketExists(projectId))) {
        throw objectStorageCommandError('OBJECT_STORAGE_BUCKET_NOT_PROVISIONED');
      }
      await assertBucketVersioningEnabled(storage, projectId);
      const bucketExistedBefore = persistedBoolean(input.payload, 'bucketExistedBefore');
      execution = {
        type: command,
        result: {
          bucket: projectBucketName(projectId),
          created: !bucketExistedBefore,
          location: OBJECT_STORAGE_LOCATION,
        },
      };
      evidence = { bucketExists: true, bucketVersioningEnabled: true };
      break;
    }
    case 'DELETE_BUCKET': {
      if (await storage.bucketExists(projectId)) {
        throw objectStorageCommandError('OBJECT_STORAGE_BUCKET_DELETE_INCOMPLETE');
      }
      execution = {
        type: command,
        result: {
          bucket: projectBucketName(projectId),
          deleted: persistedBoolean(input.payload, 'bucketExistedBefore'),
        },
      };
      evidence = { bucketAbsent: true, objectCount: 0 };
      break;
    }
    case 'MOVE_OBJECT': {
      const from = persistedString(input.payload, 'from');
      const to = persistedString(input.payload, 'to');
      const expectedHash = persistedString(input.payload, 'sourceContentHash');
      const [source, target] = await Promise.all([
        storage.listObjects(projectId, { prefix: from }),
        storage.listObjects(projectId, { prefix: to }),
      ]);
      const sourceObject = exactObject(source.objects, from);
      const targetObject = exactObject(target.objects, to);
      if (sourceObject || !targetObject?.generation || targetObject.contentHash !== expectedHash) {
        throw objectStorageCommandError('OBJECT_STORAGE_MOVE_VERIFICATION_FAILED');
      }
      execution = {
        type: command,
        result: { moved: true, key: to, generation: targetObject.generation },
      };
      evidence = {
        sourceAbsent: true,
        sourceGeneration: persistedString(input.payload, 'sourceGeneration'),
        targetGeneration: targetObject.generation,
        contentHash: expectedHash,
      };
      break;
    }
    case 'DELETE_OBJECT': {
      const key = persistedString(input.payload, 'key');
      const listed = await storage.listObjects(projectId, { prefix: key });
      if (exactObject(listed.objects, key)) {
        throw objectStorageCommandError('OBJECT_STORAGE_DELETE_VERIFICATION_FAILED');
      }
      const objectExistedBefore = persistedBoolean(input.payload, 'objectExistedBefore');
      execution = {
        type: command,
        result: { deleted: objectExistedBefore, count: objectExistedBefore ? 1 : 0 },
      };
      evidence = { objectAbsent: true };
      break;
    }
    case 'DELETE_PREFIX': {
      const prefix = persistedString(input.payload, 'prefix');
      const listed = await listObjectVersions(storage, projectId, prefix);
      if (listed.objects.length > 0) {
        throw objectStorageCommandError('OBJECT_STORAGE_PREFIX_DELETE_INCOMPLETE');
      }
      const count = persistedNumber(input.payload, 'prefixObjectCountBefore');
      const deletedVersionCount = persistedNumber(input.payload, 'prefixVersionCountBefore');
      execution = { type: command, result: { deleted: true, count } };
      evidence = {
        prefixAbsent: true,
        allVersionsAbsent: true,
        remainingObjectCount: 0,
        remainingVersionCount: 0,
        deletedVersionCount,
        prefixInventoryDigest: persistedString(input.payload, 'prefixInventoryDigest'),
        prefixVersionInventoryDigest: persistedString(input.payload, 'prefixVersionInventoryDigest'),
      };
      break;
    }
    case 'PUT_OBJECT': {
      const key = persistedString(input.payload, 'key');
      const expectedContentHash = persistedString(input.payload, 'expectedContentHash');
      const byteLength = persistedNumber(input.payload, 'byteLength');
      const expectedTargetGeneration = persistedNullableString(input.payload, 'expectedTargetGeneration');
      const listed = await storage.listObjects(projectId, { prefix: key });
      const object = exactObject(listed.objects, key);
      if (
        !object?.generation ||
        object.size !== byteLength ||
        object.contentHash !== expectedContentHash ||
        (expectedTargetGeneration !== null && object.generation === expectedTargetGeneration)
      ) {
        throw objectStorageCommandError('OBJECT_STORAGE_PUT_VERIFICATION_FAILED');
      }
      execution = {
        type: command,
        result: {
          key,
          size: byteLength,
          generation: object.generation,
          contentHash: expectedContentHash,
          expectedContentHash,
        },
      };
      evidence = {
        objectPresent: true,
        generation: object.generation,
        expectedTargetGeneration,
        expectedContentHash,
        providerContentHash: object.contentHash,
      };
      break;
    }
    case 'CLONE_PROJECT': {
      if (!input.pinnedInventory) throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_INVENTORY_REQUIRED');
      const actual = await storage.inventoryProjectObjects(projectId);
      const expected: ObjectStorageInventory = input.pinnedInventory;
      if (!inventoriesEquivalent(expected, actual)) {
        throw objectStorageCommandError('OBJECT_STORAGE_CLONE_VERIFICATION_FAILED');
      }
      const expectedDigest = objectStoragePinnedInventoryDigest(input.pinnedInventory);
      if (persistedString(input.payload, 'inventoryDigest') !== expectedDigest) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_INVENTORY_MISMATCH');
      }
      execution = { type: command, result: storageInventorySummary(actual) };
      evidence = { inventoryVerified: true, objectCount: actual.objects.length, inventoryDigest: expectedDigest };
      break;
    }
    default:
      throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_KIND_UNSUPPORTED');
  }

  return {
    execution,
    verification: {
      outcome: command === 'DELETE_BUCKET' ? 'VERIFIED_ABSENT' : 'VERIFIED',
      verifier: 'api-object-storage-recovery-v1',
      evidence,
    },
  };
}

export async function executeObjectStorageCommand(
  storage: ObjectStorage,
  command: TenantObjectStorageCommand,
  assertLease: () => Promise<void>,
): Promise<ObjectStorageCommandExecution> {
  await assertLease();
  switch (command.type) {
    case 'ENSURE_BUCKET': {
      if (typeof command.bucketExistedBefore !== 'boolean') {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      await storage.ensureBucket(command.projectId, assertLease);
      await assertLease();
      return {
        type: command.type,
        result: {
          bucket: projectBucketName(command.projectId),
          created: !command.bucketExistedBefore,
          location: OBJECT_STORAGE_LOCATION,
        },
      };
    }
    case 'DELETE_BUCKET': {
      if (typeof command.bucketExistedBefore !== 'boolean') {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      await storage.deleteBucket(command.projectId, assertLease);
      await assertLease();
      return {
        type: command.type,
        result: { bucket: projectBucketName(command.projectId), deleted: command.bucketExistedBefore },
      };
    }
    case 'MOVE_OBJECT': {
      const result = await storage.moveObject(
        command.projectId,
        {
          from: command.from,
          to: command.to,
          sourceGeneration: command.sourceGeneration,
        },
        assertLease,
      );
      await assertLease();
      return { type: command.type, result };
    }
    case 'DELETE_OBJECT': {
      if (typeof command.objectExistedBefore !== 'boolean' || command.expectedObjectGeneration === undefined) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      await storage.deleteObject(command.projectId, {
        key: command.key,
        ...(command.expectedObjectGeneration ? { generation: command.expectedObjectGeneration } : {}),
      });
      await assertLease();
      return {
        type: command.type,
        result: {
          deleted: command.objectExistedBefore,
          count: command.objectExistedBefore ? 1 : 0,
        },
      };
    }
    case 'DELETE_PREFIX': {
      if (
        command.prefixObjectCountBefore === undefined ||
        command.prefixInventoryDigest === undefined ||
        command.prefixVersionCountBefore === undefined ||
        command.prefixVersionInventoryDigest === undefined
      ) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      await storage.deletePrefix(command.projectId, { prefix: command.prefix }, assertLease);
      await assertLease();
      return {
        type: command.type,
        result: { deleted: true, count: command.prefixObjectCountBefore },
      };
    }
    case 'PUT_OBJECT': {
      const expectedContentHash = `sha256:${createHash('sha256').update(command.body).digest('hex')}`;
      const result = await storage.putObject(command.projectId, {
        key: command.key,
        body: command.body,
        ifGenerationMatch: command.expectedTargetGeneration ?? 0,
        ...(command.contentType ? { contentType: command.contentType } : {}),
      });
      await assertLease();
      return {
        type: command.type,
        result: {
          ...result,
          expectedContentHash,
        },
      };
    }
    case 'CLONE_PROJECT': {
      const inventory = await storage.cloneProjectObjects(
        command.sourceProjectId,
        command.targetProjectId,
        command.inventory,
        assertLease,
      );
      await assertLease();
      return { type: command.type, result: storageInventorySummary(inventory) };
    }
    default:
      return exhaustive(command);
  }
}

function exactObject<T extends { key: string }>(objects: T[], key: string): T | undefined {
  return objects.find((object) => object.key === key);
}

function inventoriesEquivalent(expected: ObjectStorageInventory, actual: ObjectStorageInventory): boolean {
  if (expected.bucketExists !== actual.bucketExists || expected.objects.length !== actual.objects.length) return false;
  const actualByKey = new Map(actual.objects.map((object) => [object.key, object]));
  return expected.objects.every((object) => {
    const candidate = actualByKey.get(object.key);
    return (
      candidate?.size === object.size &&
      object.contentHash !== null &&
      candidate.contentHash !== null &&
      candidate.contentHash === object.contentHash &&
      (object.generation === null || candidate.generation !== null)
    );
  });
}

export async function verifyObjectStorageCommand(
  storage: ObjectStorage,
  command: TenantObjectStorageCommand,
  execution: ObjectStorageCommandExecution,
): Promise<ObjectStorageVerification> {
  if (execution.type !== command.type) {
    throw objectStorageCommandError('OBJECT_STORAGE_COMMAND_RECEIPT_MISMATCH');
  }
  let evidence: Record<string, boolean | number | string | null>;

  switch (command.type) {
    case 'ENSURE_BUCKET': {
      if (!(await storage.bucketExists(command.projectId))) {
        throw objectStorageCommandError('OBJECT_STORAGE_BUCKET_NOT_PROVISIONED');
      }
      await assertBucketVersioningEnabled(storage, command.projectId);
      evidence = { bucketExists: true, bucketVersioningEnabled: true };
      break;
    }
    case 'DELETE_BUCKET': {
      if (await storage.bucketExists(command.projectId)) {
        throw objectStorageCommandError('OBJECT_STORAGE_BUCKET_DELETE_INCOMPLETE');
      }
      evidence = { bucketAbsent: true, objectCount: 0 };
      break;
    }
    case 'MOVE_OBJECT': {
      if (execution.type !== 'MOVE_OBJECT') {
        throw objectStorageCommandError('OBJECT_STORAGE_COMMAND_RECEIPT_MISMATCH');
      }
      const { objects } = await storage.listObjects(command.projectId, { prefix: command.from });
      const source = exactObject(objects, command.from);
      const targetObjects = await storage.listObjects(command.projectId, { prefix: command.to });
      const target = exactObject(targetObjects.objects, command.to);
      if (
        source ||
        !target ||
        target.contentHash !== command.sourceContentHash ||
        (execution.result.generation && target.generation !== execution.result.generation)
      ) {
        throw objectStorageCommandError('OBJECT_STORAGE_MOVE_VERIFICATION_FAILED');
      }
      evidence = { sourceAbsent: true, targetGeneration: target.generation };
      break;
    }
    case 'DELETE_OBJECT': {
      const { objects } = await storage.listObjects(command.projectId, { prefix: command.key });
      if (exactObject(objects, command.key)) {
        throw objectStorageCommandError('OBJECT_STORAGE_DELETE_VERIFICATION_FAILED');
      }
      evidence = { objectAbsent: true };
      break;
    }
    case 'DELETE_PREFIX': {
      if (command.prefixVersionCountBefore === undefined) {
        throw new TypeError('OBJECT_STORAGE_COMMAND_RECOVERY_PRECONDITION_REQUIRED');
      }
      const { objects } = await listObjectVersions(storage, command.projectId, command.prefix);
      if (objects.length > 0) {
        throw objectStorageCommandError('OBJECT_STORAGE_PREFIX_DELETE_INCOMPLETE');
      }
      evidence = {
        prefixAbsent: true,
        allVersionsAbsent: true,
        remainingObjectCount: 0,
        remainingVersionCount: 0,
        deletedVersionCount: command.prefixVersionCountBefore,
      };
      break;
    }
    case 'PUT_OBJECT': {
      if (execution.type !== 'PUT_OBJECT') {
        throw objectStorageCommandError('OBJECT_STORAGE_COMMAND_RECEIPT_MISMATCH');
      }
      const { objects } = await storage.listObjects(command.projectId, { prefix: command.key });
      const object = exactObject(objects, command.key);
      if (
        !object ||
        !execution.result.generation ||
        object.generation !== execution.result.generation ||
        execution.result.contentHash !== execution.result.expectedContentHash ||
        object.contentHash !== execution.result.expectedContentHash
      ) {
        throw objectStorageCommandError('OBJECT_STORAGE_PUT_VERIFICATION_FAILED');
      }
      evidence = {
        objectPresent: true,
        generation: object.generation,
        expectedContentHash: execution.result.expectedContentHash,
        providerContentHash: object.contentHash,
      };
      break;
    }
    case 'CLONE_PROJECT': {
      if (execution.type !== 'CLONE_PROJECT') {
        throw objectStorageCommandError('OBJECT_STORAGE_COMMAND_RECEIPT_MISMATCH');
      }
      const actual = await storage.inventoryProjectObjects(command.targetProjectId);
      const summary = storageInventorySummary(actual);
      if (
        !inventoriesEquivalent(command.inventory, actual) ||
        summary.bucketExists !== execution.result.bucketExists ||
        summary.objectCount !== execution.result.objectCount ||
        summary.inventoryDigest !== execution.result.inventoryDigest
      ) {
        throw objectStorageCommandError('OBJECT_STORAGE_CLONE_VERIFICATION_FAILED');
      }
      evidence = {
        inventoryVerified: true,
        objectCount: actual.objects.length,
        inventoryDigest: createHash('sha256').update(JSON.stringify(actual)).digest('hex'),
      };
      break;
    }
    default:
      return exhaustive(command);
  }

  return {
    outcome: command.type === 'DELETE_BUCKET' ? 'VERIFIED_ABSENT' : 'VERIFIED',
    verifier: 'api-object-storage-command-v1',
    evidence,
  };
}
