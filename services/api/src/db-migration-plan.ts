import { MIGRATION_MANIFEST_PATH, sha256, type DeclaredMigration } from './db-migration-execution.js';
import type { ProjectStorage } from './project-storage.js';

const MAX_MIGRATIONS = 100;
const MAX_MIGRATION_BYTES = 1024 * 1024;
const MAX_PLAN_BYTES = 8 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MIGRATION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;

export class MigrationManifestError extends Error {
  constructor(readonly code: 'MIGRATION_MANIFEST_INVALID' | 'MIGRATION_UNSAFE_PLAN') {
    super(code);
  }
}

export interface CollectedPublishMigrationPlan {
  migrations: DeclaredMigration[];
  backwardCompatible: true;
  forwardCompatible: boolean;
}

interface ParsedManifest {
  schemaVersion: 1;
  mode: 'expand';
  backwardCompatible: true;
  forwardCompatible: boolean;
  migrations: Array<{ name: string; sha256: string }>;
}

function parseManifest(raw: string): ParsedManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  const value = parsed as Record<string, unknown>;

  if (
    value.schemaVersion !== 1 ||
    value.mode !== 'expand' ||
    value.backwardCompatible !== true ||
    typeof value.forwardCompatible !== 'boolean' ||
    !Array.isArray(value.migrations) ||
    value.migrations.length === 0 ||
    value.migrations.length > MAX_MIGRATIONS
  ) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  const migrations = value.migrations.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
    }

    const item = entry as Record<string, unknown>;

    if (
      typeof item.name !== 'string' ||
      !MIGRATION_NAME_PATTERN.test(item.name) ||
      typeof item.sha256 !== 'string' ||
      !SHA256_PATTERN.test(item.sha256)
    ) {
      throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
    }

    return { name: item.name, sha256: item.sha256 };
  });

  if (new Set(migrations.map(({ name }) => name)).size !== migrations.length) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  return {
    schemaVersion: 1,
    mode: 'expand',
    backwardCompatible: true,
    forwardCompatible: value.forwardCompatible,
    migrations,
  };
}

/**
 * Mask strings/comments/dollar-quoted bodies while retaining SQL keywords and
 * statement separators. The policy never tries to prove arbitrary SQL safe:
 * only a deliberately small expand-only grammar is accepted.
 */
function policyText(sql: string): string {
  let output = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') {
        index += 1;
      }
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;

      let depth = 1;

      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
        } else if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      output += ' ';
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      output += quote === '"' ? '"IDENT"' : "'VALUE'";
      index += 1;

      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
          } else {
            index += 1;
            break;
          }
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (char === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/)?.[0];

      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);

        if (end < 0) {
          throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
        }

        output += "'BODY'";
        index = end + tag.length;
        continue;
      }
    }

    output += char;
    index += 1;
  }

  return output;
}

export function assertExpandOnlySql(sql: string): void {
  const normalized = policyText(sql)
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  for (const statement of normalized) {
    const allowed =
      /^CREATE TABLE (?:IF NOT EXISTS )?/i.test(statement) ||
      /^CREATE (?:UNIQUE )?INDEX (?!CONCURRENTLY\b)/i.test(statement) ||
      /^ALTER TABLE .+ ADD (?:COLUMN|CONSTRAINT)\b/i.test(statement) ||
      /^CREATE TYPE .+ AS ENUM\b/i.test(statement) ||
      /^COMMENT ON (?:TABLE|COLUMN|INDEX|TYPE)\b/i.test(statement);

    if (!allowed) {
      throw new MigrationManifestError('MIGRATION_UNSAFE_PLAN');
    }

    if (
      /\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|MERGE|COPY|CALL|DO|FUNCTION|PROCEDURE|TRIGGER|RULE|POLICY|REINDEX|VACUUM|CLUSTER)\b/i.test(
        statement,
      ) ||
      /\bCREATE\s+TABLE\b[\s\S]*\b(?:AS\s+SELECT|LIKE|INHERITS|PARTITION\s+OF)\b/i.test(statement) ||
      /\bALTER\s+(?:TABLE|COLUMN)\b[\s\S]*\b(?:DROP|RENAME|TYPE|SET\s+NOT\s+NULL)\b/i.test(statement)
    ) {
      throw new MigrationManifestError('MIGRATION_UNSAFE_PLAN');
    }
  }
}

export async function collectPublishMigrationPlan(
  projectStorage: ProjectStorage,
  projectId: string,
  workspaceId?: string,
): Promise<CollectedPublishMigrationPlan | undefined> {
  const files = await projectStorage.listFiles(projectId, workspaceId);
  const manifestFile = files.find((file) => file.path === MIGRATION_MANIFEST_PATH);
  const sqlFiles = files.filter((file) => /^migrations\/[^/]+\.sql$/i.test(file.path));

  if (!manifestFile && sqlFiles.length === 0) {
    return undefined;
  }

  if (!manifestFile) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  const manifest = parseManifest(manifestFile.content);
  const byName = new Map(sqlFiles.map((file) => [file.path.slice('migrations/'.length), file.content]));
  const declaredNames = new Set(manifest.migrations.map(({ name }) => name));

  if (sqlFiles.some((file) => !declaredNames.has(file.path.slice('migrations/'.length)))) {
    throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
  }

  let totalBytes = 0;

  const migrations = manifest.migrations.map(({ name, sha256: expectedHash }) => {
    const sql = byName.get(name);

    if (sql === undefined || sql.trim().length === 0) {
      throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
    }

    const bytes = Buffer.byteLength(sql, 'utf8');
    totalBytes += bytes;

    if (bytes > MAX_MIGRATION_BYTES || totalBytes > MAX_PLAN_BYTES || sha256(sql) !== expectedHash) {
      throw new MigrationManifestError('MIGRATION_MANIFEST_INVALID');
    }

    assertExpandOnlySql(sql);

    return { name, sql, sha256: expectedHash };
  });

  return {
    migrations,
    backwardCompatible: true,
    forwardCompatible: manifest.forwardCompatible,
  };
}
