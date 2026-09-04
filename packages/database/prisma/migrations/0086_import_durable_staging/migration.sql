-- 0086_import_durable_staging — AUDX-014
--
-- L'import portait TROIS etats en processus dans services/api/src/app.ts :
--   `importStaging`    (Map jobId -> fichiers)
--   `importIdemIndex`  (Map cle d'idempotence -> jobId)
--   `importLedger`     (ImportCreditLedger, reservations de credits)
--
-- Le code l'admettait lui-meme : « A multi-replica prod would back this with a
-- shared ephemeral store » et « In-process index; durable idempotency =
-- UsageReservation follow-up ».
--
-- L'api tourne `replicas: 2` (HPA jusqu'a 6) et n'a AUCUNE affinite de session :
-- le cookie `vc_upstream` de l'Ingress ne couvre que `/` et `/runtime`, l'api
-- est jointe par un Service ClusterIP sans `sessionAffinity` — donc round-robin
-- kube-proxy. Le flux d'import fait deux sauts HTTP.
--
-- Trois defauts MESURES, chacun reproduit par un test a deux instances
-- partageant un store (= deux pods, un PostgreSQL) :
--   1. commit sur l'autre pod  -> 409 IMPORT_STAGING_GONE (~50 % a 2 replicas,
--      ~83 % a 6). Echec FERME, donc pas de perte de donnees, mais echec ;
--   2. create rejoue sur l'autre pod -> SECOND job, SECONDE reservation de
--      credits : le double debit que la cle d'idempotence existe pour empecher ;
--   3. cancel sur l'autre pod -> `compensateByJob` ne trouve rien (`keyByJob`
--      est local) et la reservation reste ouverte : fuite de credits.

-- (1) Staging durable, partage entre replicas.
CREATE TABLE IF NOT EXISTS "ImportStagedFile" (
    "id"          TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "path"        TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "encoding"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportStagedFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportStagedFile_importJobId_path_key"
    ON "ImportStagedFile"("importJobId", "path");
CREATE INDEX IF NOT EXISTS "ImportStagedFile_importJobId_idx"
    ON "ImportStagedFile"("importJobId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImportStagedFile_importJobId_fkey') THEN
    ALTER TABLE "ImportStagedFile"
      ADD CONSTRAINT "ImportStagedFile_importJobId_fkey"
      FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- (2) Idempotence durable.
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- NULL n'entre pas dans un index UNIQUE PostgreSQL : les jobs anterieurs, qui
-- n'ont pas de cle, ne se genent donc pas entre eux. C'est voulu — la contrainte
-- ne doit contraindre que les imports qui DECLARENT une cle.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportJob_organizationId_idempotencyKey_key"
    ON "ImportJob"("organizationId", "idempotencyKey");
