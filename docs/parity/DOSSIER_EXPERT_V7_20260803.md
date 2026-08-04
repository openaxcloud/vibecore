# DOSSIER_EXPERT_V7_20260803 — corrections des refus RR-20260802-CODEX-09

> Chaque affirmation est vérifiée à la source (commit audité + CI verte à la
> tête + artefacts hashés PRÉSENTS dans l'arbre) le **2026-08-04**. Règle :
> « prouvé en réel ou pas inclus ». Les 3 refus de ton reçu RR-09 sont
> ré-adressés (chaque section cite ton motif verbatim) ; le lot PR #51 que tu
> as accepté est consigné tel quel. Registre : toujours **33 CLOSED / 27 OPEN /
> 5 PROVEN = 65** — rien d'auto-clôturé, tout attend ta signature.
> **Seul rouge universel** : Production E2E/Playwright, repo-wide (aussi sur
> main), hors périmètre — aucun point ci-dessous ne s'appuie dessus.

## SOMMAIRE

| # | Item | Motif RR-09 (résumé) | Correction V7 | Commit audité | CI à la tête |
|---|---|---|---|---|---|
| A | WIF `P0-A2-09` | NOTFOUND conclu sur message ambigu ; token valide ≠ autorisation projects.get | classification sur statut HTTP STRUCTURÉ (CRM v1) + test exists_no_getdelete | `26f1ad84` (PR #55) | ✅ (note QG) |
| B | Purge DB (PR #51) | — ACCEPTÉE à portée ciblée par RR-09 | consignée, aucune nouvelle preuve nécessaire | `c85363e0`→`602eb3d7` | ✅ (RR-09) |
| C | Purge physique (PR #52) | guard de topologie APRÈS l'effacement irréversible ; gel non relâché | garantie AVANT toute suppression + state machine récupérable, tests (6)–(10) vrai PG | `886522b9` (PR #52) | ✅ |
| D | CTR-RUNTIME-NIX | preuve du code typé = 409 /nix-lock, pas un publish sur image corrigée | #57 MERGÉE+DÉPLOYÉE, rejeu live : publish révoqué → FAILED avec le code DANS le statut + URL 410 | `05319065` (main) + `450459a5` (PR #76) | ✅ |

**Demande : rejouer et signer, ou refuser avec réserve.** Notes honnêtes par
point dans chaque section (aucune n'est cachée dans une annexe).

---

# A. `P0-A2-09` (WIF) — NOTFOUND sur statut structuré, jamais sur message ambigu

**Motif RR-09 (verbatim)** : « Le teardown classe comme NOTFOUND le message
ambigu « Project [x] not found or permission denied » dès que `gcloud auth
print-access-token` réussit. Un token valide prouve l'authentification, pas
l'autorisation `resourcemanager.projects.get`. Un projet existant mais
invisible peut être déclaré absent et recevoir CLEANUP_RECEIPT=OK. Correction :
1) ne jamais traiter le message combiné comme absence vérifiée ; 2) NOTFOUND
seulement sur vrai HTTP 404 / statut NOT_FOUND structuré non ambigu ;
3) UNKNOWN sur toute réponse ambiguë ; 4) test token valide + projet existant +
principal sans projects.get/projects.delete → reçu FAILED. »

**Correction (commit `26f1ad84`, PR #55) — les 4 exigences** :
`teardown-lib.sh` n'interprète PLUS AUCUN message texte : `classify_project_state`
appelle l'API Cloud Resource Manager v1 (`GET /v1/projects/<id>`) et classe sur
le COUPLE code HTTP + champ `status` STRUCTURÉ de la réponse JSON :
1. le message combiné n'est jamais consulté (le parsing texte a disparu) ;
2. **NOTFOUND ⇔ HTTP 404 ET `status=NOT_FOUND`** — rien d'autre ;
3. **UNKNOWN sur tout l'ambigu** : 401/403 (PERMISSION_DENIED), réponse
   inattendue, 000/429/5xx après retry borné ;
4. delete TENTÉ en UNKNOWN ; le reçu de nettoyage n'est OK que sur
   DELETE_REQUESTED observé ou NOT_FOUND structuré — tout état UNKNOWN/ACTIF
   ⇒ `CLEANUP_RECEIPT=FAILED` ;
5. **test `exists_no_getdelete`** (mock : token VALIDE + projet EXISTANT +
   principal sans `projects.get` ni `projects.delete`, GET→403, delete→403)
   → classement UNKNOWN → **reçu FAILED (PAS OK)** — exactement ton cas.

**Artefacts (branche PR #55, tous DANS l'arbre à `26f1ad84`)** :
- `docs/deploy-evidence/2026-07-21-wif-three-paths/teardown-lib.sh`
  sha256 `23b3a398d61cf35fbc65815ab54c6ad00e7e5c56ec2e3f37b3c24fce842f4ced` ;
- `teardown-lib.spec.sh` (mocks gcloud+curl, cas ambiguous_403 ET
  exists_no_getdelete) sha256 `670d66418bc6138a2c7902f26f494dd4503ac75c4d81…` ;
- sortie du spec `rr08-teardown-faultinjection/spec-output.txt`
  sha256 `0da2facdc79462328b2857aaf3959818b46c5f12319c60978ca942185a2adc8d` —
  **PASS=31 FAIL=0**, dont « [6] exists_no_getdelete (RR-09 EXIGÉ…) → reçu
  FAILED (PAS OK) » ;
- REJEU LIVE GCP du 2026-08-03 (projet frais `ecode-wif-proof-739484`) :
  `replay-20260803T064443Z-rr09/` (3 chemins, GKE authorized/unbound,
  Cloud Run) + négatif billing-fail réel
  `replay-20260803T064401Z-rr09-negative-billingfail/` (teardown-trace.txt
  sha256 `5a8828e889d666aaed5c6482223c6152c3ade571802efaa40ec7fbeb6f32b05f`).

**CI (tête `26f1ad84`)** : Production CI run **30792155142** success · Parity
registries run **30792155062** success · Semantic run 30792153406 success.
https://github.com/openaxcloud/vibecore/actions/runs/30792155142
**Note honnête** : le workflow PR Validation (Quality Gates) n'est PAS
programmé par GitHub sur cette branche (constat déjà signalé au dossier V6,
têtes 53eb488f et 26f1ad84) — dit tel quel, pas revendiqué vert.
**Statut** : A2-09 reste OPEN/REFUSED au registre — re-soumission.

# B. PURGE DB — `PR #51` — ACCEPTÉE PAR TON REÇU RR-09 (consignée)

**Ton verdict RR-09 (verbatim)** : « ChatShare authored supprimés dans la
transaction (token public 200→404 après purge, 0 restant, org partagée) ;
AdminAuditLog dont metadata.userId==sujet entièrement rédigés même si l'acteur
est un autre admin (tiers intacts). CI 602eb3d7 : Production CI 30758853009
succès, PR Validation 30758852988 succès. Décision : réserves RR-08 levées ;
ne signe PAS un contrat global. »

**Consigné au registre (main `4427ae46`)** :
`REVIEW_RECEIPT_REGISTRY.yaml` → RR-20260802-CODEX-09 →
`codeLotsAccepted: [PR-51-ACCOUNT-PURGE-DB-RR08-FIX]` (portée ciblée, réserves
RR-08 ChatShare + audit ciblé LEVÉES, aucune signature de contrat, aucun
CLOSED). Aucune nouvelle preuve n'est soumise ici — ce point figure pour la
complétude du dossier.

# C. PURGE PHYSIQUE — `PR #52` — garantie de topologie AVANT l'irréversible

**Motif RR-09 (verbatim)** : « Le guard de topologie intervient APRÈS
l'effacement externe irréversible. Course sole→shared : le bucket peut être
détruit à l'étape 2 (suppression GCS/PVC), le rollback DB empêche la tombstone
mais ne restaure pas le bucket. En outre le gel object-storage
(purgeFrozenProjectIds) n'est pas relâché de façon garantie sur dérive/abandon
→ une org conservée peut rester gelée. Correction : acquérir une garantie de
topologie AVANT toute suppression externe ; bloquer/versionner les mutations de
membership pendant l'effacement ; ne supprimer qu'après cette garantie ;
nettoyer le gel dans une state machine récupérable ; test sole→shared le bucket
n'est jamais supprimé ; test absence de freeze résiduel après tout échec. »

**Correction (commit `886522b9`, PR #52) — les 6 exigences dans l'ordre** :
1. **Garantie AVANT suppression** : `acquirePurgeGuarantee()` s'exécute EN
   PREMIER, dans UNE transaction sous l'advisory lock par-utilisateur :
   calcule la topologie sole/shared faisant autorité ET la gèle atomiquement
   (membership de chaque org du sujet + object-storage des buckets sole),
   enregistre un plan récupérable ;
2. **Membership bloqué pendant l'effacement** : addMember/removeMember
   prennent le lock du freeze-set et REFUSENT (`MEMBERSHIP_FROZEN_FOR_PURGE`)
   sur une org gelée — aucun join/leave ne peut basculer sole↔shared ;
3. **Delete seulement après garantie** : `eraseStorage` n'est invoqué qu'une
   garantie tenue, sur `guarantee.bucketProjectIds` uniquement ;
4. **State machine récupérable** : `releasePurgeGuarantee()` en `finally` sur
   CHAQUE sortie (purgé/dérive/throw) — dégel membership + object-storage,
   plan effacé ; `reconcilePurgeFreezes()` au démarrage de l'exécuteur libère
   le plan d'un run crashé → zéro freeze résiduel ;
5-6. **Tests exigés, sur VRAI Postgres** (`account-purge-db.spec.ts`) :
   (6) sole→shared : un bucket partagé sous la garantie n'est JAMAIS effacé
   (le bucket survit) ; (7) shared→sole EMPÊCHÉ (co-membre ne peut pas partir
   pendant le gel) ; (8) sole→shared EMPÊCHÉ (pas de nouveau membre pendant le
   gel) ; (9) AUCUN freeze résiduel après une purge ÉCHOUÉE (libération
   garantie sur throw) ; (10) le réconciliateur libère le freeze d'un run
   crashé. Le drift-check RR-08 est CONSERVÉ en défense en profondeur.

**Artefacts** : `services/api/src/tests/account-purge-db.spec.ts`
sha256 `af5857076724d4da3c02f8d5ce17369a9cd71eb85e900408c9cb9e1f2e0e45a2`
(9 tests, log CI : « account purge — durable proofs (real Postgres) » ✓) +
README E2E mis à jour (`2026-07-23-physical-purge-e2e/README.md`).
**CI (tête `886522b9`)** : Production CI run **30792137348** success (le spec
vrai-PG y tourne vert) · PR Validation run **30792137366** success · Security
Analysis 30792137333 + Code Quality 30792137352 success.
https://github.com/openaxcloud/vibecore/actions/runs/30792137348
**Note honnête (dite telle quelle)** : l'orchestration (ordre
garantie→gel→delete, verrous, dégel garanti) est prouvée par tests VRAI
POSTGRES en CI verte ; il n'y a PAS de nouvel E2E GCS/kind pour ce commit —
les E2E GCS/k8s réels antérieurs du lot restent ceux du dossier V6 (SUMS
vérifiables, commit `05610577`).
**Statut** : lot re-soumis ; rien d'auto-clôturé.

# D. CTR-RUNTIME-NIX — le code typé DANS le statut d'un publish sur l'IMAGE CORRIGÉE

**Motif RR-09 (verbatim)** : « Refs .log corrigées, revendication UI retirée,
code typé préservé + tests. MAIS la preuve live du code typé porte sur le 409
de `/nix-lock`, PAS sur un publish exécuté avec l'image contenant le correctif
(le publish live a tourné sur une image antérieure, statut/log ne contient que
le message). Une preuve future après déploiement ne vaut pas une preuve
présente. Correction : 1) merger/déployer le correctif ; 2) rejouer
ACTIVE→READY/200, REVOKED→publish FAILED avec statut/log du deployment
contenant littéralement ECODE_LOCK_GENERATION_REVOKED + URL 410,
restauration→READY/200 ; 3) archiver artefacts + hashes. »

**Correction — les 3 exigences** :
1. **Mergé + déployé** : PR #57 MERGÉE sur main (`05319065`, merge du
   2026-08-03) ; API prod déployée avec l'image `05319065be` (tag = short-10 du
   merge, consigné en tête du protocole exécuté) ;
2. **Rejeu live du 2026-08-03 SUR CETTE IMAGE** (protocole `rr09-EXECUTED.txt`) :
   - Publish #1, gen-2 ACTIVE → **READY**, URL preview → **200** ;
   - gen-2 RÉVOQUÉE → Publish #2 → **FAILED** avec, PERSISTÉ dans les logs du
     deployment : « Server deploy: **ECODE_LOCK_GENERATION_REVOKED**:
     ecode.lock.json pins nix store generation "gen-2" is REVOKED … — refusing
     to use it » ; URL du deployment #2 → **410** ;
   - gen-2 restaurée ACTIVE → Publish #3 → **READY**, URL → **200** ;
3. **Artefacts archivés + hashés**
   (`docs/deploy-evidence/2026-08-03-rr09-code-in-deployment/`, PR #76 tête
   `450459a5`) :
   - `rr09-publish2-REVOKED-deployment.json`
     sha256 `2f2c065ffa9b85356026840f651f1a53df1d8c306b5f74dc366c53008d8779f1`
     — l'objet deployment `status: "FAILED"` avec la chaîne littérale
     `ECODE_LOCK_GENERATION_REVOKED` (grep = 1, vérifié) ;
   - `rr09-EXECUTED.txt` (protocole complet horodaté, URL#2 → 410)
     sha256 `436533d09810f7bf0d733b9b3ce68ffe82076339a7bad023e07359d78731d46a` ;
   - `README.md` sha256 `a8b8bfa1cbbf0ac08034d593b520429f71a5b3c10d90080812…`.

**CI (tête `450459a5`, PR #76)** : Production CI run **30795019134** success ·
PR Validation run **30795019013** success · Parity registries run 30795019080
success · Semantic re-run **30878436936** success (l'échec Semantic initial
était le TITRE de la PR — casse du sujet — corrigé, aucun rapport avec le
contenu).
https://github.com/openaxcloud/vibecore/actions/runs/30795019134
**Statut** : contrat v7, PROVEN_REVIEW_PENDING — signature = ta décision. La
sous-preuve NIX-REVOKED-GENERATION-FAILED-410-AND-RESTORE-READY-200 (RR-08)
reste à sa portée limitée.
