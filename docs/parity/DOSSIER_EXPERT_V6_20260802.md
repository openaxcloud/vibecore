# DOSSIER_EXPERT_V6_20260802 — corrections des refus RR-20260731-CODEX-08

> Chaque affirmation est vérifiée à la source (commit audité + CI verte à la
> tête + artefacts hashés PRÉSENTS dans l'arbre) le **2026-08-02**. Règle :
> « prouvé en réel ou pas inclus ». Les 4 lots refusés par ton reçu RR-08 sont
> ré-adressés ; chaque section cite ton motif verbatim.
> Contexte registre : après RR-08, main porte **33 CLOSED / 27 OPEN /
> 5 PROVEN = 65** (LS-16/LS-18/V3-14 signés) ; A2-09 reste OPEN/REFUSED ;
> aucun contrat signé. Rien ci-dessous n'est auto-clôturé.

## SOMMAIRE — chiffres et demande

| # | Item | Motif RR-08 (résumé) | Correction V6 | Commit audité | CI à la tête |
|---|---|---|---|---|---|
| A | WIF `P0-A2-09` | teardown lit tout échec de describe comme absence | classification fail-closed + retry + delete tenté + injection de panne | `53eb488f` (PR #55) | ✅ |
| B | Purge DB (PR #51) | ChatShare public survivant ; audit ciblant le sujet non rédigé | deleteMany authored + redaction metadata ciblé, preuves PG réelles | `c85363e0` (PR #51) | ✅ |
| C | Purge physique (PR #52) | route thumbnail hors barrière ; topologie non sérialisée | garde structurelle toutes primitives + guard de dérive topologie | `018389f3` (PR #52) | ✅ |
| D | CTR-RUNTIME-NIX | code typé non capturé ; réf `.log` morte ; sur-revendication UI | code persisté + capturé LIVE ; refs corrigées ; UI retirée | `633796aa` (PR #57) | ✅ |

**Demande : rejouer et signer, ou refuser avec réserve.** Les 4 items sont
PRÊTS — CI vertes aux têtes (voir Note CI ; réserve dite telle quelle pour A :
Quality Gates non programmé à sa tête), artefacts hashés. **Seul rouge universel** : Production
E2E/Playwright, repo-wide (aussi sur main), hors périmètre.

---

# A. `P0-A2-09` (WIF) — teardown fail-closed sur describe illisible

**Motif RR-08 (verbatim)** : « teardown() traite tout échec de `gcloud
projects describe` comme absence → saute la suppression. Correction :
distinguer un vrai NOT_FOUND authentifié ; retry sur transitoire ; tenter
delete même si état illisible ; échouer le reçu de nettoyage si l'état final
n'est ni DELETE_REQUESTED ni NOT_FOUND authentifié ; test négatif simulant une
erreur transitoire de describe. »

**Correction (commit `53eb488f`, PR #55) — les 5 exigences** : logique extraite
dans `teardown-lib.sh` (sourcée par `repro.sh`) :
1. `classify_project_state` ne conclut NOT_FOUND QUE sur motif not-found ET
   auth prouvée saine (`gcloud auth print-access-token`) ; sinon **UNKNOWN** ;
2. describe **réessayé** sur erreurs transitoires (retry borné) ;
3. `gcloud projects delete` **TENTÉ même quand l'état est UNKNOWN** ;
4. le reçu de nettoyage **ÉCHOUE** si l'état final n'est ni DELETE_REQUESTED
   ni NOT_FOUND authentifié ;
5. **test négatif par injection de panne** : `teardown-lib.spec.sh` simule les
   erreurs transitoires/illisibles de describe — sortie archivée.

**Artefacts (branche PR #55)** :
- `docs/deploy-evidence/2026-07-21-wif-three-paths/teardown-lib.sh`
  `0c69fbb4…` (+ `teardown-lib.spec.sh`) ;
- `rr08-teardown-faultinjection/spec-output.txt` `265d5c60…` (injection de
  panne rejouée) + `path1-gke-negative.txt`, `path3-cloudrun-negative.json` ;
- preuves antérieures conservées : cas négatif billing-fail réel
  (`replay-20260723T191146Z-negative-billingfail/`) + 3 chemins rejoués.

**CI (tête `53eb488f`)** : Production CI run **30645927382** success ·
Parity registries run **30645927345** success · Quality Gates : voir Note CI.
https://github.com/openaxcloud/vibecore/actions/runs/30645927382
**Statut** : A2-09 reste OPEN/REFUSED au registre — re-soumission.

# B. PURGE DB — `PR #51` (2 classes PII hors purge, corrigées)

**Motif RR-08 (verbatim)** : « 6.1 ChatShare public survivant : la purge
supprime AiConversation mais ni ne supprime ni révoque les ChatShare authored
par l'utilisateur ; GET /chat-shares/:token accessible sans auth → snapshot
servi après purge. 6.2 Audit ciblant l'utilisateur : anonymise AdminAuditLog
seulement si actorUserId == utilisateur ; les events où un autre admin agit
sur l'utilisateur (metadata.userId + texte libre) restent. »

**Correction (commit `c85363e0`, PR #51)** :
1. **ChatShare** : `chatShare.deleteMany({ authorUserId })` **dans la
   transaction** de purge (ChatShare n'a AUCUNE FK — le payloadJson EST la
   PII, servie par route publique) ; compteur intégré à la vérification
   « 0 restant » (rollback sinon).
   **Preuve réelle** : org PARTAGÉ (projet conservé), token signé → GET
   **200 avant** purge (snapshot servi) → purge → même token → **404**,
   0 row SQL, classe consignée dans la preuve d'effacement.
2. **AdminAuditLog ciblant le sujet** : tout event dont
   `metadata.userId == sujet` a son metadata **ENTIER remplacé par un
   marqueur** (les clés libres porteuses de PII ne sont pas énumérables) ;
   `action`/`actorUserId`/`ipAddress` (trace de l'ACTEUR) conservés ; la
   preuve de purge est exclue par filtre d'action ET écrite après la redaction
   dans la même transaction.
   **Preuve réelle** : admin B suspend le sujet (metadata avec userId + email
   en texte libre) → après purge : **ni l'id ni l'email ne survivent**,
   acteur/IP intacts ; event visant un TIERS **intouché** (pas de
   sur-redaction) ; preuve de purge non rédigée.

**Artefacts** : `docs/deploy-evidence/2026-07-23-purge-hardening-codex07/
test-runs-rr08-raw.txt` `4d077b56…` (tests réels vrai Postgres) + README mis
à jour + `account-purge-db.spec.ts` (+162 lignes) + matrice
`docs/account-deletion-data-matrix.md` (ligne ChatShare : « row DELETED
(RR-08 #1) »).
**CI (tête `602eb3d7`, branche réconciliée sur main le 02/08 — conflit trivial
de commentaire résolu, zéro différence sémantique)** : Production CI run
**30758853009** success · PR Validation (Quality Gates) run **30758852988**
success · Security Analysis + Code Quality + gitleaks success.
https://github.com/openaxcloud/vibecore/actions/runs/30758853009
**Statut** : lot re-soumis ; rien d'auto-clôturé.

# C. PURGE PHYSIQUE — `PR #52` (2 chemins fail-open fermés)

**Motif RR-08 (verbatim)** : « 7.1 Route thumbnail hors barrière :
POST /projects/:projectId/thumbnail/upload-url n'appelle pas
objectStorageWriteBlocked → ensureBucket + createUploadUrl peuvent recréer
bucket/objet après effacement. 7.2 Topologie non sérialisée :
purgeableStorageInventory() calculé avant transaction/advisory lock ;
suppression GCS/PVC avant la transaction qui recalcule sole/shared → course
membership = stockage survivant ou suppression indue. »

**Correction (commit `018389f3`, PR #52) — structurelle, pas au cas par cas** :
1. **Gel de TOUTES les écritures object-storage** :
   `guardObjectStorageWrites()` enveloppe le storage — CHAQUE primitive de
   création/modification (`ensureBucket`/`createUploadUrl`/`putObject`/
   `moveObject`) REFUSE un projet purge-frozen avec
   `OBJECT_STORAGE_PURGE_FROZEN` (→ 403) ; `resolveObjectStorage()` sert le
   wrapper gardé à TOUTES les routes + au capturer de thumbnails ; la purge
   elle-même utilise l'adaptateur brut (`resolveRawObjectStorage`) pour
   pouvoir supprimer ce qu'elle a gelé ; la route thumbnail appelle EN PLUS
   la garde explicite `objectStorageWriteBlocked`.
2. **Topologie versionnée** : guard de dérive — le plan d'effacement est
   validé sous verrou contre la topologie recalculée ; toute dérive
   membership (shared→sole / sole→shared) → abandon/recommencement.
**Tests exécutables** : `tests/object-storage-purge-freeze.spec.ts`
(169 lignes : thumbnail→403, upload-url→403, capturer bloqué, purge propre
passe par le raw) + `account-purge-db.spec.ts` (+96 lignes, courses
topologie) + `object-storage.spec.ts` (+66).

**Artefacts** : E2E réels conservés avec index SUMS **vérifiable**
(`gcs-proof.json` `c427b032…`, `k8s-proof.json` `aac80903…` — SUMS
recalculés depuis les fichiers committés, commit `05610577`).
**CI (tête `2627afd0`)** : Production CI run **30645603318** success ·
Quality Gates run **30645606126** success.
https://github.com/openaxcloud/vibecore/actions/runs/30645603318
**Statut** : lot re-soumis ; rien d'auto-clôturé.

# D. `CTR-RUNTIME-NIX` — code typé capturé LIVE + incohérences corrigées

**Motif RR-08 (verbatim)** : « 8.1 code typé non capturé : contrat affirme
ECODE_LOCK_GENERATION_REVOKED mais publish réduit à ecodeLockError =
error.message ; artefact = message textuel, pas code typé. 8.2 référence
morte : contrat/README référencent live-revocation-EXECUTED.log ; fichier
réel = .txt. 8.3 sur-revendication UI : README décrit UI → control plane
alors que appels HTTP directs. »

**Correction (commit `633796aa`, PR #57)** :
1. **Code typé PERSISTÉ** : `describeEcodeLockFailure`
   (`server-deploy-revision.ts`) préserve le code, qui mène la ligne
   persistée (`Server deploy: ECODE_LOCK_GENERATION_REVOKED: …`) ; **test
   automatisé qui EXIGE le code** (+ UNPINNED/TAMPERED/UNKNOWN) sur la chaîne
   réelle `assertLockAgainstRegistry→describeEcodeLockFailure`.
   **REJEU LIVE 31/07** (gen-2 révoquée helm rev 913, restaurée+vérifiée
   rev 914) : l'artefact `rr08-409-revoked-code.json` contient
   **LITTÉRALEMENT `"code":"ECODE_LOCK_GENERATION_REVOKED"`** (grep = 1
   occurrence, vérifié) ; publish → FAILED re-confirmé
   (`rr08-publish-revoked-deployment.json`). Sans sur-revendication : le log
   publish de l'image live (antérieure au fix) porte le message sans code
   littéral — le code y apparaîtra au déploiement de cette branche (test
   verrouillé) ; dit tel quel.
2. **Références mortes corrigées** : toutes les refs
   `live-revocation-EXECUTED.log` → `.txt` (le fichier réellement committé).
3. **Revendication UI RETIRÉE** : le README décrit les appels HTTP directs,
   tels qu'ils ont été joués.

**Artefacts (branche PR #57)** :
`docs/deploy-evidence/2026-07-23-ctr-runtime-nix-v4/` —
`rr08-409-revoked-code.json` `14e4c1f4…` ·
`rr08-code-capture-EXECUTED.txt` `8d8b299a…` ·
`rr08-publish-revoked-deployment.json` ; + la sous-preuve déjà acceptée
NIX-REVOKED-GENERATION-FAILED-410-AND-RESTORE-READY-200 inchangée.
**CI (tête `9ff4717d` — v6 rebasée sur le main courant, contenu identique à
`633796aa` ; CONTRACT_REGISTRY fusionné en UNION : historique v4 de la branche
+ verbatim RR-08 de main)** : Production CI run **30759024780** success · PR
Validation (Quality Gates) run **30759024769** success · Parity registries run
**30759024771** success.
https://github.com/openaxcloud/vibecore/actions/runs/30759024780
**Statut** : contrat v6, PROVEN_REVIEW_PENDING — signature = ta décision.

---

# NOTE CI (vérité au moment du commit de ce dossier)
- **#52** : ✅ tout vert à la tête `2627afd0` (Production CI 30645603318,
  Quality Gates 30645606126).
- **#55** : Production CI 30645927382 + Parity 30645927345 verts à
  `53eb488f` ; Quality Gates re-déclenché le 02/08 (le job n'avait pas été
  programmé à cette tête) — résultat consigné ci-dessous.
- **#51 / #57** : branches CONFLICTING vs main (workflows muets — piège
  connu) → réconciliées le 02/08 (merges triviaux documentés) ; CI complète
  relancée — résultats consignés ci-dessous.
- RÉSULTATS FINAUX :
Vérifiés activement via gh le 2026-08-02 :
  - **C / PR #52 @ `2627afd0` : ✅ PRÊT** — Production CI run 30645603318 pass ·
    Quality Gates run 30645606126 pass · gitleaks pass.
  - **A / PR #55 @ `53eb488f` : ✅ PRÊT avec note** — Production CI run
    30645927382 pass · Parity registries run 30645927345 pass ; Quality Gates
    (agrégateur de Production CI) n'a PAS été programmé par GitHub à cette
    tête — re-déclenchement tenté (label), sans effet ; dit tel quel, pas
    revendiqué vert.
  - **B / PR #51 @ `602eb3d7` : ✅ PRÊT** — Production CI run 30758853009
    pass · PR Validation (Quality Gates) run 30758852988 pass · Security
    Analysis 30758852982 pass · Code Quality 30758853037 pass. Seul échec :
    Production E2E (repo-wide, hors périmètre).
  - **D / PR #57 @ `9ff4717d` : ✅ PRÊT** — Production CI run 30759024780
    pass · PR Validation (Quality Gates) run 30759024769 pass · Parity
    registries 30759024771 pass · Security Analysis 30759024765 pass · Code
    Quality 30759024750 pass. Seul échec : Production E2E (repo-wide, hors
    périmètre). Tête = v6 rebasée sur le main courant (contenu identique à
    633796aa).
- Seul rouge universel : Production E2E/Playwright (repo-wide, aussi sur main).

# DEMANDE
Rejouer et signer, ou refuser avec réserve : A (P0-A2-09), B (lot #51),
C (lot #52), D (CTR-RUNTIME-NIX v6). Rien n'est CLOSED/SIGNED au-delà de tes
décisions ; les consolidations registre suivront ton reçu, par le mécanisme
registre-seul habituel.
