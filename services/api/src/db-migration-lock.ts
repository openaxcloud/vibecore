/** PostgreSQL advisory locks are scoped to the target database, not the API tenant. */
export const MIGRATION_LEDGER_SERIALIZATION_LOCK_KEY = 'vibecore:db-ledger-serialization:v1';
