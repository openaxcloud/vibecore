# CloudTenant + Project Factory + identités IAM — preuves live (2026-07-17)

Implémentation du contrat `docs/parity/DOMAIN_MODEL.md` §3 (CloudTenant) et §4
(IAM), plus la machine à états Project Factory. **Avant le 17/07, seuls les
contrats existaient — zéro ligne d'implémentation.**

Code : migration `0079_cloud_tenant_factory_iam` + `services/api/src/`
`cloud-governance-store.ts` · `cloud-tenant-service.ts` ·
`cloud-project-factory.ts` · `iam-identity-service.ts` · `gcp-cloud-client.ts`
· `cloud-governance-routes.ts` (admin, kill-switch `CLOUD_TENANT_FACTORY_ENABLED`).
38 tests unitaires (négatifs d'abord) + harness live committé
(`src/tests/cloud-governance-live-proof.ts`, `cloud-governance-restore-proof.ts`).

Les preuves ont été exécutées le **2026-07-17** par le **vrai code service**
(`PrismaCloudGovernanceStore` sur Postgres réel, `RestGcpCloudClient` sur le
control plane GCP réel), org `groupequaliwatt-org` (974552983243), folder de
test `folders/780512954993`, projet réel créé `ecode-proof-b906ss`
(n° 859076086179).

## ⚠️ Provenance des artefacts (incident de perte + reconstruction, 21/07)

Le worktree du 17/07 a été purgé (macOS /tmp) AVANT commit — code et journaux
JSONL originaux perdus. État de chaque artefact :

- **Données primaires re-exportées le 21/07 (fraîches, non reconstruites)** :
  - `audit-logs-folder-scope.json` — audit logs **de Google** (folder scope) :
    les 6 événements du cycle complet, horodatés côté Google ;
  - `db-rows.jsonl` — les 17 lignes réelles de la base de preuve
    (`cloudtenant_proof`, survivante dans le container Postgres local) :
    tenant, bindings, 11 events de factory, transfert avec évidences,
    teardown record COMPLETE, identité runtime `revisionsServed=2` ;
  - `project-describe-current.json` — état actuel du projet (ACTIVE,
    post-restauration).
- **`proof-run.transcript-excerpts.md`** — extraits VERBATIM des journaux
  JSONL originaux, reconstitués depuis le transcript de session du 17/07.
  Étiquetés comme tels ; chaque fait clé y est recoupé par les données
  primaires ci-dessus.
- **Le code** a été réécrit à l'identique depuis le même transcript (contenu
  intégral des fichiers), 38/38 tests verts à la réécriture.

## P1 — Rate limit de création de folders : MESURÉ, pas supposé (17/07)

Burst de 20 `POST /v3/folders` dos à dos puis sondes espacées de 10 s
(script `harness/measure-folder-ratelimit.sh`) :

- **Premier 429 à la requête #10** (~28 s) — burst utile ≈ 9-10.
- Erreur GCP exacte : quota metric **« Folder V3 create requests »**, limite
  **« Folder V3 create requests per minute »**.
- **Débit soutenu mesuré : 23 créations en 236,3 s = 5,8 folders/min
  (0,097 req/s)** — confirme le 0,1 req/s du contrat.
- À 10 s d'intervalle : 10/12 OK (bucket ~1 req/10 s).

Le JSONL brut per-requête a été perdu avec le worktree ; la table complète
des 32 requêtes (timings + codes HTTP) est conservée verbatim dans
`proof-run.transcript-excerpts.md` §P1. Les 23 folders de test ont été
supprimés après mesure (leurs create/delete sont dans les logs Google du
folder, période 17/07 09:46-10:0x UTC, requêtables au même scope).

Conséquence architecturale (tranchée, maintenant mesurée) : **un folder par
tenant est infaisable** — à 1 000 clients l'onboarding serait ~3 h de
rate-limit pur. La factory ne crée un folder `shard-<n>` que quand tous les
shards existants sont pleins (`SHARD_CAPACITY=280 < 300`), jamais par tenant.

## P2 — Deux CloudTenants ne partagent JAMAIS un projet

1. Tenant A lie `ecode-proof-b906ss` → OK (`db-rows.jsonl` : binding
   `cmrou21ir…`, tenant `cmrou1vey…`).
2. Tenant B tente de lier le MÊME projet via le service →
   **409 `TENANT_PROJECT_CONFLICT`**.
3. INSERT direct Prisma **contournant le service** → refusé par la contrainte
   DB : **`P2002` sur `CloudProjectBinding_gcpProjectId_key`**. L'invariant
   est la contrainte UNIQUE, pas la bonne volonté du code appelant.

## Factory E2E — REQUESTED→ACTIVE sur le vrai control plane

`db-rows.jsonl` contient les **11 événements réels** de transition (7 forward
+ teardown + restauration). Google confirme : `CreateProject
projects/ecode-proof-b906ss` **2026-07-17T11:07:17Z** par
`groupequaliwatt@gmail.com` (`audit-logs-folder-scope.json`). Billing
`019D6D-45FBC1-89F220` re-lu `billingEnabled=true`, APIs re-listées ENABLED,
owner du tenant = `roles/viewer` seulement, EDGE_READY enregistré comme fait
auditable (ingress partagé). Transitions illégales refusées (specs).

## P5 — RuntimeIdentity RÉUTILISÉE par les révisions (I-IAM-1)

Deux acquisitions successives (2 « révisions » de
`demo-app × production × app-runtime`) →

- 1ʳᵉ : `created=true` → SA `rt-demo-app-7b60706b99f4@ecode-proof-b906ss.iam.gserviceaccount.com`
- 2ᵉ : **`created=false`** — ligne DB réelle : `revisionsServed=2`
  (`db-rows.jsonl`, table PlatformIamIdentity)
- `iam.serviceAccounts.list` avant/après : **une seule SA `rt-*`**.

Anti-pattern « une identité par révision » non-représentable (UNIQUE
kind×app×env×boundary×project) ; id de SA déterministe (ligne DB perdue ⇒
adoption de la SA existante, testé). Zéro clé persistante : le client GCP n'a
AUCUNE méthode de création de clé ; une clé USER_MANAGED hors bande fait
échouer l'acquisition suivante (`IAM_PERSISTENT_KEY_FORBIDDEN`, testé) et
`auditPersistentKeys` la détecte. Séparation build/promotion (I-IAM-3)
vérifiable depuis la policy live (`verifyIdentitySeparation`, testé).
Impersonations auditées, cap 1 h.

## P3 — Transfert d'owner : révoque PUIS re-accorde, jamais renomme

- Avant : l'ancien owner (SA `proof-owner-old-b906ss@…`, **réellement
  impersonée** via iamcredentials) détient `storage.buckets.list` +
  `resourcemanager.projects.get` (probe `testIamPermissions` LIVE).
- Transfert (`transferTenantOwnership`) : REQUESTED → REVOKING → REVOKED
  (**re-lecture de la policy live** + `revokeVerifiedAt`) → REGRANTING
  (rôles EXPLICITES : `roles/viewer` — pas une copie) → COMPLETED.
- Après : **le probe impersoné ne détient PLUS RIEN** ; plus dans la policy ;
  **latence de révocation mesurée : 215 s** (sous le SLO de 300 s).
- Ligne DB réelle (`db-rows.jsonl`, CloudTenantTransfer `cmroun1t6…`) :
  `state=COMPLETED`, `revokeEvidence=[{removedRoles:[storage.admin,viewer]}]`,
  `regrantEvidence=[{grantedRoles:[viewer]}]`, `revokeVerifiedAt` posé ;
  tenant `ownershipVersion` 1→2.
- Garde : `assertRegrantAllowed` refuse REGRANTING sans révocation vérifiée
  (testé sur chaque état pré-REVOKED).

## P4 — Teardown : inventaire → orphelin détecté → preuve d'effacement

1. Bucket réel `ecode-proof-data-b906ss` créé dans le projet.
2. `requestTeardown` : **inventaire AVANT toute suppression** (bucket + 3 SAs
   + services) — persisté (`db-rows.jsonl`, CloudTeardownRecord).
3. `verifyTeardown` pendant que tout existe → **`ORPHANS_DETECTED`** (bucket
   + SAs survivants nommés) — jamais un COMPLETE silencieux.
4. `executeTeardown` : buckets supprimés puis `projects.delete` → Google :
   **`DeleteProject` 2026-07-17T11:32:05.096Z** (audit log) ; binding
   `RECOVERY_WINDOW` (fin 2026-08-16T11:32:06).
5. `verifyTeardown` final → **`COMPLETE`** avec `erasureProof`
   (projet `DELETE_REQUESTED`) — ligne DB réelle conservée.
6. Ligne `CloudProjectBinding` **conservée après PURGED** : IDs de projet
   jamais réutilisables — la ligne UNIQUE est la réservation de nom.

## GCP-07 — fenêtre de récupération : voir `GCP-07-recovery-window.md`

Mail Google « Permanent Deletion Warning » = confirmation externe du teardown
à la seconde ; fenêtre 30 j confirmée ; ID-reuse en fenêtre → 409 ;
**RESTORING→ACTIVE prouvé live** (UndeleteProject 12:13:17Z dans les logs
Google, restauration ~52 s).

---

## Ce qui N'EST PAS fait (honnêteté du périmètre)

- **Pas câblé dans le pipeline de déploiement produit** : `ensureRuntimeIdentity`
  n'est pas appelé par server-deploy ; le runtime des apps clientes utilise
  l'identité partagée du projet plateforme. Follow-up flag-gated.
- **Provisioning GCP réel en prod** : les preuves du 17/07 ont été exécutées
  en local avec les credentials owner ; l'exécution par l'API en prod (WI,
  rôles org du GSA plateforme) **dépend d'un accès qu'Avi doit autoriser** —
  aucun provisioning nouveau n'est déclenché par cette PR (kill-switch OFF).
- **Contrôles de base non implémentés** : Org Policy baseline, KMS/CMEK,
  Asset Inventory complet, log sinks (⚠️ précondition beta — voir GCP-07),
  billing export, VPC-SC/PSC, Essential Contacts, budgets.
- **Merge/split/suspension tenant** : implémentés + tests unitaires, PAS
  exercés contre GCP live (aucun IAM à bouger). La restauration FACTORY est,
  elle, prouvée live.
- **CapacityPolicy** : champ par binding validé au bind ; enforcement absent.
- **Routes admin non déployées** (pas de merge main) ; testées par injection
  Fastify (503 kill-switch, 403 non-admin, 409 conflit, 201/200 identité).
- **residencyPolicy** : champ porté, non appliqué.

## Reproduire

```bash
# 1. Rate limit folders (≈4 min, crée puis supprime ~23 folders de test)
bash harness/measure-folder-ratelimit.sh

# 2. Preuves P2→P5 (⚠️ crée un VRAI projet GCP — autorisation owner requise)
LIVE_PROOF=1 DATABASE_URL=postgresql://…/cloudtenant_proof \
PROOF_PARENT_FOLDER=folders/780512954993 PROOF_BILLING_ACCOUNT=019D6D-45FBC1-89F220 \
tsx services/api/src/tests/cloud-governance-live-proof.ts

# 3. Restauration (GCP-07)
LIVE_PROOF=1 DATABASE_URL=… PROOF_BINDING_ID=<binding> \
tsx services/api/src/tests/cloud-governance-restore-proof.ts
```
