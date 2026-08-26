import { describe, expect, it } from 'vitest';

import { sha256 } from './db-migration-execution.js';
import { collectPublishMigrationPlan, MigrationManifestError } from './db-migration-plan.js';

function storage(files: Array<{ path: string; content: string }>) {
  return {
    async listFiles() {
      return files;
    },
  } as any;
}

function manifest(entries: Array<{ name: string; sql: string }>, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    mode: 'expand',
    backwardCompatible: true,
    forwardCompatible: false,
    migrations: entries.map(({ name, sql }) => ({ name, sha256: sha256(sql) })),
    ...overrides,
  });
}

describe('publish migration manifest', () => {
  it('accepts only exact, pinned, ordered expand migrations', async () => {
    const entries = [
      { name: '001_users.sql', sql: 'CREATE TABLE users (id bigint PRIMARY KEY);' },
      { name: '002_email.sql', sql: 'ALTER TABLE users ADD COLUMN email text;' },
    ];
    const plan = await collectPublishMigrationPlan(
      storage([
        { path: 'migrations/ecode.publish.json', content: manifest(entries) },
        ...entries.map(({ name, sql }) => ({ path: `migrations/${name}`, content: sql })),
      ]),
      'project',
    );
    expect(plan?.migrations.map(({ name }) => name)).toEqual(['001_users.sql', '002_email.sql']);
    expect(plan?.backwardCompatible).toBe(true);
  });

  it.each([
    'DROP TABLE users;',
    'TRUNCATE TABLE users;',
    'UPDATE users SET email = NULL;',
    'ALTER TABLE users DROP COLUMN email;',
    'ALTER TABLE users ALTER COLUMN email SET NOT NULL;',
    'CREATE TABLE copied_users AS SELECT * FROM users;',
    'CREATE TABLE inherited_users (extra text) INHERITS (users);',
    'CREATE TABLE users_2026 PARTITION OF users FOR VALUES FROM (1) TO (100);',
    'DO $$ BEGIN DELETE FROM users; END $$;',
  ])('refuses destructive or arbitrary SQL: %s', async (sql) => {
    const entries = [{ name: '001_bad.sql', sql }];
    await expect(
      collectPublishMigrationPlan(
        storage([
          { path: 'migrations/ecode.publish.json', content: manifest(entries) },
          { path: 'migrations/001_bad.sql', content: sql },
        ]),
        'project',
      ),
    ).rejects.toMatchObject({ code: 'MIGRATION_UNSAFE_PLAN' });
  });

  it('refuses changed bytes, undeclared SQL and a missing manifest', async () => {
    const sql = 'CREATE TABLE users (id bigint);';

    const wrong = JSON.stringify({
      schemaVersion: 1,
      mode: 'expand',
      backwardCompatible: true,
      forwardCompatible: false,
      migrations: [{ name: '001.sql', sha256: '0'.repeat(64) }],
    });

    for (const files of [
      [
        { path: 'migrations/ecode.publish.json', content: wrong },
        { path: 'migrations/001.sql', content: sql },
      ],
      [
        { path: 'migrations/ecode.publish.json', content: manifest([{ name: '001.sql', sql }]) },
        { path: 'migrations/001.sql', content: sql },
        { path: 'migrations/undeclared.sql', content: 'CREATE TABLE hidden (id int);' },
      ],
      [{ path: 'migrations/001.sql', content: sql }],
    ]) {
      await expect(collectPublishMigrationPlan(storage(files), 'project')).rejects.toBeInstanceOf(
        MigrationManifestError,
      );
    }
  });

  it('does nothing when the project has no migration files', async () => {
    await expect(
      collectPublishMigrationPlan(storage([{ path: 'src/index.ts', content: 'export {}' }]), 'project'),
    ).resolves.toBeUndefined();
  });
});
