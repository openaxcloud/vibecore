# WIF — 3 chemins d'identité prouvés LIVE sur GCP, de bout en bout REJOUABLE (P0-A2-09)

**evidenceId :** `docs/deploy-evidence/2026-07-21-wif-three-paths/`
**Branche :** `feat/wif-three-paths-replayable`
**Objet :** corriger le refus « preuve non rejouable » (REPONSE_EXPERT_PR40_20260722 §D1)
et re-prouver LIVE les 3 chemins Workload Identity, **zéro clé de service**, de bout
en bout **rejouable** (provision → configure → JOUE → teardown), coût **~0 $**.

## Ce que le refus exigeait (§D1) et comment c'est corrigé
1. **`repro.sh` était partiellement commenté** → réécrit **exécutable de bout en
   bout** : il provisionne un projet de test frais, puis **configure ET JOUE**
   réellement les 3 chemins (aucune étape commentée), avec assertions strictes.
2. **Workflow GitHub codé en dur sur un projet supprimé** → `.github/workflows/wif-proof.yml`
   est **paramétré par des inputs `workflow_dispatch`** (`project_id`,
   `project_number`, `bucket`, `authorized_sa`, `wrong_sa`, `expect_prefix`) →
   rejouable après teardown avec un projet neuf.
3. **Le `curl` autorisé ne rougissait pas sur 403/404** → chaque lecture autorisée
   **exige HTTP 200 + contenu attendu**, sinon le script/le job **échoue**.
4. **Le négatif GKE n'était qu'une assertion** → un **vrai cluster GKE de test** est
   créé, un pod avec une **KSA non liée** est **réellement joué** et sa sortie
   (token/impersonation refusé, ou identité ≠ GSA autorisée) est **archivée**.
5. **Dockerfile `COPY main.py .`** alors que le fichier est `cloudrun-main.py` →
   **corrigé** (`COPY cloudrun-main.py main.py`).

⚠️ Les logs de preuve étaient avalés par `.gitignore` (`*.log`) → exception ajoutée
(`!docs/deploy-evidence/**`) : les artefacts de preuve sont bien suivis dans git.

## Corrections V3 FAIL-CLOSED (REPONSE_EXPERT_V3_20260722 §P0-A2-09)
Le reproducer pouvait finir sans avoir correctement reproduit les 3 chemins → durci :
1. **`gh` OBLIGATOIRE** : un **préflight fail-closed** vérifie `gcloud/docker/kubectl/gh/curl`
   + `gh auth status` **avant tout provisioning** ; sans `gh` authentifié, le script
   sort en erreur (plus de branche « commande manuelle »).
2. **run GitHub suivi par NONCE EXACT** : chaque dispatch porte un `nonce` unique ; le
   workflow expose `run-name: wif-proof <nonce>` ; `repro.sh` récupère le `databaseId`
   dont le `displayTitle` **contient le nonce** (jamais « le plus récent »), et **re-vérifie
   le nonce** sur le run choisi — un run concurrent ne peut pas être lu par erreur.
3. **négatif GKE = refus IAM PRÉCIS** : on exige **HTTP 401/403** ET un **corps de refus
   contrôlé** (`does not have storage.objects.get` / permission-denied) ; un `000/404/5xx`
   **échoue** (ne prouve pas un refus IAM). Identité vérifiée ≠ GSA autorisée.
4. **trap de teardown installé DÈS la création du projet** (`trap teardown EXIT`,
   idempotent) → toute erreur intermédiaire nettoie le projet (0 ressource/coût résiduel).
5. **3 chemins rejoués** après corrections ; nouveau run archivé sous `replay-<ts>/`.

**Preuve du run V3 (rejouée)** : voir `replay-20260723T114035Z/` — Cloud Run 200/403,
GitHub OIDC run **suivi par nonce** (`path2-github-oidc.txt`, `displayTitle` porte le
nonce, conclusion=success), **GKE négatif 403 + corps permission-denied**
(`path1-gke-negative.txt`), **teardown joué par le trap** (`teardown-trace.txt`,
`PROJECT_STATE=DELETE_REQUESTED`). **0 projet actif restant → ~0 $.**

## Correction RR-20260723-CODEX-07 §P0-A2-09 — trap ARMÉ *AVANT* create/billing
Le refus V3 disait « trap installé DÈS la création », mais dans les faits le
`trap teardown EXIT` était armé **après** `gcloud projects create` **ET**
`gcloud billing projects link`. Sous `set -Eeuo pipefail`, si la **liaison billing
échoue**, le script sort AVANT l'armement du trap → **projet laissé ACTIF** (ressource
facturable orpheline). Corrigé :
- L'ID du projet est calculé **d'abord**, puis `trap teardown EXIT` est armé **AVANT**
  `gcloud projects create` et `gcloud billing projects link` (`repro.sh` :
  `teardown()` l.94, `trap` l.108, `create` l.116, `billing link` l.117).
- Le teardown est **idempotent ET SÛR si le projet n'existe pas encore** : garde
  `gcloud projects describe` → s'il n'existe pas, `PROJECT_STATE=ABSENT`, aucune erreur.
  *(⚠️ cette garde binaire a ensuite été refusée — voir RR-08 ci-dessous : un échec de
  `describe` ≠ « projet absent ».)*

**Preuve du cas négatif billing-fail** (rejoué live 2026-07-23) :
`replay-20260723T191146Z-negative-billingfail/` — `repro.sh` lancé avec un compte de
facturation **invalide** (`WIF_BILLING=000000-000000-000000`). `run.log` montre le trap
armé **avant** le create puis « crée `ecode-wif-proof-833908` » ; la liaison billing
échoue (`IAM_PERMISSION_DENIED`) sous `set -e` → **le trap EXIT nettoie le projet créé**
→ `teardown-trace.txt` : `PROJECT_STATE=DELETE_REQUESTED` (vérifié indépendamment :
`gcloud projects describe` → `DELETE_REQUESTED`, `0` projet `ecode-wif-proof-*` ACTIF).
Voir `NEGATIVE-CASE-README.md` dans ce dossier. Avec l'ancien ordre, ce même échec aurait
laissé le projet **ACTIF**.

**3 chemins REJOUÉS après le correctif** (projet frais `ecode-wif-proof-834022`) :
`replay-20260723T191340Z/` — Cloud Run autorisé 200 + contenu / négatif 403
(`path3-cloudrun-*.json`) ; GitHub OIDC run **30037477577** nonce-vérifié `success`
(`path2-github-oidc.txt`, autorisé READ_HTTP=200 + `NEGATIVE_OK`) ; GKE autorisé
READ_HTTP=200 + contenu / négatif **403 + corps permission-denied**, identité
`ecode-wif-proof-834022.svc.id.goog` ≠ GSA autorisée (`path1-gke-*.txt`) ;
teardown joué par le trap (`teardown-trace.txt` : cluster/run/AR/pool/2 SAs supprimés →
`PROJECT_STATE=DELETE_REQUESTED`). Le diff exact de l'ordre trap↔create est archivé dans
`trap-order-fix.diff`.

> Note GCP : `gcloud projects describe` (autoritatif) renvoie `DELETE_REQUESTED` dès le
> teardown ; `gcloud projects list --filter=lifecycleState:ACTIVE` peut encore lister le
> projet quelques minutes (lag d'index d'eventual-consistency). Les ressources facturables
> (cluster GKE, Cloud Run, AR, SAs) sont supprimées et le projet est marqué pour purge →
> facturation stoppée, coût **~0 $**.

## Correction RR-20260723-CODEX-08 (RR-08) §P0-A2-09 — teardown FAIL-CLOSED
> ⚠️ **Superseded par RR-09 (ci-dessous)** : la classification décrite ici s'appuyait sur
> le **texte** d'erreur + `gcloud auth print-access-token` pour conclure `NOTFOUND`. RR-09 a
> refusé ce critère (un jeton valide ≠ autorisation `projects.get`). La logique effective est
> désormais celle de la section RR-09 (statut HTTP structuré). Ce bloc est conservé pour la
> traçabilité du refus.

Le refus RR-08 vise la garde `if gcloud projects describe … ; then … else "absent"` :
**tout** échec de `describe` (réseau / API / auth / quota) était lu comme « projet absent »
→ la suppression était **sautée** → un flap pouvait laisser le projet **actif**. La preuve
billing-fail ne couvrait que le cas où `describe` répond bien.

Corrigé — logique extraite dans **`teardown-lib.sh`** (sourcée par `repro.sh`), FAIL-CLOSED :
1. **Parse du motif d'erreur** : `NOTFOUND` n'est conclu que sur motif not-found **ET** auth
   prouvée saine (`gcloud auth print-access-token`) ; permission explicite / transitoire /
   auth non prouvée ⇒ `UNKNOWN`.
2. **Retry** de `describe` sur erreurs transitoires (réseau/5xx/quota), borné.
3. **`gcloud projects delete` tenté MÊME quand l'état est `UNKNOWN`** (illisible).
4. **Reçu fail-closed** : `CLEANUP_RECEIPT=OK` seulement si l'état FINAL est `DELETE_REQUESTED`
   ou `NOTFOUND` authentifié ; sinon `CLEANUP_RECEIPT=FAILED` → `repro.sh` sort en erreur.

**Test à injection de fautes (exigence 5)** — `teardown-lib.spec.sh` + `rr08-teardown-faultinjection/`
(`spec-output.txt`, **PASS=23 FAIL=0**) : un **mock `gcloud`** simule chaque panne. Le cas
`transient_persistent` (erreur réseau à chaque `describe`) prouve que **la suppression est
tentée quand même** et que le **reçu échoue fail-closed** ; `notfound_auth` vs
`notfound_auth_broken` prouvent qu'un not-found n'est conclu « absent » **que** si l'auth est
saine ; `delete_fails_active` prouve que le reçu **ne passe pas** sur un projet resté ACTIF.

**Preuves live (2026-07-31, nouveau teardown)** :
- Cas négatif billing-fail — `replay-20260731T151804Z-rr08-negative-billingfail/` :
  `DESCRIBE_CLASSIFICATION=PRESENT:ACTIVE` → delete tenté → `PROJECT_STATE=DELETE_REQUESTED`,
  `CLEANUP_RECEIPT=OK` (projet `ecode-wif-proof-511088`, `describe` indépendant = `DELETE_REQUESTED`).
- 3 chemins rejoués — `replay-20260731T154358Z-rr08/` (projet frais `ecode-wif-proof-512642`) :
  Cloud Run 200/403 ; GitHub OIDC nonce-vérifié `success` ; GKE 200 / négatif 403+corps ;
  teardown fail-closed → `CLEANUP_RECEIPT=OK`, `PROJECT_STATE=DELETE_REQUESTED`.

## Correction RR-20260723-CODEX-09 (RR-09) §P0-A2-09 — NOTFOUND sur STATUT HTTP structuré
Le refus RR-09 vise le critère `NOTFOUND` de RR-08 : conclure « absent » sur le message
ambigu « project **not found or permission denied** » dès que `gcloud auth print-access-token`
réussit est **faux** — un jeton valide prouve l'**authentification**, pas l'**autorisation**
`projects.get`. Un principal authentifié mais **sans** droit de lecture sur un projet
**existant** reçoit ce même message et aurait été classé « absent » → suppression sautée.

Corrigé — `classify_project_state` (dans `teardown-lib.sh`) interroge **Cloud Resource
Manager v1 `projects.get`** et classe sur le **code HTTP structuré**, jamais sur le texte :
- `200` → `PRESENT:<lifecycleState>` ;
- `404` **ET** `error.status == NOT_FOUND` → `NOTFOUND` (vrai absent, non ambigu) ;
- `401` / `403` / `404` sans statut structuré → **`UNKNOWN`** (jamais « absent ») ;
- `000` / `408` / `429` / `5xx` → transitoire → retry borné → `UNKNOWN`.

Le `delete` est **tenté même en `UNKNOWN`**, et le reçu n'émet `CLEANUP_RECEIPT=OK` que sur
`DELETE_REQUESTED` ou `NOT_FOUND` structuré (404) — sinon `FAILED` + `exit != 0`.

> Fait GCP vérifié live : `GET /v1/projects/<inexistant>` renvoie **HTTP 403 PERMISSION_DENIED**
> (pas 404). L'ambiguïté 403 reste donc `UNKNOWN` → delete tenté → reçu fail-closed. C'est le
> comportement maximalement prudent voulu par RR-09.

**Test à injection de fautes** — `teardown-lib.spec.sh` (mocks `gcloud` **et** `curl`),
`rr08-teardown-faultinjection/spec-output.txt` : **PASS=31 FAIL=0**. Cas ajoutés RR-09 :
`ambiguous_403` (403 « not found or permission denied » → **PAS** NOTFOUND, reçu FAILED) ;
**`exists_no_getdelete`** (jeton VALIDE + projet EXISTANT + principal **sans** `projects.get`
NI `projects.delete` : GET 403, delete 403 → **reçu FAILED, pas OK**) ; `ambiguous_404_no_status`
(404 sans statut → PAS NOTFOUND) ; `notfound_structured_404` (seul cas concluant NOTFOUND).

**Preuves live (2026-08-03, teardown RR-09 REST)** :
- Négatif billing-fail — `replay-20260803T064401Z-rr09-negative-billingfail/` :
  `DESCRIBE_CLASSIFICATION=PRESENT:ACTIVE` (via CRM 200) → delete → `PROJECT_STATE=DELETE_REQUESTED`,
  `CLEANUP_RECEIPT=OK` (projet `ecode-wif-proof-739444`).
- 3 chemins — `replay-20260803T064443Z-rr09/` (projet frais `ecode-wif-proof-739484`) :
  Cloud Run 200/403 ; GitHub OIDC nonce-vérifié `success` ; GKE 200 / négatif 403+corps ;
  teardown fail-closed → `CLEANUP_RECEIPT=OK`, `PROJECT_STATE=DELETE_REQUESTED`.

## Cadre (sécurité)
- Projet de TEST dédié `ecode-wif-proof-*`, créé sous le **folder de test
  `780512954993` (ecode-factory-test)** — JAMAIS la prod `vibecore-495216` —
  rattaché au compte de facturation existant, via l'admin org `groupequaliwatt@gmail.com`.
- Idempotence : réutilise un `ecode-wif-proof-*` ACTIF s'il existe, sinon un seul créé.
- Identités de test `wif-authorized` (rôle minimal `storage.objectViewer`) et
  `wif-wrong` (aucun accès). **Aucune clé** créée (`serviceAccounts.keys.create`
  jamais utilisé). Audit logs Data Access activés.
- Coût réel **~0 $** : Cloud Run scale-to-zero, GKE test = 1 nœud `e2-small` **spot**
  supprimé en fin de run, bucket de quelques octets, image AR <1 h, IAM/STS/WIF
  gratuits, build Docker local (pas de Cloud Build). Plafond dur = teardown.

## Les 3 chemins — action autorisée (200 + contenu) + négatif RÉEL

### Chemin 1 — GKE WIF (cluster de test) : `replay-<ts>/path1-gke-*.txt`
- **Pool géré** `${PROJECT}.svc.id.goog` (GKE le gère, aucun IdP externe).
- **AUTORISÉ** : KSA `ksa-authorized` (ns `wif`) annotée + liée à la GSA
  `wif-authorized` via `roles/iam.workloadIdentityUser` → un pod récupère le token
  via le **metadata server** (sans clé) et lit le bucket → **READ_HTTP=200 + contenu
  attendu** (sinon échec).
- **NÉGATIF RÉEL** : KSA `ksa-unbound` **non liée** → un pod réellement exécuté ne
  peut pas usurper la GSA autorisée (token/impersonation refusé, ou identité ≠
  `wif-authorized`) → sortie archivée.

### Chemin 2 — WIF externe GitHub OIDC → impersonation sans clé : `replay-<ts>/path2-github-oidc.*`
Pool + provider OIDC (`token.actions.githubusercontent.com`, condition
`assertion.repository=='openaxcloud/vibecore'`) + grants `workloadIdentityUser` et
`serviceAccountTokenCreator`. **Workflow paramétré** déclenché par `repro.sh` via
`gh workflow run wif-proof.yml --ref feat/wif-three-paths-replayable -f project_id=… -f …`.
- **AUTORISÉ** : credential = `external_account` (fédéré, **pas une clé**) ;
  **READ_HTTP=200** + contenu attendu (le job échoue sur 403/404 ou contenu inattendu).
- **NÉGATIF** : impersonation de `wif-wrong` (non autorisée) →
  `AUTH_STEP_OUTCOME=failure` → `NEGATIVE_OK`.

### Chemin 3 — Cloud Run service identity sans clé : `replay-<ts>/path3-cloudrun-*.json`
Service Cloud Run (image buildée depuis le Dockerfile corrigé) ; il récupère un
token via le **metadata server** (`keyUsed:false`) et lit le bucket.
- **AUTORISÉ** : `{"identity":"wif-authorized…","keyUsed":false,"read_status":200,"secret":"wif-proof-secret-content-…"}`
  — le script exige `read_status==200` **et** contenu préfixé, sinon échec.
- **NÉGATIF** : même service en SA `wif-wrong` → `"read_status":403` (denied).

## Teardown (joué à la fin) : `replay-<ts>/teardown-trace.txt`
Cluster GKE supprimé → Cloud Run supprimé → AR supprimé → provider+pool WIF
supprimés → 2 SAs supprimées → **projet `ecode-wif-proof-*` = DELETE_REQUESTED**.

## Reproduire
`./repro.sh` (nécessite `export CLOUDSDK_PYTHON=<python3.10+>`, `docker`, `gh`,
`kubectl`). Le chemin 2 nécessite que le workflow paramétré soit présent sur le ref
dispatché (branche `feat/wif-three-paths-replayable`). Toutes les valeurs propres au
projet frais sont passées en paramètres → **rien de codé en dur**.

> Les fichiers `path1-gke-recited.txt`, `path2-github-oidc.txt`,
> `path3-cloudrun-*.json`, `teardown-trace.txt` à la racine sont la **trace du 1er
> run** (projet `ecode-wif-proof-619021`, désormais supprimé) ; la **preuve
> rejouable** est le sous-dossier `replay-<ts>/` produit par `repro.sh`.

## Statut
**PROVEN_REVIEW_PENDING** — implémenté + prouvé LIVE + rejouable sur branche
`feat/wif-three-paths-replayable` (PR ouverte, non mergée). **NE PAS clôturer
P0-A2-09 avant re-signature humaine.**
