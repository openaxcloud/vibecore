-- SIEM delivery used only `lastDeliveredAt` (millisecond DateTime) as its cursor,
-- so audit rows sharing the last delivered millisecond beyond a batch boundary
-- were silently dropped. Add a secondary keyset cursor on the row id; the worker
-- now filters on (createdAt, id) so every event is delivered exactly once.
-- Nullable, no backfill needed: a NULL lastDeliveredId simply means "deliver from
-- the start of the lastDeliveredAt millisecond", which is already correct.
ALTER TABLE "SiemWebhook" ADD COLUMN "lastDeliveredId" TEXT;
