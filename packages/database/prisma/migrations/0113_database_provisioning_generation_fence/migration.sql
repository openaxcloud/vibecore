-- Fence every managed-database provisioning attempt against late workers.
-- Existing rows are generation 1; a retry advances exactly once while moving
-- FAILED -> PROVISIONING. Completion/failure writers compare this generation.

ALTER TABLE "DatabaseInstance"
  ADD COLUMN "provisioningGeneration" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "DatabaseInstance_provisioning_generation_positive" CHECK (
    "provisioningGeneration" >= 1
  );

CREATE FUNCTION "vibecore_database_provisioning_generation_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'PROVISIONING'::"DatabaseInstanceStatus"
    AND OLD."status" <> 'PROVISIONING'::"DatabaseInstanceStatus"
  THEN
    IF OLD."status" <> 'FAILED'::"DatabaseInstanceStatus"
      OR NEW."provisioningGeneration" <> OLD."provisioningGeneration" + 1
    THEN
      RAISE EXCEPTION 'DATABASE_PROVISIONING_GENERATION_INVALID_RETRY';
    END IF;
  ELSIF NEW."provisioningGeneration" <> OLD."provisioningGeneration" THEN
    RAISE EXCEPTION 'DATABASE_PROVISIONING_GENERATION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "DatabaseInstance_provisioning_generation_guard"
BEFORE UPDATE ON "DatabaseInstance"
FOR EACH ROW EXECUTE FUNCTION "vibecore_database_provisioning_generation_guard"();
