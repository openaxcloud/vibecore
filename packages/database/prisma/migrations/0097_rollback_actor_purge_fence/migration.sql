-- Attribute every newly-acquired rollback to the user whose authorization
-- granted it. Historical operations remain nullable; account purge can now
-- fence and close actor-owned work without blocking unrelated members of a
-- shared project.
ALTER TABLE "RollbackIdempotencyRequest"
  ADD COLUMN "actorUserId" TEXT;

CREATE INDEX "RollbackIdempotencyRequest_actorUserId_status_idx"
  ON "RollbackIdempotencyRequest"("actorUserId", "status");

ALTER TABLE "RollbackIdempotencyRequest"
  ADD CONSTRAINT "RollbackIdempotencyRequest_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
