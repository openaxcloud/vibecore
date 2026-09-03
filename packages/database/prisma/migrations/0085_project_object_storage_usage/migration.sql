-- 0085_project_object_storage_usage — AUDX-023
--
-- La facturation du stockage objet sommait `ProjectStorageObject.byteLength` :
-- une table PostgreSQL d'archives base64, ecrite au SEUL endroit
-- `persistProjectArchiveObject` (instantanes/exports). Les routes
-- `/projects/:id/object-storage/*` ecrivent dans GCS et n'y touchent JAMAIS.
--
-- Consequence mesuree : chaque octet televerse par URL signee etait invisible a
-- la facturation ET a tout quota — alors que le code affirmait sommer « the
-- REAL stored bytes » et que la route disait « the numbers come straight from
-- what's on disk ».
--
-- Cette table porte la mesure REELLE du seau GCS, ecrite par l'inventaire
-- quotidien. `measuredAt` est explicite : une decision de quota prise sur une
-- mesure perimee doit pouvoir le DIRE plutot que se faire passer pour actuelle.
--
-- `bytes` est BIGINT : un seau de projet depasse trivialement 2 Gio, et INT4
-- aurait deborde en silence.

CREATE TABLE IF NOT EXISTS "ProjectObjectStorageUsage" (
    "projectId"   TEXT NOT NULL,
    "bytes"       BIGINT NOT NULL DEFAULT 0,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "measuredAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectObjectStorageUsage_pkey" PRIMARY KEY ("projectId")
);

CREATE INDEX IF NOT EXISTS "ProjectObjectStorageUsage_measuredAt_idx"
    ON "ProjectObjectStorageUsage"("measuredAt");

-- Conditionnel comme les deux CREATE ci-dessus. Une migration qui annonce
-- `IF NOT EXISTS` puis echoue au re-jeu sur la contrainte n'est idempotente
-- qu'a moitie : verifie sur PostgreSQL 16, le second passage renvoyait
-- « constraint ... already exists » et laissait la migration en echec.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectObjectStorageUsage_projectId_fkey'
  ) THEN
    ALTER TABLE "ProjectObjectStorageUsage"
      ADD CONSTRAINT "ProjectObjectStorageUsage_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
