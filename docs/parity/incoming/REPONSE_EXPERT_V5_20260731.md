# REVIEW RECEIPT — RR-20260731-CODEX-08

Reviewer : OpenAI-Codex
Date : 2026-07-31
Dépôt : openaxcloud/vibecore
Objet : revue indépendante approfondie du dossier V5
SHA-256 V5 annoncé par l'agent : c63695661d16924513c7b61c5807e471798dfc71998b5dd2c80bb2084a2b2f51
Statut de ce SHA : DECLARED_NOT_RECOMPUTED
SHA-256 du reçu : d1e99781601d8dd75e7b030caf6567463407544115c5a749845785266e94635d

## 3. VERDICT GLOBAL
P0 À SIGNER (reviewer: OpenAI-Codex) : P0-LS-16, P0-LS-18, P0-V3-14
P0 REFUSÉ : P0-A2-09
LOTS DE CODE REFUSÉS : purge DB PR #51, purge physique PR #52
CONTRAT REFUSÉ : CTR-RUNTIME-NIX
CTR-OPERATIONS-DR : NE PAS signer le contrat entier ; sous-preuves à portée limitée.

## 5. WIF P0-A2-09 — REFUSÉ
teardown() traite tout échec de `gcloud projects describe` comme absence → saute la suppression. Correction : distinguer un vrai NOT_FOUND authentifié ; retry sur transitoire ; tenter delete même si état illisible ; échouer le reçu de nettoyage si l'état final n'est ni DELETE_REQUESTED ni NOT_FOUND authentifié ; test négatif simulant une erreur transitoire de describe.

## 6. PURGE DB PR #51 — REFUSÉE
6.1 ChatShare public survivant : la purge supprime AiConversation mais ni ne supprime ni révoque les ChatShare authored par l'utilisateur ; GET /chat-shares/:token accessible sans auth → snapshot servi après purge.
6.2 Audit ciblant l'utilisateur : anonymise AdminAuditLog seulement si actorUserId == utilisateur ; les events où un autre admin agit sur l'utilisateur (metadata.userId + texte libre) restent.
Corrections : supprimer/révoquer/anonymiser chaque ChatShare authored ; test token public → 404/410 après purge ; cible d'audit structurée targetUserId ou redaction metadata ; nettoyer events admin ciblant l'utilisateur même si actorUserId différent ; ajouter à la matrice PII + tests PG.

## 7. PURGE PHYSIQUE PR #52 — REFUSÉE
7.1 Route thumbnail hors barrière : POST /projects/:projectId/thumbnail/upload-url n'appelle pas objectStorageWriteBlocked → ensureBucket + createUploadUrl peuvent recréer bucket/objet après effacement.
7.2 Topologie non sérialisée : purgeableStorageInventory() calculé avant transaction/advisory lock ; suppression GCS/PVC avant la transaction qui recalcule sole/shared → course membership = stockage survivant ou suppression indue.
Corrections : barrière sur toutes routes créant/modifiant du stockage (thumbnail + signed upload) ; test purge-frozen + thumbnail/upload-url → 403 ; plan d'effacement versionné sous verrou topologie ou re-vérif version/topologie avant tombstone ; abandonner/recommencer sur dérive ; 2 tests concurrents shared→sole et sole→shared.

## 8. CTR-RUNTIME-NIX — REFUSÉ
Sous-preuve fonctionnelle recevable : lock gen-2 → READY/200 ; révoquée → FAILED/410 ; restaurée → READY/200 ; pas de repli silencieux.
8.1 Code typé non capturé : contrat affirme ECODE_LOCK_GENERATION_REVOKED mais publish réduit à ecodeLockError = error.message ; artefact = message textuel, pas code typé.
8.2 Référence morte : contrat/README référencent live-revocation-EXECUTED.log ; fichier réel = .txt.
8.3 Sur-revendication UI : README décrit UI → control plane alors que appels HTTP directs.
Corrections : persister/surfacer le code dans statut/logs ; test exigeant ECODE_LOCK_GENERATION_REVOKED ; rejouer + archiver artefact avec le code ; corriger .log → .txt ; retirer la revendication UI ou jouer depuis une vraie surface UI.
Sous-preuve acceptée (portée limitée) : NIX-REVOKED-GENERATION-FAILED-410-AND-RESTORE-READY-200.

## 9. CTR-OPERATIONS-DR — PAS DE SIGNATURE ENTIÈRE
Restent : astreinte outillée, réplication cross-région, RTO applicatif complet.
Sous-preuve snapshots acceptée à portée limitée (EVID-DR-SNAPSHOT-001) : policy Terraform quotidienne rétention 7j + attache observée sur disques présents + snapshot compatible scheduler + script idempotent. Limite : pas de CronJob d'attache continue démontré ; archiver aussi la sortie JSON brute gcloud compute snapshots describe / Cloud Audit Logs.

## 10. DÉCISION MACHINE
reviewReceiptId: RR-20260731-CODEX-08
p0 accepted: P0-LS-16, P0-LS-18, P0-V3-14
p0 refused: P0-A2-09
codeLots refused: PR-51-ACCOUNT-PURGE-DB, PR-52-ACCOUNT-PURGE-PHYSICAL
contracts refused: CTR-RUNTIME-NIX
notSubmittedForWholeContractSignature: CTR-OPERATIONS-DR
individualEvidence acceptedWithScope: EVID-DR-SNAPSHOT-001, NIX-REVOKED-GENERATION-FAILED-410-AND-RESTORE-READY-200
