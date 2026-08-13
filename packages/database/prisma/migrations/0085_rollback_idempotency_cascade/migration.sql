-- RollbackIdempotency : rattachement au projet avec CASCADE (relecture de ma propre 0084).
--
-- La 0084 déclarait `projectId` comme une simple colonne TEXT, sans clé étrangère — alors
-- que TOUTES les tables voisines portent `@relation(..., onDelete: Cascade)`. Conséquence :
-- à la suppression d'un projet, ces lignes SURVIVAIENT, orphelines, en conservant
-- `responseBody` — la charge utile complète du déploiement (URLs, ids, metadata). Le dépôt
-- mène par ailleurs un chantier explicite de purge/scrub ; y ajouter une table qui échappe
-- à la purge irait exactement à l'encontre de celui-ci.
--
-- Sûr à appliquer : la table est introduite par le même lot, non mergé, donc vide partout —
-- aucune ligne orpheline ne peut faire échouer la création de la contrainte.
--
-- Fait en 0085 plutôt qu'en modifiant la 0084 : celle-ci a déjà été appliquée sur des bases
-- locales et sur le cluster de test ; changer son contenu modifierait son checksum et
-- `prisma migrate deploy` échouerait sur une dérive.
--
-- `deploymentId` reste volontairement SANS clé étrangère : cette ligne existe pour rejouer
-- une réponse à l'identique, et la suppression du déploiement cité ne doit pas effacer la
-- trace du rejeu — sinon un retry après purge redeviendrait un VRAI rollback.

ALTER TABLE "RollbackIdempotency"
    ADD CONSTRAINT "RollbackIdempotency_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
