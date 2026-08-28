-- PostgreSQL requires an enum addition to commit before a later migration can
-- reference the new value from constraints, triggers, or writes.
ALTER TYPE "RegistryMutationState" ADD VALUE 'MANUAL_RECOVERY';
