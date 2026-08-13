-- Réservation de crédits d'import persistée (BUG-IMPORT-001, 2e moitié).
--
-- Le registre vivait dans une Map en mémoire du processus API. Avec plusieurs
-- réplicas, un commit servi par un autre pod répondait
-- BILLING_RESERVATION_MISSING : le staging avait beau être partagé, la
-- réservation ne l'était pas.
--
-- La contrainte unique est (organizationId, key) et NON key seule. La clé
-- d'idempotence est choisie par le client, donc devinable ; l'ancien registre
-- l'indexait globalement, si bien que deux organisations utilisant « import-1 »
-- partageaient la même réservation — prouvé le 2026-08-12 : la seconde org
-- recevait la réservation de la première (organizationId et crédits inclus).
CREATE TABLE "ImportCreditReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "reservedCredits" INTEGER NOT NULL,
    "debitedCredits" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportCreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportCreditReservation_importJobId_key" ON "ImportCreditReservation"("importJobId");
CREATE UNIQUE INDEX "ImportCreditReservation_organizationId_key_key" ON "ImportCreditReservation"("organizationId", "key");
CREATE INDEX "ImportCreditReservation_organizationId_idx" ON "ImportCreditReservation"("organizationId");
