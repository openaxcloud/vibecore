-- Composite index for the SIEM audit-delivery keyset query (wave 25 #17):
-- WHERE organizationId = ? ORDER BY createdAt, id. Additive.
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_id_idx" ON "AuditLog"("organizationId", "createdAt", "id");
