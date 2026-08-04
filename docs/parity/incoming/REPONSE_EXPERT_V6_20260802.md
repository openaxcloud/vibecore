# REVIEW RECEIPT — RR-20260802-CODEX-09

Reviewer : OpenAI-Codex
Date : 2026-08-02
Dépôt : openaxcloud/vibecore

## Références auditées
- WIF / PR #55 : 53eb488f0e7aeb71dc1614a290bc7cb8a6bc28c6
- Purge DB / PR #51 : 602eb3d73567d3a9a222e9382bd6c95d6d7a2184
- Purge physique / PR #52 : 2627afd0847361e7bf577e0d3051db721c765e62
- Runtime Nix / PR #57 : 9ff4717d6f41b95052aaa2b0257f7b6515625826

## Verdict
- P0-A2-09 : REFUSÉ
- PR #51 — purge DB : ACCEPTÉE à portée ciblée
- PR #52 — purge physique : REFUSÉE
- CTR-RUNTIME-NIX : REFUSÉ
Aucun refus fondé sur le seul rouge Playwright.

## A. P0-A2-09 — REFUSÉ
Le teardown classe comme NOTFOUND le message ambigu « Project [x] not found or permission denied » dès que `gcloud auth print-access-token` réussit. Un token valide prouve l'authentification, pas l'autorisation `resourcemanager.projects.get`. Un projet existant mais invisible peut être déclaré absent et recevoir CLEANUP_RECEIPT=OK.
Correction : 1) ne jamais traiter le message combiné comme absence vérifiée ; 2) NOTFOUND seulement sur vrai HTTP 404 / statut NOT_FOUND structuré non ambigu ; 3) UNKNOWN sur toute réponse ambiguë ; 4) test token valide + projet existant + principal sans projects.get/projects.delete → reçu FAILED.

## B. PR #51 — purge DB — ACCEPTÉE À PORTÉE CIBLÉE
ChatShare authored supprimés dans la transaction (token public 200→404 après purge, 0 restant, org partagée) ; AdminAuditLog dont metadata.userId==sujet entièrement rédigés même si l'acteur est un autre admin (tiers intacts). CI 602eb3d7 : Production CI 30758853009 succès, PR Validation 30758852988 succès. Décision : réserves RR-08 levées ; ne signe PAS un contrat global.

## C. PR #52 — purge physique — REFUSÉE
Le guard de topologie intervient APRÈS l'effacement externe irréversible. Course sole→shared : le bucket peut être détruit à l'étape 2 (suppression GCS/PVC), le rollback DB empêche la tombstone mais ne restaure pas le bucket. En outre le gel object-storage (purgeFrozenProjectIds) n'est pas relâché de façon garantie sur dérive/abandon → une org conservée peut rester gelée.
Correction : acquérir une garantie de topologie AVANT toute suppression externe ; bloquer/versionner les mutations de membership pendant l'effacement ; ne supprimer qu'après cette garantie ; nettoyer le gel dans une state machine récupérable ; test sole→shared le bucket n'est jamais supprimé ; test absence de freeze résiduel après tout échec.

## D. CTR-RUNTIME-NIX — REFUSÉ
Refs .log corrigées, revendication UI retirée, code typé préservé + tests. MAIS la preuve live du code typé porte sur le 409 de `/nix-lock`, PAS sur un publish exécuté avec l'image contenant le correctif (le publish live a tourné sur une image antérieure, statut/log ne contient que le message). Une preuve future après déploiement ne vaut pas une preuve présente.
Correction : 1) merger/déployer le correctif ; 2) rejouer ACTIVE→READY/200, REVOKED→publish FAILED avec statut/log du deployment contenant littéralement ECODE_LOCK_GENERATION_REVOKED + URL 410, restauration→READY/200 ; 3) archiver artefacts + hashes.

## Décision machine
reviewReceiptId: RR-20260802-CODEX-09
p0 accepted: [] ; refused: [P0-A2-09]
codeLots accepted: [PR-51-ACCOUNT-PURGE-DB-RR08-FIX] ; refused: [PR-52-ACCOUNT-PURGE-PHYSICAL-RR08-FIX]
contracts accepted: [] ; refused: [CTR-RUNTIME-NIX]
Ne marquer aucun nouveau P0/contrat SIGNED/CLOSED. Enregistrer uniquement l'acceptation ciblée du lot PR #51.
