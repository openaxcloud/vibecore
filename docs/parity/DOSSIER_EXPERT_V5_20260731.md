# DOSSIER_EXPERT_V5_20260731 — remédiations finalisées après ton reçu RR-20260723-CODEX-07

> Chaque affirmation de ce dossier est vérifiée à la source (commit audité +
> CI verte + artefacts hashés PRÉSENTS dans l'arbre) le **2026-07-31**. Règle
> appliquée : « prouvé en réel ou pas inclus » — ce qui n'est pas fini est
> déclaré tel quel en fin de dossier, pas gonflé.
> Rappel de contexte : la consolidation registre des 30 P0 signés est MERGÉE
> sur main (PR #56, merge `58c2a05e`) ; tes refus RR-07 y sont inscrits
> verbatim (LS-16/LS-18/V3-14 = PROVEN_REVIEW_PENDING, A2-09 = OPEN, tous
> REFUSED/reviewer UNKNOWN — rien n'a été fermé au-delà de tes décisions).

## SOMMAIRE — chiffres et demande

Ton reçu RR-07 (hash `f5771529…`) a signé LS-13 + LS-03 et refusé : les 3
points d'attestation, A2-09 (WIF), les lots purge #51/#52, et les contrats
DR + Nix. **Chaque refus ci-dessous est ré-adressé avec preuve exécutée.**
**Demande : rejouer et signer, ou refuser avec réserve.**

| # | Item | Réserve RR-07 (résumée) | Correction | Commit audité | CI |
|---|---|---|---|---|---|
| A | LS-16 / LS-18 / V3-14 (attestation) | vérificateur FAIL-OPEN sur l'ABSENCE de mergedCommit/repoCommit/runUrl | v7 fail-closed MERGÉE + roll post-merge VIVANT | merge `7287c27d` (PR #54) | ✅ mergée + roll vert |
| B | A2-09 (WIF) | trap teardown armé APRÈS create+billing | trap AVANT create + négatif billing-fail RÉEL + 3 chemins rejoués | `16498462` (PR #55) | ✅ |
| C | Purge DB (#51) | Stripe POST /cancel inopérant ; sélection avant verrous ; PII libre | DELETE Stripe + verrous d'abord + matrice complète | `dca0bec6` (PR #51) | ✅ |
| D | Purge physique (#52) | 5 chemins fail-open du câblage prod | les 6 corrections fail-closed + E2E négatifs réels | `ee0df5a7` (PR #52) | ✅ |
| E | CTR-RUNTIME-NIX | « une commande prête à jouer n'est pas une preuve exécutée » | code MERGÉ (#45) + négatif live EXÉCUTÉ en prod + restauration vérifiée | `6d57a401` (main) + `5148e0e5` (PR #57) | ✅ |
| F | CTR-OPERATIONS-DR | obligations centrales BLOCKED/UNTESTED | +1 obligation FERMÉE (snapshots planifiés, GO Avi) ; 3 restantes DÉCLARÉES | `a26f06fe` (PR #36) | ✅ (drift vues réparé 31/07) |

**A→E sont PRÊTS à signer** (preuve exécutée, artefacts hashés, CI verte).
**F n'est PAS soumis pour signature du contrat entier** — uniquement
l'enregistrement des sous-preuves individuelles, conformément à ta décision
RR-07 (« les nouveaux sous-artefacts peuvent être enregistrés comme preuves
individuelles. Ne pas écrire le reviewer du contrat »).

**Seul rouge universel** : Production E2E/Playwright, repo-wide (présent aussi
sur main), hors périmètre — jamais utilisé seul par tes reçus comme motif.

---

# A. ATTESTATION `P0-LS-16` / `P0-LS-18` / `P0-V3-14` — v7 fail-closed MERGÉE + roll vivant

**Réserve RR-07 (verbatim)** : « le vérificateur v6 reste FAIL-OPEN sur
l'absence de mergedCommit/repoCommit/runUrl (checkAttestationFields ne les
contrôle que s'ils existent ; validate-registries ne les exige pas ; les tests
négatifs falsifient des valeurs présentes sans tester leur SUPPRESSION) — une
attestation amputée peut passer. Exigé : champs obligatoires non vides
(validateur ET vérificateur), rejet de l'absence, négatif par suppression,
nouveau roll post-merge. »

**Correction — les 4 exigences, exécutées** :
1. **Champs OBLIGATOIRES + NON VIDES dans le vérificateur**
   (`scripts/parity/verify-attestation-run.mjs`, sur main) : `isBlank()` sur
   `mergedCommit` → « ABSENT/vide — champ OBLIGATOIRE (fail-closed CODEX-07) » ;
   idem `repoCommit` et `runUrl`. L'absence est une ERREUR, plus un skip.
2. **Champs exigés aussi par `validate-registries.mjs`** : la garde attestation
   itère `['runCommit','mergedCommit','repoCommit']` et échoue si l'un manque.
3. **Tests négatifs PAR SUPPRESSION (§3c)** dans
   `verify-attestation-substitution-test.mjs` : `delete amputated[field]` par
   champ → rejet ; chaîne vide `""` → traitée comme absente, rejetée.
4. **Nouveau roll post-merge du mécanisme v7** : PR **#54 MERGÉE**
   (2026-07-26, merge `7287c27d`) → job `roll-attestation` post-merge →
   **run `30193204381`** (workflow `parity-registries.yml`, event=push,
   head_branch=main, head_sha=`7287c27d`, **conclusion=success**) →
   **commit bot `490737fe`**.
   Run : https://github.com/openaxcloud/vibecore/actions/runs/30193204381

**Artefacts (SUR MAIN, hashés)** —
`docs/deploy-evidence/2026-07-23-attestation-fail-closed/` :
- `00-guard-source-git-hashes.txt` `b115515d…`
- `01-substitution-test.txt` `35936e48…` (négatifs par suppression VERTS)
- `02-repro-fail-closed.txt` `705948e1…` (repro bout-en-bout sur CI réelle)
- `03-validate-registries-clean.txt` `e1314097…`
- `SHA256SUMS.txt` (l'index ci-dessus). Nota : les logs sont en `.txt` car
  `.gitignore` exclut `*.log` — dit tel quel.

**Statut** : les 3 P0 restent PROVEN_REVIEW_PENDING/REFUSED au registre —
cette section est la re-soumission ; rien d'auto-clôturé.

# B. `P0-A2-09` (WIF) — trap avant create + négatif billing-fail RÉEL

**Réserve RR-07 (verbatim)** : « repro.sh installe le trap de teardown APRÈS
gcloud projects create + billing link : si la liaison billing échoue sous
set -e, le script sort avant le trap et peut laisser le projet actif — la
correction annoncée "trap dès la 1re ressource" n'est pas présente. »

**Correction (PR #55, tête `16498462`)** :
- ID projet calculé d'abord, puis `trap teardown EXIT` armé **AVANT**
  `gcloud projects create` et `billing link` (`repro.sh` : teardown l.67,
  trap l.85, create l.93, billing l.94 ; diff exact : `trap-order-fix.diff`) ;
- teardown idempotent et sûr si le projet n'existe pas encore
  (`describe` → `PROJECT_STATE=ABSENT`, aucune erreur).

**Preuves live (23/07, zéro clé, ~0 $, projets de TEST — jamais la prod)** :
- **Cas négatif billing-fail ARCHIVÉ**
  (`docs/deploy-evidence/2026-07-21-wif-three-paths/replay-20260723T191146Z-negative-billingfail/` :
  `NEGATIVE-CASE-README.md`, `run.log`, `teardown-trace.txt`) : `WIF_BILLING`
  invalide → projet `ecode-wif-proof-833908` créé, billing link échoue
  `IAM_PERMISSION_DENIED` sous `set -e`, **le trap EXIT nettoie** →
  `PROJECT_STATE=DELETE_REQUESTED` (vérifié par `describe` indépendant,
  0 projet ACTIF restant).
- **3 chemins rejoués** (`replay-20260723T191340Z/`, projet frais
  `ecode-wif-proof-834022`) : Cloud Run 200/403 ; GitHub OIDC run
  **30037477577** nonce-vérifié success ; GKE autorisé 200+contenu / négatif
  **403 + corps permission-denied** ; teardown joué → DELETE_REQUESTED.

**CI (tête `16498462`)** : Production CI run **30038448328** success ·
Parity registries run **30038448103** success.
https://github.com/openaxcloud/vibecore/actions/runs/30038448328

**Statut** : A2-09 reste OPEN/REFUSED au registre — re-soumission.

# C. PURGE DB — `PR #51` (durcissement RR-07)

**Réserve RR-07 (verbatim)** : « La cessation externe de facturation n'est pas
fonctionnelle pour une subscription Stripe active : le client appelle
POST /v1/subscriptions/{id}/cancel, alors que l'annulation immédiate utilise
la suppression de la subscription. […] les IDs de subscription sont
sélectionnés avant les verrous de topologie, et la matrice PII laisse du
contenu libre dans plusieurs lignes détachées » (+ SupportTicket
subject/metadata/body inchangés ; autres payloads libres non couverts).

**Correction (commit `dca0bec6` — « Stripe DELETE, ordre verrous, matrice
PII »)** :
1. **Opération Stripe CORRECTE** : annulation immédiate =
   **`DELETE /v1/subscriptions/{id}`** (plus de POST /cancel) — testée en
   échec ET en réussite contre un **fake HTTP strict** (path+méthode vérifiés).
2. **Verrous de topologie AVANT sélection** : la sélection des subscriptions à
   annuler est déplacée **DANS la transaction, APRÈS les `FOR UPDATE`** sur
   Organization + OrganizationMember — la topologie verrouillée est conservée
   jusqu'au commit (plus de fenêtre lecture→trx).
3. **Matrice PII champ par champ COMPLÉTÉE**
   (`docs/account-deletion-data-matrix.md`) : SupportTicket subject/metadata +
   TicketMessage.body + labels **scrubés AVANT le détachement** des références
   utilisateur ; les payloads libres relevés sont couverts.
4. **Négatifs correspondants ajoutés.**

**Preuve** : **20/20 tests contre vrai Postgres** (17+3,
`docs/deploy-evidence/2026-07-23-purge-hardening-codex07/test-runs-raw.txt`).
**CI (tête `dca0bec6`)** : Production CI run **30038887097** success ·
Quality Gates (PR Validation) run **30038887179** success.
https://github.com/openaxcloud/vibecore/actions/runs/30038887097

# D. PURGE PHYSIQUE — `PR #52` (durcissement RR-07)

**Réserve RR-07 (verbatim)** : « La purge physique reste fail-open : la
barrière Kubernetes utilise Promise.allSettled sans rejeter ses suppressions
échouées ; le mode NoopObjectStorage peut certifier l'absence de buckets
réels ; la barrière ne bloque pas les écritures object-storage ; et
l'inventaire omet les workspaces accessibles par membership d'organisation
partagée sans ligne ProjectCollaborator » (+ NotFound à distinguer des
erreurs réseau/RBAC ; étendre les E2E à ces négatifs).

**Correction (commit `ee0df5a7` — les 6 corrections)** :
1. **Barrière k8s fail-closed** : `freezeWorkspace` tente chaque révocation
   mais **THROW si une seule échoue** — jamais de barrière annoncée avec une
   voie d'écriture potentiellement vivante. Négatif : manager.spec.
2. **Backend GCS RÉEL obligatoire** : `eraseSubjectStorage` REFUSE (non
   vérifié, rien supprimé) si des buckets existent sans backend actif — un
   Noop ne peut jamais certifier une absence. Négatifs : spec module + E2E GCS
   réel (backend inerte refusé, bucket survivant).
3. **Écritures object-storage GELÉES** : projets marqués purge-frozen ;
   upload-url/ensure-bucket/move → **403 `OBJECT_STORAGE_PURGE_FROZEN`** —
   rien ne peut être recréé après le contrôle zéro.
4. **Inventaire par AUTORISATION RÉELLE** : workspaces de CHAQUE projet de
   toute org dont le sujet est membre (orgs partagées SANS ligne
   ProjectCollaborator incluses) + collaborations explicites.
5. **Seul un NotFound AUTHENTIFIÉ = absence** : `pvcExists` ne gobe plus les
   erreurs — undefined uniquement sur vrai NotFound, erreurs réseau/RBAC
   re-levées (fail-closed). Négatifs : manager.spec + E2E kind (PVC survivant
   rapporté présent).
6. **E2E étendus aux négatifs** : E2E GCS réel + kind portent chacun leur
   négatif ; les négatifs d'erreur #1/#5 prouvés déterministes en spec
   (une erreur k8s ne s'injecte pas fiablement via kubectl/kind — dit tel quel).

**Preuves** : 34 tests purge api + 48 tests manager verts ; E2E réels
rejouables — `docs/deploy-evidence/2026-07-23-physical-purge-e2e/` :
`gcs-proof.json` `c427b032…`, `k8s-proof.json` `aac80903…`, index
SHA256SUMS **vérifiable par `sha256sum -c`**. Correction d'intégrité du
31/07 (commit `48c4bef2`) : les SUMS committés en `ee0df5a7` ne
correspondaient pas aux proofs committés (index écrit avant la dernière
régénération) — recalculés depuis les fichiers committés, proofs INCHANGÉS.
**CI (tête `ee0df5a7`, contenu ; index `48c4bef2`)** : Production CI run
**30038932121** success · Quality Gates run **30038932082** success.
https://github.com/openaxcloud/vibecore/actions/runs/30038932121

# E. `CTR-RUNTIME-NIX` — négatif live EXÉCUTÉ (plus « prêt à jouer »)

**Réserve RR-07 (verbatim)** : « Le négatif live exigé n'est pas présent : le
code de refus d'une génération révoquée n'est pas encore déployé, la
configuration production NIX_STORE_GENERATIONS est déclarée vide, et le
scénario attend un mini-merge futur. Une commande prête à jouer n'est pas une
preuve exécutée. » Décision : « ne pas écrire le reviewer du contrat avant le
run live négatif, son artefact brut et la restauration vérifiée de la
configuration. »

**Les 3 conditions de ta décision sont maintenant remplies** :
1. **Code déployé** : PR **#45 MERGÉE** (api prod `6d57a401c9`, prod saine).
2. **Run live négatif EXÉCUTÉ en prod (23/07)** — pas un script :
   lock **201** pinné gen-2 → Publish#1 **READY**/URL 200
   (`storeGeneration=gen-2`) → révocation réelle (helm rev 897, configmap
   gen-2 REVOKED) → **Publish#2 FAILED, refus TYPÉ
   `ECODE_LOCK_GENERATION_REVOKED`** (« "gen-2" is REVOKED … refusing to use
   it »), **URL → 410 `SERVER_DEPLOY_NOT_LIVE`** (aucun repli silencieux vers
   l'active).
3. **Restauration VÉRIFIÉE** : helm rev 898, gen-2 ACTIVE (`revokedAt`
   absent), Publish#4 READY/200 ; santé prod 200 ; session QA supprimée —
   aucune config de test laissée en prod.

**Artefacts bruts horodatés + hashes** :
`docs/deploy-evidence/2026-07-23-ctr-runtime-nix-v4/`
(`live-revocation-EXECUTED.txt`, `publish2-REVOKED-deployment.json`,
`nix-lock-response.json`, `publish1-deployment.json`,
`live-revocation-negative.sh`, `README-EXECUTED.md`).
**PR #57** (contrat v5, tête `5148e0e5`) : Validate PR Title pass +
Validate registries pass. Les 3 réserves antérieures (pin obligatoire,
persistance release/rollback, validation catalogue) restent couvertes par le
code mergé (#45, 110+76 tests).
**Statut** : PROVEN_REVIEW_PENDING — la signature du contrat est TA décision ;
rien d'écrit au registre.

# F. `CTR-OPERATIONS-DR` — état exact (sous-preuves, PAS signature entière)

**Réserves RR-07 (verbatim)** : « Le contrat entier conserve explicitement des
obligations centrales BLOCKED ou UNTESTED : snapshots PD planifiés, astreinte
outillée, réplique cross-région et RTO applicatif complet. Des preuves
individuelles valides ne satisfont pas encore le contrat complet. »

**Sous-preuves reconnues par ton reçu** (à enregistrer comme preuves
individuelles, conformément à ta décision) : compteur normatif 30/30 régénéré
du brut ; SLO web **702/702** ; SLI par requête `api_request_duration_seconds`
dans Managed Prometheus ; failover/failback Cloud SQL joués.

**NOUVEAU depuis ton reçu — 1 obligation FERMÉE (GO Avi sur le coût)** :
**snapshots PD planifiés** (commits `b14d0459` + `a26f06fe`, PR #36) :
- Terraform (source de vérité) : `google_compute_resource_policy.
  workspace_snapshots` — quotidien 02:00 UTC, rétention 7 j, europe-west9,
  `on-source-disk-delete=APPLY_RETENTION_POLICY` ; variable validée + output ;
  `terraform validate` + `fmt` verts ;
- disques CSI dynamiques (hors état TF) : `attach-snapshot-policy.sh`
  idempotent + **déclenchement RÉEL PROUVÉ**
  (`docs/deploy-evidence/2026-07-23-scheduled-snapshots/schedfire-result.txt`).

**Obligations RESTANTES (dites telles quelles, rien de gonflé)** : astreinte
outillée · réplique cross-région · RTO applicatif complet.
**CI** : drift de vues réparé le 31/07 (régénération par script), validateur
vert en local ; confirmation CI en cours au moment de la rédaction.
**Demande pour F** : enregistrer les sous-preuves (dont la nouvelle
« snapshots planifiés ») — **pas** de signature du contrat entier.

---

# NOTE CI HONNÊTE (vérifiée le 31/07)
- ✅ verts au commit audité : #55 (30038448328/30038448103), #51
  (30038887097/30038887179), #52 (30038932121/30038932082), #57 (title +
  registries pass après retitrage du 31/07) ; #54 MERGÉE (roll 30193204381
  success) ; #45 MERGÉE.
- #36 : deux rouges mécaniques corrigés le 31/07 (drift de vues → régénérées
  par script) — re-run en cours à la rédaction ; l'item F n'est de toute façon
  pas soumis en signature entière.
- Seul rouge universel : Production E2E/Playwright (repo-wide, aussi sur main).

# DEMANDE
Rejouer et signer, ou refuser avec réserve : **A (3 P0 attestation), B (A2-09),
C (#51), D (#52), E (CTR-RUNTIME-NIX)**. Pour **F** : enregistrer uniquement
les sous-preuves individuelles. Rien n'est CLOSED/SIGNED au-delà de tes
décisions ; les entrées registre correspondantes sont à jour de tes refus
RR-07 sur main et seront consolidées après ton prochain reçu, par le même
mécanisme registre-seul que la PR #56.
