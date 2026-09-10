import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { ciphertextKeyId, reencryptJson } from '@vibecore/security';

/*
 * AUDX-010 — the corpus map that makes key rotation an operation instead of an
 * intention.
 *
 * `reencryptJson` can move ONE payload onto the primary key. Rotation needs the
 * list of every column that holds a payload, or the sweep silently skips a
 * column and the retired key can never be dropped. That list is enumerated here
 * rather than inside a route handler so it is greppable, and `assertCorpusMatchesSchema`
 * fails the build when a new encrypted column is added to the schema without
 * being added here — the drift is what would make a rotation quietly partial.
 */
export interface EncryptedColumn {
  /** Prisma client accessor (camelCase model name). */
  model: string;
  /** Column holding the `encryptJson` payload. */
  column: string;
  /** Primary-key field used to address a row for the update. */
  idField: string;
}

export const ENCRYPTED_COLUMNS: readonly EncryptedColumn[] = [
  { model: 'user', column: 'mfaSecretCiphertext', idField: 'id' },
  { model: 'projectSecret', column: 'valueEncrypted', idField: 'id' },
  { model: 'stripeConfig', column: 'secretKeyEnc', idField: 'id' },
  { model: 'stripeConfig', column: 'webhookSecretEnc', idField: 'id' },
  { model: 'loginProviderConfig', column: 'clientSecretEnc', idField: 'provider' },
  { model: 'ssoConfiguration', column: 'encryptedConfig', idField: 'id' },
  { model: 'siemWebhook', column: 'secretCiphertext', idField: 'id' },
  { model: 'connectorCatalog', column: 'defaultClientSecretEnc', idField: 'id' },
  { model: 'connectorCatalog', column: 'webhookSigningSecretEnc', idField: 'id' },
  { model: 'userConnection', column: 'accessTokenEncrypted', idField: 'id' },
  { model: 'userConnection', column: 'refreshTokenEncrypted', idField: 'id' },
  { model: 'organizationOAuthAppOverride', column: 'clientSecretEncrypted', idField: 'id' },
  { model: 'providerConfig', column: 'apiKeyEnc', idField: 'id' },
] as const;

/** Ciphertext-bearing column names follow these suffixes by convention. */
const CIPHERTEXT_SUFFIX = /(Enc|Encrypted|Ciphertext|encryptedConfig)$/;

function resolveSchemaPath(): string {
  const require = createRequire(import.meta.url);

  try {
    return join(dirname(require.resolve('@vibecore/database/package.json')), 'prisma', 'schema.prisma');
  } catch {
    return join(process.cwd(), '..', '..', 'packages', 'database', 'prisma', 'schema.prisma');
  }
}

/** Every `String`/`String?` field in the schema whose name looks like ciphertext. */
export function scanSchemaForEncryptedColumns(schemaText: string): Array<{ model: string; column: string }> {
  const found: Array<{ model: string; column: string }> = [];
  let currentModel: string | undefined;

  for (const rawLine of schemaText.split('\n')) {
    const line = rawLine.trim();
    const modelMatch = /^model\s+(\w+)\s*\{/.exec(line);

    if (modelMatch) {
      currentModel = modelMatch[1];
      continue;
    }

    if (line === '}') {
      currentModel = undefined;
      continue;
    }

    if (!currentModel || line.startsWith('//') || line.startsWith('@@')) {
      continue;
    }

    const fieldMatch = /^(\w+)\s+String(\??)/.exec(line);

    if (fieldMatch && CIPHERTEXT_SUFFIX.test(fieldMatch[1])) {
      found.push({ model: currentModel.charAt(0).toLowerCase() + currentModel.slice(1), column: fieldMatch[1] });
    }
  }

  return found;
}

/**
 * Fails when the schema holds an encrypted column the rotation map does not
 * cover (rotation would skip it), or when the map names a column the schema no
 * longer has (the sweep would crash mid-run).
 */
export function assertCorpusMatchesSchema(schemaText = readFileSync(resolveSchemaPath(), 'utf8')): void {
  const inSchema = scanSchemaForEncryptedColumns(schemaText);
  const key = (entry: { model: string; column: string }) => `${entry.model}.${entry.column}`;
  const mapped = new Set(ENCRYPTED_COLUMNS.map(key));
  const schemaKeys = new Set(inSchema.map(key));

  const missing = [...schemaKeys].filter((entry) => !mapped.has(entry)).sort();
  const stale = [...mapped].filter((entry) => !schemaKeys.has(entry)).sort();

  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `ENCRYPTED_COLUMNS is out of sync with schema.prisma.${
        missing.length > 0 ? ` Not covered by rotation: ${missing.join(', ')}.` : ''
      }${stale.length > 0 ? ` No longer in the schema: ${stale.join(', ')}.` : ''}`,
    );
  }
}

/** Minimal shape of the Prisma delegates this sweep needs. */
type Delegate = {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
  update(args: unknown): Promise<unknown>;
};
type PrismaLike = Record<string, Delegate | unknown>;

function delegate(prisma: PrismaLike, model: string): Delegate {
  const found = prisma[model] as Delegate | undefined;

  if (!found || typeof found.findMany !== 'function') {
    throw new Error(`Prisma client has no delegate for model ${model}`);
  }

  return found;
}

export interface ColumnRotationResult {
  model: string;
  column: string;
  scanned: number;
  rotated: number;
  /** Rows whose ciphertext could not be opened — the retired key was dropped too early. */
  unreadable: number;
}

/**
 * Count the corpus by the key that sealed it. `null` groups the legacy `v1`
 * payloads that name no key. This is what proves a rotation FINISHED: the sweep
 * is done when nothing is left under the retired key, not when the job exits 0.
 */
export async function encryptionCorpusStatus(prisma: PrismaLike): Promise<Record<string, number>> {
  const byKeyId: Record<string, number> = {};

  for (const entry of ENCRYPTED_COLUMNS) {
    const rows = await delegate(prisma, entry.model).findMany({
      where: { [entry.column]: { not: null } },
      select: { [entry.column]: true },
    });

    for (const row of rows) {
      const value = row[entry.column];

      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }

      const keyId = ciphertextKeyId(value) ?? 'v1-unkeyed';
      byKeyId[keyId] = (byKeyId[keyId] ?? 0) + 1;
    }
  }

  return byKeyId;
}

/**
 * Walk every encrypted column and re-seal each payload under the current primary
 * key. Safe to re-run: a payload already on the primary key is re-sealed with a
 * fresh IV, which is a no-op for the reader.
 *
 * A row that cannot be decrypted is COUNTED and skipped, never overwritten — the
 * plaintext is not recoverable, so writing anything over it would destroy the
 * secret. The caller must treat a non-zero `unreadable` as a failed rotation.
 */
export async function rotateEncryptedCorpus(
  prisma: PrismaLike,
  options: { batchSize?: number; dryRun?: boolean } = {},
): Promise<{ columns: ColumnRotationResult[]; rotated: number; unreadable: number }> {
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 500;
  const columns: ColumnRotationResult[] = [];

  for (const entry of ENCRYPTED_COLUMNS) {
    const target = delegate(prisma, entry.model);
    const result: ColumnRotationResult = { model: entry.model, column: entry.column, scanned: 0, rotated: 0, unreadable: 0 };

    let cursor: unknown;

    for (;;) {
      const rows = await target.findMany({
        where: { [entry.column]: { not: null } },
        select: { [entry.idField]: true, [entry.column]: true },
        orderBy: { [entry.idField]: 'asc' },
        take: batchSize,
        ...(cursor === undefined ? {} : { cursor: { [entry.idField]: cursor }, skip: 1 }),
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const id = row[entry.idField];
        const value = row[entry.column];

        cursor = id;

        if (typeof value !== 'string' || value.length === 0) {
          continue;
        }

        result.scanned += 1;

        let rotatedValue: string;

        try {
          rotatedValue = reencryptJson(value);
        } catch {
          // Unreadable: the sealing key is gone. Leave the bytes untouched.
          result.unreadable += 1;
          continue;
        }

        if (!options.dryRun) {
          await target.update({ where: { [entry.idField]: id }, data: { [entry.column]: rotatedValue } });
        }

        // Counted only AFTER the write landed, so a throw mid-sweep never
        // reports rows it did not actually rotate.
        result.rotated += 1;
      }

      if (rows.length < batchSize) {
        break;
      }
    }

    columns.push(result);
  }

  return {
    columns,
    rotated: columns.reduce((sum, column) => sum + column.rotated, 0),
    unreadable: columns.reduce((sum, column) => sum + column.unreadable, 0),
  };
}
