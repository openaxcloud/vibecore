-- PostgreSQL requires newly added enum values to commit before a later
-- transaction can reference them from constraints, triggers, or writes.
ALTER TYPE "AppImageBuildPhase" ADD VALUE 'MANUAL_RECOVERY';
ALTER TYPE "AppImageBuildPhase" ADD VALUE 'REJECTED_ABSENT';
