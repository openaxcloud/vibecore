# WIF — 3 chemins d'identité prouvés LIVE sur GCP (P0-A2-09)

**evidenceId :** `docs/deploy-evidence/2026-07-21-wif-three-paths/`
**Branche :** `feat/wif-three-paths-live`
**Objet :** élever P0-A2-09 d'une preuve DOC (citation GCP-13) à une preuve LIVE des
3 chemins d'identité Workload Identity, **zéro clé de service persistante**.

## Cadre (sécurité)
- Projet de TEST dédié **`ecode-wif-proof-619021`**, créé sous le **folder de test
  `780512954993` (ecode-factory-test)** — JAMAIS la prod `vibecore-495216` —
  rattaché au compte de facturation existant, setup via l'admin org
  `groupequaliwatt@gmail.com`.
- Idempotence : aucun projet `ecode-wif-proof-*` préexistant → un seul créé.
- Identités de test dédiées `wif-authorized` (rôle minimal `storage.objectViewer`
  sur un bucket test) et `wif-wrong` (aucun accès). **Aucune clé** créée
  (`serviceAccounts.keys.create` jamais utilisé). Audit logs Data Access activés.
- Coût réel **~0 $** (Cloud Run scale-to-zero + quelques invocations, bucket de
  36 octets, image AR <1 h, IAM/STS/WIF gratuits, build via Docker local = pas de
  Cloud Build). Plafond dur = teardown (suppression du projet).

## Les 3 chemins — action autorisée + négatif

### Chemin 1 — GKE WIF « re-cité » (lecture seule sur le cluster prod)
Confirme la citation GCP-13 (« In GKE, Google Cloud manages the workload identity
pool and provider for you and doesn't require an external identity provider ») en
RÉEL sur `vibecore-prod-app` : [`path1-gke-recited.txt`](path1-gke-recited.txt)
- **Pool géré** : `vibecore-495216.svc.id.goog` (GKE le gère, aucun IdP externe).
- **AUTORISÉ** : la KSA `vibecore-vibecore-platform-api` est liée à la GSA
  `vibecore-prod-platform` via `roles/iam.workloadIdentityUser` → impersonation par
  le metadata server, **sans clé**. La GSA n'a **aucune clé user** (4 SYSTEM_MANAGED).
- **NÉGATIF** : une KSA non liée n'a aucun grant `workloadIdentityUser` → refus.

### Chemin 2 — WIF externe GitHub OIDC → impersonation sans clé
Pool + provider OIDC (`token.actions.githubusercontent.com`, condition
`assertion.repository=='openaxcloud/vibecore'`) + grant sur la SA autorisée.
Prouvé par un **run GitHub Actions réel** : [`path2-github-oidc.txt`](path2-github-oidc.txt)
(run https://github.com/openaxcloud/vibecore/actions/runs/29812447097)
- **AUTORISÉ** : `CREDENTIAL_FILE=…/gha-creds-*.json (external_account/federated, NOT
  a key)` ; token obtenu par WIF impersonation ; **READ_HTTP=200**,
  `SECRET_CONTENT=wif-proof-secret-content-…` → lecture du bucket **sans clé**.
- **NÉGATIF** : impersonation de `wif-wrong` (non autorisée) →
  `AUTH_STEP_OUTCOME=failure` → **DENIED**.

### Chemin 3 — Cloud Run metadata sans clé
Service Cloud Run avec l'identité de service ; il récupère un token via le
**metadata server** (aucune clé) et lit le bucket.
- **AUTORISÉ** [`path3-cloudrun-authorized.json`](path3-cloudrun-authorized.json) :
  `{"identity":"wif-authorized…","keyUsed":false,"read_status":200,"secret":"wif-proof-secret-content-…"}`
- **NÉGATIF** [`path3-cloudrun-negative.json`](path3-cloudrun-negative.json) : même
  service en SA `wif-wrong` → `"keyUsed":false,"read_status":403` (storage.objects.get denied).

## Teardown (joué à la fin)
[`teardown-trace.txt`](teardown-trace.txt) — Cloud Run supprimé → AR supprimé →
provider+pool WIF supprimés → 2 SAs supprimées → **projet `ecode-wif-proof-619021`
= DELETE_REQUESTED** (suppression planifiée, fenêtre de récup 30 j GCP).

## Reproduire
Voir [`repro.sh`](repro.sh) (création projet sous folder test → base → 3 preuves →
teardown). Nécessite `CLOUDSDK_PYTHON` = Python 3.10+ (le gcloud `run`/`storage`
crash sous Python 3.9). Le chemin 2 nécessite un run GitHub Actions
(`.github/workflows/wif-proof.yml`).

## Statut
**PROVEN_REVIEW_PENDING** — implémenté + prouvé LIVE sur branche
`feat/wif-three-paths-live` (PR ouverte, non mergée). **NE PAS clôturer P0-A2-09
avant re-signature humaine.**
