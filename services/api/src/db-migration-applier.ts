import { Client as PgClient } from 'pg';
import { appPublicEnglish } from './app-public-copy.js';

/**
 * Applicateur PostgreSQL des migrations de projet (P0-V3-11).
 *
 * Deux propriétés portent toute la sûreté :
 *
 * 1. **Tout dans UNE transaction.** En PostgreSQL le DDL est transactionnel :
 *    si la 3e migration d'un lot échoue, le ROLLBACK défait aussi les deux
 *    premières ET l'écriture du registre. On ne peut donc pas se retrouver avec
 *    un schéma à moitié muté — le cas de corruption que P0-V3-11 vise.
 *
 * 2. **Le registre vit DANS la base du projet**, écrit dans cette même
 *    transaction. Le tenir côté plateforme le ferait diverger de la réalité au
 *    premier rollback : la plateforme croirait la migration appliquée alors que
 *    la base l'aurait annulée. Ici, registre et schéma avancent ou reculent
 *    ensemble.
 *
 * Le registre sert aussi de garde-fou d'idempotence AU NIVEAU DE LA BASE : une
 * migration déjà présente est sautée, donc republier n'exécute pas deux fois un
 * `ALTER TABLE`.
 */

import { MigrationRolledBackError, type DeclaredMigration } from './db-migration-execution.js';
import { assertMigrationOwnsNoTransaction } from './db-migration-transaction-guard.js';

/** Table de registre, créée à la volée dans le schéma courant. */
export const MIGRATION_LEDGER_TABLE = '_ecode_schema_migrations';

const CREATE_LEDGER = `CREATE TABLE IF NOT EXISTS ${MIGRATION_LEDGER_TABLE} (
  name text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export interface PostgresApplierDeps {
  /** Injectable pour les tests ; par défaut un vrai client `pg`. */
  createClient?: (connectionString: string) => {
    connect(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<{ rows: any[]; command?: string }>;
    end(): Promise<void>;
  };
  sha256: (value: string) => string;
}

/**
 * Applique les migrations manquantes et renvoie celles réellement exécutées.
 * `committed` n'est vrai qu'après un COMMIT confirmé — l'appelant distingue
 * ainsi « annulé proprement » d'« état indéterminé ».
 */
export function createPostgresMigrationApplier(deps: PostgresApplierDeps) {
  const createClient = deps.createClient ?? ((connectionString: string) => new PgClient({ connectionString }) as any);

  return async function applyPostgresMigrations(input: {
    connectionString: string;
    migrations: DeclaredMigration[];
  }): Promise<{ committed: boolean; applied: string[] }> {
    for (const migration of input.migrations) {
      assertMigrationOwnsNoTransaction(migration.sql);
    }

    const client = createClient(input.connectionString);

    let commitAttempted = false;

    try {
      await client.connect();
      await client.query('BEGIN');

      try {
        await client.query(CREATE_LEDGER);

        const existing = await client.query(`SELECT name FROM ${MIGRATION_LEDGER_TABLE}`);
        const alreadyApplied = new Set<string>((existing.rows ?? []).map((row: any) => String(row.name)));
        const applied: string[] = [];

        for (const migration of input.migrations) {
          if (alreadyApplied.has(migration.name)) {
            continue; // déjà appliquée : la sauter, ne pas la rejouer
          }

          await client.query(migration.sql);
          await client.query(`INSERT INTO ${MIGRATION_LEDGER_TABLE} (name, sha256) VALUES ($1, $2)`, [
            migration.name,
            deps.sha256(migration.sql),
          ]);
          applied.push(migration.name);
        }

        commitAttempted = true;

        const commit = await client.query('COMMIT');

        if (commit.command !== 'COMMIT') {
          throw new Error(appPublicEnglish('MIGRATION_COMMIT_UNACKNOWLEDGED'));
        }

        return { committed: true, applied };
      } catch (error) {
        // ROLLBACK after a lost COMMIT reply cannot undo an already committed transaction.
        if (commitAttempted) {
          throw error;
        }

        const rollback = await client.query('ROLLBACK');

        if (rollback.command !== 'ROLLBACK') {
          throw new Error(appPublicEnglish('MIGRATION_ROLLBACK_UNACKNOWLEDGED'));
        }

        throw new MigrationRolledBackError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  };
}
