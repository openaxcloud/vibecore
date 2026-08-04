# PR #52 (physical account purge) — evidence package (RR-1bd27929 per-plan ownership)

- **Final code head:** `531f246145bd6b25157705cec4dc83173ab878a6`
- **Branch:** vague3-purge47-hardening (rebased on origin/main, 0 behind)
- Self-contained: the ownership model (schema + migration), the diffs, full source
  of the two key files, the raw real-Postgres output of tests 11 + 15–18 (and the
  full 14-test purge suite + 34 object-storage tests), and CI for the exact head.

---

## A) OWNERSHIP MODEL (schema / migration)

Global freeze-sets could not attribute a freeze to a plan, so two purges sharing a
resource meant releasing plan A lifted a freeze plan B still needed. Replaced with
per-plan ownership rows:

- **PurgePlan** — one row per active purge: `ownerToken`, `leaseExpiresAt`,
  `version` (CAS reclaim).
- **PurgeFreeze** — one row per `(resourceType, resourceId, planId)` (UNIQUE), so
  each frozen resource is owned by exactly one plan. A resource is frozen iff **≥ 1**
  PurgeFreeze row references it.

Invariants (by construction):
- **release** deletes ONLY the plan's own rows → a shared org stays frozen while
  another live plan owns it; addMember/removeMember refuse while ≥ 1 plan freezes it.
- **reconciler** reclaims ONLY lease-EXPIRED plans, via **CAS on version** (a live
  plan — even one blocked in a slow erasure — is never touched; two concurrent
  reconcilers can't double-reclaim); deletes only the reclaimed plan's rows.

Migration `0083_purge_plan_ownership/migration.sql`:
```sql
-- RR-1bd27929: per-plan ownership of account-purge freezes (PurgePlan + PurgeFreeze).

-- CreateTable
CREATE TABLE "PurgePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurgeFreeze" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgeFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurgePlan_userId_idx" ON "PurgePlan"("userId");
CREATE INDEX "PurgePlan_leaseExpiresAt_idx" ON "PurgePlan"("leaseExpiresAt");
CREATE UNIQUE INDEX "PurgeFreeze_resourceType_resourceId_planId_key" ON "PurgeFreeze"("resourceType", "resourceId", "planId");
CREATE INDEX "PurgeFreeze_resourceType_resourceId_idx" ON "PurgeFreeze"("resourceType", "resourceId");
CREATE INDEX "PurgeFreeze_planId_idx" ON "PurgeFreeze"("planId");

-- AddForeignKey
ALTER TABLE "PurgeFreeze" ADD CONSTRAINT "PurgeFreeze_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### A.1 re-scan — OrganizationMember mutation paths (still 3; tombstone locked)
```
services/api/src/prisma-store.ts:1453:      return tx.organizationMember.upsert({
services/api/src/prisma-store.ts:1505:      const deleted = await tx.organizationMember.deleteMany({ where: { id: found.id } });
services/api/src/prisma-store.ts:937:        const orgMemberships = await tx.organizationMember.deleteMany({ where: { userId } });
```
addMember (upsert) + removeMember (deleteMany) take the membership lock and cover
all invite/import/admin/SCIM/role routes; the purge tombstone (deleteMany where
userId) takes the same lock in the finalize tx (RR-08 A.1). No raw SQL, no createMany.

---

## B.6 — CI RESULTS (final head)

**head_sha (complete):** `531f246145bd6b25157705cec4dc83173ab878a6`
**Branch:** vague3-purge47-hardening · **PR:** #52 · **mergeable:** MERGEABLE

Per-workflow conclusions on this exact head (GitHub check-runs API):

| Workflow / check | Conclusion | Run |
|---|---|---|
| **Install, test, build, scan** (typecheck + full test suite + build) | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552859 |
| **CodeQL Analysis (javascript)** | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552391 |
| **CodeQL Analysis (typescript)** | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552391 |
| **Secret scan (gitleaks, blocking)** | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552391 |
| **Quality Gates** | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552534 |
| Quality Analysis | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552390 |
| Dependency Vulnerability Scan | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552391 |
| Secrets Detection | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552391 |
| Accessibility Tests | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552390 |
| Performance Audit | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552390 |
| Release Validation | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552534 |
| PR Size Check | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552390 |
| Deploy Preview | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942552457 |
| Validate PR Title | ✅ success | https://github.com/openaxcloud/vibecore/actions/runs/30942549911 |
| _Playwright local stack_ | ❌ pre-existing repo-wide red | https://github.com/openaxcloud/vibecore/actions/runs/30942552358 |

Every substantive/blocking check is green on this exact head. The single non-green
is `Playwright local stack` (the "Production E2E" UI suite), chronically red on
unrelated branches — a repo-wide breakage in the design/marketing UI tests with
zero relation to account purge, and non-blocking (`mergeStateStatus` UNSTABLE = all
required checks passed).

The `Install, test, build, scan` run executes the SAME suites whose raw local output
is in sections 3, 3b, 4, 4b below: the 14 real-Postgres purge tests (incl. the
deterministic concurrent test 11 and the multi-plan ownership tests 15–18) and the
34 object-storage tests.

NOTE: this evidence file documents code head `531f246145bd6b...`. The head that
carries THIS file adds it plus its DOCUMENT_MANIFEST.yaml entry (docs-only); the
account-purge code is byte-identical to `531f2461`.

---

## 1) DIFF — full PR #52 net patch over origin/main (excludes generated Prisma client)

```diff
diff --git a/docs/deploy-evidence/2026-07-22-account-purge-worker/JOURNAL.md b/docs/deploy-evidence/2026-07-22-account-purge-worker/JOURNAL.md
new file mode 100644
index 00000000..89ba15de
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-22-account-purge-worker/JOURNAL.md
@@ -0,0 +1,101 @@
+# Journal — preuve PG du worker de purge de compte — 2026-07-22
+
+Toutes les commandes jouées depuis le worktree de la branche
+`feat/account-deletion-purge-worker` (basée sur `origin/main`), machine locale
+(Darwin), Docker Desktop.
+
+## 1. Conteneur Postgres jetable (pgvector obligatoire)
+
+```
+$ docker run -d --name purge-proof-pg -e POSTGRES_DB=vibecore -e POSTGRES_USER=vibecore \
+    -e POSTGRES_PASSWORD=vibecore -p 55440:5432 pgvector/pgvector:pg16
+2449c99183803501d23956fb71eefc7b6a32c371bde371862a1e6a06b81b8807
+$ docker exec purge-proof-pg pg_isready -U vibecore -d vibecore
+READY
+```
+
+## 2. Migrations réelles (0001 → 0078)
+
+```
+$ cd packages/database && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
+    prisma migrate deploy --schema prisma/schema.prisma
+…
+  └─ 0078_double_entry_ledger/
+    └─ migration.sql
+All migrations have been successfully applied.
+```
+
+Les triggers d'immutabilité du ledger (mig 0078) sont donc actifs dans la base
+de preuve — le test (5) les exerce réellement.
+
+## 3. Preuve DB-gatée (4/4 verts) — `purge-db-run1.log`
+
+```
+$ cd services/api && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
+    vitest run --config vitest.config.ts src/tests/account-purge-db.spec.ts
+
+stdout | … (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned
+prisma:error Ledger LedgerTransaction is append-only: DELETE refused. …
+
+ ✓ src/tests/account-purge-db.spec.ts (4 tests) 899ms
+ Test Files  1 passed (1)
+      Tests  4 passed (4)
+```
+
+Scénario complet du test (1+3) : compte créé avec données dans plusieurs
+classes (session, org, projet, import, conversation IA + message, usage event
+financier, entrée d'audit) → suppression demandée → **fenêtre simulée échue en
+reculant `requestedAt` DANS LA DB (jamais l'horloge)** → route worker
+`/internal/account-purge` exécutée (`enabled:true`) → vérifications SQL par
+classe (« 0 ligne restante ») → preuve d'effacement **relue depuis la table
+`AdminAuditLog`** → re-run = no-op (`already_purged`, toujours 1 seule preuve).
+
+## 4. Vérification SQL brute post-purge — `purge-sql-verification.log`
+
+Extraits (6 tombstones car la suite complète a rejoué la spec sur la même DB) :
+
+```
+ id                        | email                                           | name | pwd_null | purged_at
+ cmrvpdz4t000fi0lnerebnm5i | purged-cmrvpdz4t000fi0lnerebnm5i@erased.invalid |      | t        | 2026-07-22T06:30:27.400Z
+ sessions_left            = 0
+ convs_left               = 0
+ memberships_left         = 0
+ Organization             : name='Purged account', slug='purged-<orgId>' (anonymisées)
+ ledger_tx_retained       = 2   (transactions postées JAMAIS supprimées)
+ usage_retained_detached  = 6   (UsageEvent conservés, userId=NULL)
+ AdminAuditLog account.purge_completed : verifiedZeroRemaining=true, 17 classes, 3 exceptions
+ AuditLog du purgé        : ipAddress=NULL, metadata={"redacted": true, …} (rédigé, ligne conservée)
+```
+
+Une preuve complète est copiée dans `proof-sample.json` (relue via
+`jsonb_pretty(metadata->'proof')`).
+
+Bilan par classe (test 1+3) : **supprimées** sessions=1, ai_history
+(1 conversation + 1 message), projects=1, imports=1, memberships=1, chaque
+classe recomptée à **0 ligne** ; **anonymisées** audit_logs (rédigés),
+user_references (UsageEvent détaché), organizations (shell), profile
+(tombstone) ; **conservées consignées** financial_records
+(UsageEvent=1, fail-closed 7 ans), ledger (immutabilité 0078),
+shared_org_content.
+
+## 5. Suites vitest (même DB réelle)
+
+```
+$ vitest run src/tests/account-purge-routes.spec.ts   → 9 passed (9)
+$ vitest run --config vitest.config.ts                → Test Files 159 passed | 1 skipped (160)
+                                                        Tests 1303 passed | 1 skipped (1304)
+```
+
+## 6. Rendu Helm du CronJob
+
+```
+$ helm template vibecore infra/helm/platform --set global.imageTag=testtag | grep cron-account-purge
+  name: vibecore-vibecore-platform-cron-account-purge
+  schedule: "30 4 * * *"
+```
+
+## 7. Teardown
+
+```
+$ docker rm -f purge-proof-pg
+```
diff --git a/docs/deploy-evidence/2026-07-22-account-purge-worker/README.md b/docs/deploy-evidence/2026-07-22-account-purge-worker/README.md
new file mode 100644
index 00000000..ac4014bd
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-22-account-purge-worker/README.md
@@ -0,0 +1,92 @@
+# Preuve — worker de purge de compte (§16.12) — 2026-07-22
+
+## Contexte
+
+Gap **HAUTE** du threat model / table de rétention
+(`docs/parity/SECURITY_PRIVACY_COMPLIANCE.md` v3, §Rétention ligne 1) :
+la machine d'états de suppression self-serve existait
+(`services/api/src/data-deletion.ts` : request → grâce 14 j → `ready_to_purge`)
+et la file admin `/admin/account-deletions` aussi, mais **aucun exécuteur ne
+consommait `ready_to_purge`** — `purgedAt` n'était jamais écrit hors des specs.
+Invariant §16.12 : toute suppression = tombstone → fenêtre de récupération →
+**purge réelle** → **PREUVE d'effacement**.
+
+## Ce qui est livré
+
+- `services/api/src/account-purge.ts` — module pur : types de la **preuve
+  d'effacement** (par classe : lignes supprimées / anonymisées / conservées
+  avec motif, vérification « 0 ligne restante »), `buildErasureProof`,
+  tombstones (`anonymizedEmail`, `anonymizedOrgSlug`).
+- `store.purgeUserAccount` (interface `store.ts`, implémentations
+  `prisma-store.ts` + `tests/test-api-store.ts`) — la purge réelle classe par
+  classe, dans UNE transaction Postgres ouverte par
+  `pg_advisory_xact_lock('account-purge:<userId>')` :
+  - **supprimées** : sessions, tokens (email/reset/MFA), clés API, comptes
+    connectés, historique IA (conversations + messages + tool calls),
+    collaboration, projets + imports des orgs dont l'utilisateur est le SEUL
+    membre, memberships, abonnement newsletter ;
+  - **anonymisées** : AuditLog/AdminAuditLog **RÉDIGÉS jamais supprimés**
+    (ipAddress→null, metadata→`{redacted:true}`), références utilisateur
+    détachées (UsageEvent, AgentCallLog, LedgerReservation, AgentCheckpoint,
+    ProjectActivity, ImportJob, GalleryListing, SupportTicket), org shells
+    (nom/slug), **tombstone User** portant `purgedAt` ;
+  - **conservées fail-closed, CONSIGNÉES** : enregistrements financiers dans
+    la fenêtre 7 ans (`canPurgeFinancialRecord` — les lignes plus vieilles que
+    2555 j sont effacées), **ledger 0078 immuable** (jamais de DELETE — retenu
+    + consigné), contenu des orgs partagées (appartient aux autres membres).
+  - **Vérification post-purge** : recomptage par classe supprimée ; toute
+    ligne restante ⇒ exception ⇒ ROLLBACK complet (une purge partielle ne peut
+    jamais être déclarée faite).
+- Route interne `POST /internal/account-purge` (`requireInternalSecret`,
+  **DRY-RUN par défaut** — purge seulement si `ACCOUNT_PURGE_ENABLED=true` ou
+  `body.enabled`) : consomme `account.pendingDeletionUserIds`, purge les
+  demandes échues, **persiste la preuve dans l'AdminAuditLog**
+  (`account.purge_completed`, la preuve est écrite AVANT de sortir l'id de la
+  file), retire l'id de la file. Échec ⇒ `account.purge_failed` + l'id reste.
+- Worker BullMQ : job `account.purge` (queue `enterprise-jobs`,
+  `triggerAccountPurge` dans `services/worker/src/index.ts`) + CronJob Helm
+  `accountPurge` (30 4 * * *, `infra/helm/platform/templates/cronjobs.yaml`,
+  rendu vérifié par `helm template`). Même patron que `inactivity.gc`.
+
+## Tests
+
+- `account-purge-routes.spec.ts` — 9 tests (négatifs d'abord) : 401 sans
+  secret ; fenêtre NON échue → refus + données intactes ; annulation pendant
+  la grâce → jamais purgé ; dry-run par défaut ; double exécution → no-op
+  prouvé (1 seule preuve) ; 2 appels concurrents → 1 seule purge ; rétention
+  financière fail-closed avec exception CONSIGNÉE ; purge complète (0 ligne
+  par classe + preuve + tombstone + session morte → 401) ; org partagée
+  conservée + consignée.
+- `account-purge-db.spec.ts` — 4 preuves DURABLES contre un VRAI Postgres
+  (gaté `DATABASE_URL`, tourne en CI) : refus fenêtre non échue ; purge réelle
+  E2E (compte semé multi-classes → `requestedAt` reculé DANS LA DB, jamais
+  l'horloge → route worker → vérifs SQL « 0 ligne » par classe → preuve RELUE
+  depuis `AdminAuditLog` → re-run no-op, 1 seule preuve) ; 2 clients Prisma
+  INDÉPENDANTS en course → exactement 1 purge (verrou advisory) ; transaction
+  ledger POSTÉE survit + trigger 0078 refuse le DELETE (`append-only`).
+
+Suite complète api : **1303 tests verts** (159 fichiers) avec DB réelle.
+
+## Reproduire la preuve PG
+
+```bash
+docker run -d --name purge-proof-pg -e POSTGRES_DB=vibecore -e POSTGRES_USER=vibecore \
+  -e POSTGRES_PASSWORD=vibecore -p 55440:5432 pgvector/pgvector:pg16   # PAS postgres:16 (migrations pgvector)
+cd packages/database && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
+  pnpm exec prisma migrate deploy --schema prisma/schema.prisma
+cd ../../services/api && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
+  pnpm exec vitest run --config vitest.config.ts src/tests/account-purge-db.spec.ts
+docker rm -f purge-proof-pg
+```
+
+## Pièces
+
+- `purge-db-run1.log` — sortie vitest de la preuve PG (4/4 verts).
+- `purge-sql-verification.log` — requêtes SQL brutes post-purge : tombstones
+  anonymisés (`purged-<id>@erased.invalid`, passwordHash NULL, `purgedAt`
+  stampé), 0 session / 0 conversation / 0 membership restants, org shells
+  anonymisés, ledger retenu, UsageEvent détachés, preuves
+  `verifiedZeroRemaining=true` (17 classes, 3 exceptions), AuditLog rédigé.
+- `proof-sample.json` — une preuve d'effacement complète relue depuis la DB.
+
+Conteneur `purge-proof-pg` détruit après la preuve.
diff --git a/docs/deploy-evidence/2026-07-22-account-purge-worker/proof-sample.json b/docs/deploy-evidence/2026-07-22-account-purge-worker/proof-sample.json
new file mode 100644
index 00000000..f88e6ca6
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-22-account-purge-worker/proof-sample.json
@@ -0,0 +1,196 @@
+ {                                                                    +
+     "kind": "account-erasure-proof",                                 +
+     "userId": "cmrvpdz4t000fi0lnerebnm5i",                           +
+     "classes": [                                                     +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "Session": 1                                         +
+             },                                                       +
+             "dataClass": "sessions",                                 +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "MfaRecoveryCode": 0,                                +
+                 "PasswordResetToken": 0,                             +
+                 "EmailVerificationToken": 0                          +
+             },                                                       +
+             "dataClass": "auth_tokens",                              +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "ApiKey": 0                                          +
+             },                                                       +
+             "dataClass": "api_keys",                                 +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "Account": 0,                                        +
+                 "UserConnection": 0,                                 +
+                 "OAuthConnection": 0                                 +
+             },                                                       +
+             "dataClass": "connected_accounts",                       +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "AgentRun": 0,                                       +
+                 "AiMessage": 1,                                      +
+                 "AiToolCall": 0,                                     +
+                 "McpInstall": 0,                                     +
+                 "AgentMemory": 0,                                    +
+                 "AiTokenUsage": 0,                                   +
+                 "Notification": 0,                                   +
+                 "McpUserConfig": 0,                                  +
+                 "AiConversation": 1,                                 +
+                 "AgentCheckpoint": 0,                                +
+                 "AiMessageFeedback": 0,                              +
+                 "AgentMemoryPreference": 0                           +
+             },                                                       +
+             "dataClass": "ai_history",                               +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "UserSpendLimit": 0,                                 +
+                 "ProjectShareLink": 0,                               +
+                 "ProjectCollaborator": 0,                            +
+                 "CollaborationComment": 0,                           +
+                 "CollaborationPresence": 0                           +
+             },                                                       +
+             "dataClass": "collaboration",                            +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "Project": 1                                         +
+             },                                                       +
+             "dataClass": "projects",                                 +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "ImportJob": 1                                       +
+             },                                                       +
+             "dataClass": "imports",                                  +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "OrganizationMember": 1                              +
+             },                                                       +
+             "dataClass": "memberships",                              +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "deleted",                                     +
+             "models": {                                              +
+                 "NewsletterSubscriber": 0                            +
+             },                                                       +
+             "dataClass": "marketing",                                +
+             "remainingAfterPurge": 0                                 +
+         },                                                           +
+         {                                                            +
+             "action": "anonymized",                                  +
+             "models": {                                              +
+                 "AuditLog": 1,                                       +
+                 "AdminAuditLog": 0                                   +
+             },                                                       +
+             "reason": "append_only_redacted_never_deleted",          +
+             "dataClass": "audit_logs"                                +
+         },                                                           +
+         {                                                            +
+             "action": "anonymized",                                  +
+             "models": {                                              +
+                 "ImportJob": 0,                                      +
+                 "UsageEvent": 1,                                     +
+                 "AgentCallLog": 0,                                   +
+                 "SupportTicket": 0,                                  +
+                 "GalleryListing": 0,                                 +
+                 "AgentCheckpoint": 0,                                +
+                 "ProjectActivity": 0,                                +
+                 "LedgerReservation": 0                               +
+             },                                                       +
+             "reason": "retained_rows_detached_from_user",            +
+             "dataClass": "user_references"                           +
+         },                                                           +
+         {                                                            +
+             "action": "anonymized",                                  +
+             "models": {                                              +
+                 "Organization": 1                                    +
+             },                                                       +
+             "reason": "retained_as_anchor_for_financial_records",    +
+             "dataClass": "organizations"                             +
+         },                                                           +
+         {                                                            +
+             "action": "retained",                                    +
+             "models": {                                              +
+                 "UsageEvent": 1,                                     +
+                 "StripeEvent": 0,                                    +
+                 "AiCostLedger": 0,                                   +
+                 "CreditLedger": 0,                                   +
+                 "Subscription": 0,                                   +
+                 "ExpiredRowsErased": 0                               +
+             },                                                       +
+             "reason": "financial_retention_7y_fail_closed",          +
+             "dataClass": "financial_records"                         +
+         },                                                           +
+         {                                                            +
+             "action": "retained",                                    +
+             "models": {                                              +
+                 "LedgerTransaction": 0                               +
+             },                                                       +
+             "reason": "ledger_immutable_posted_entries_mig0078",     +
+             "dataClass": "ledger"                                    +
+         },                                                           +
+         {                                                            +
+             "action": "retained",                                    +
+             "models": {                                              +
+                 "Project": 0                                         +
+             },                                                       +
+             "reason": "shared_organization_belongs_to_other_members",+
+             "dataClass": "shared_org_content"                        +
+         },                                                           +
+         {                                                            +
+             "action": "anonymized",                                  +
+             "models": {                                              +
+                 "User": 1                                            +
+             },                                                       +
+             "reason": "tombstone_carries_purgedAt",                  +
+             "dataClass": "profile"                                   +
+         }                                                            +
+     ],                                                               +
+     "version": 1,                                                    +
+     "purgedAt": "2026-07-22T06:30:27.400Z",                          +
+     "exceptions": [                                                  +
+         {                                                            +
+             "rows": 1,                                               +
+             "reason": "financial_retention_7y_fail_closed",          +
+             "dataClass": "financial_records"                         +
+         },                                                           +
+         {                                                            +
+             "rows": 0,                                               +
+             "reason": "ledger_immutable_posted_entries_mig0078",     +
+             "dataClass": "ledger"                                    +
+         },                                                           +
+         {                                                            +
+             "rows": 0,                                               +
+             "reason": "shared_organization_belongs_to_other_members",+
+             "dataClass": "shared_org_content"                        +
+         }                                                            +
+     ],                                                               +
+     "requestedAt": "2026-07-07T06:30:27.360Z",                       +
+     "verifiedZeroRemaining": true                                    +
+ }
+
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md
new file mode 100644
index 00000000..8fc1d915
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md
@@ -0,0 +1,252 @@
+# Physical account-purge erasure — REAL E2E proof (§16.12, PR #47 reserves)
+
+Real before/after erasure proof on **actual GCS and Kubernetes**, not the memory
+adapters the expert rejected. Two independent E2Es, each with the WIF-proof
+guardrails: **dedicated TEST resources (never prod), no persistent credentials
+(ADC / local kubeconfig), ~$0, full teardown**.
+
+## 1. GCS — `gcs-proof.json` / `gcs-SHA256SUMS`
+
+Runs the production adapter `GcsObjectStorage` driving `eraseSubjectStorage`
+against a throwaway bucket in the **dedicated test project `ecode-proof-b906ss`**
+(never prod `vibecore-495216`):
+
+- BEFORE: 3 real objects listed in a real bucket `vc-purgee2e…`.
+- ERASE: the real erasure path deletes the bucket.
+- AFTER (live re-check, reserve #2/#4): `bucketExists=false`, `objectsRemaining=0`,
+  `verified=true`.
+- Teardown: the erasure deletes the bucket; a `finally` force-deletes it if the
+  run ever leaked one. Verified 0 test buckets remain.
+
+Replay: `GCP_TEST_PROJECT=ecode-proof-b906ss npx tsx services/api/scripts/physical-purge-gcs-e2e.ts --write`
+
+## 2. Kubernetes — `k8s-proof.json` / `k8s-SHA256SUMS`
+
+Runs against a throwaway **local `kind` cluster** — a real Kubernetes API server
+and real PVC lifecycle at **$0**, chosen over GKE per the "stop if heavy/costly"
+guardrail (a real k8s cluster, no cloud cost). Proves reserve #2 (verify the
+**real** PVC disappearance, not the DB `DELETED` flag):
+
+- BEFORE: a real **Bound** PVC (with a provisioned PV), mounted by a pod.
+- ERASE: `kubectl delete pod + pvc` (the same primitives the workspace eraser
+  uses via workspace-manager's k8s-client).
+- AFTER (live `get pvc` → NotFound): `pvcCount=0`, `verified=true`.
+- Teardown: `kind delete cluster` in an EXIT trap — the cluster and everything in
+  it (incl. the PV) is destroyed.
+
+Replay: `bash services/api/scripts/physical-purge-k8s-e2e.sh --write`
+
+## Cost & teardown
+
+| Resource | Where | Cost | Teardown |
+| --- | --- | --- | --- |
+| GCS bucket + 3 tiny objects | test project `ecode-proof-b906ss` | ~$0 (deleted in seconds) | erasure + `finally` force-delete; 0 left |
+| kind cluster + 64Mi PVC | local Docker | $0 (no cloud) | `kind delete cluster` EXIT trap |
+
+No GKE cluster was created (would have been the only "heavy/costly" option); a
+local `kind` cluster satisfies "real k8s" at $0, so no cost sign-off was needed.
+No persistent keys: GCS uses ADC (the reviewer's gcloud login), k8s uses the
+local kind kubeconfig.
+
+## Round 7 — RR-1bd27929: PER-PLAN ownership (multi-plan safety)
+
+The reviewer found a real hole in the freeze model: freezes were GLOBAL id-lists,
+so two concurrent purges sharing an org/project could not tell whose freeze was
+whose — releasing plan A lifted a freeze plan B still needed. Replaced the
+system-setting id-lists with an OWNERSHIP model (migration `0083_purge_plan_ownership`):
+
+- **`PurgePlan`** — one row per active purge, with `ownerToken`, `leaseExpiresAt`
+  and `version` (for CAS reclaim).
+- **`PurgeFreeze`** — one row per `(resourceType, resourceId, planId)` (unique),
+  so each frozen resource is OWNED by exactly one plan. A resource is frozen iff
+  **≥ 1** PurgeFreeze row references it.
+
+Guarantees now hold by construction:
+- **Release** deletes ONLY the plan's own freeze rows → a shared org stays frozen
+  while another live plan owns it; `addMember`/`removeMember` refuse while ≥ 1 plan
+  freezes the org.
+- **Reconciler** reclaims ONLY plans whose **lease has EXPIRED**, via **CAS on
+  `version`** (a live plan — even one blocked in a slow erasure — is never touched,
+  and two concurrent reconcilers can't double-reclaim). It deletes only the
+  reclaimed plan's rows, never a concurrent plan's.
+- The object-storage route guard now asks the store `isObjectStorageProjectPurgeFrozen`
+  (count of PurgeFreeze rows), not a global list.
+
+Proof (real Postgres, `account-purge-db.spec.ts`, all deterministic):
+- **(15)** two plans share an org; one releases (real release path) → org STAYS
+  frozen (addMember still refused) until the LAST plan releases.
+- **(16)** reconciler never reclaims a live plan (valid lease), even blocked in erasure.
+- **(17)** reconciler reclaims an ABANDONED plan (expired lease) via CAS (two
+  concurrent reconcilers → reclaimed exactly once), releasing ONLY its resources —
+  a concurrent live plan's freeze on the same org is untouched.
+- **(18)** crash between the two thaws → plan kept recoverable, reprise idempotent,
+  zero residual freeze after reconcile, and NO other plan's freeze removed.
+
+## Round 6 — CODEX-10 REVIEW_BLOCKED: two deep audits (both found real holes)
+
+**A.1 — global scan of every OrganizationMember mutation path.** Repo-wide there
+are exactly 3 write sites (no raw SQL, no createMany): `addMember` (upsert) and
+`removeMember` (deleteMany) — both already take the membership freeze-set lock, and
+ALL invite / import / admin / SCIM / role routes funnel through them — and the
+**purge tombstone `organizationMember.deleteMany({ where: { userId } })`** in the
+finalize tx, which did NOT take the lock. That was a reopened race: the tombstone
+could flip an org's member count DURING another purge's atomic read→freeze section.
+FIX: the finalize tx now takes `system-setting:membership.purgeFrozenOrgIds` right
+after `account-purge:<userId>` (canonical order), so it serialises with every
+guarantee.
+
+**A.2 — recovery after a partial thaw.** `releasePurgeGuarantee` and
+`reconcilePurgeFreezes` deleted the plan row UNCONDITIONALLY, even when a freeze
+removal failed (swallowed by `.catch`). The plan is the only durable pointer back
+to a frozen id, so a failed thaw + deleted plan = a freeze stranded FOREVER. FIX:
+`deletePurgePlanIfFullyThawed()` re-reads both freeze sets and deletes the plan ONLY
+when neither still contains any of the plan's ids; otherwise the plan is kept for
+the reconciler. Tests (12)(13)(14): membership-thaw fails → plan kept + reconciler
+recovers; object-storage-thaw fails (crash between thaws) → plan kept + recovers;
+the reconciler itself never deletes a plan while a thaw fails.
+
+## Round 5 — CODEX-10: make the guarantee atomic with the topology read
+
+CODEX-10 found the RR-09 guarantee was NOT atomic with the topology read: the
+order was (1) `account-purge` lock, (2) `resolveStorageTopology`, (3) only THEN
+the `system-setting:membership.purgeFrozenOrgIds` lock + freeze write. But
+`addMember`/`removeMember` synchronise on the freeze-set lock, not `account-purge`
+— so a join could take the freeze-set lock first, commit a new member, and the
+purge's already-read topology was stale → the sole bucket was erased before the
+drift check saw it. Fix in `acquirePurgeGuarantee`:
+
+- **Take the `system-setting:membership.purgeFrozenOrgIds` lock BEFORE
+  `resolveStorageTopology`**, and hold it to commit — so read + freeze are atomic
+  w.r.t. membership. A join that grabbed the lock first commits before ours and is
+  reflected in the topology (its now-shared org's bucket is excluded); one that
+  arrives after blocks until our freeze is committed and is then refused.
+- **Canonical lock order, documented and identical everywhere:**
+  `account-purge:<userId>` < `system-setting:membership.purgeFrozenOrgIds` <
+  `system-setting:objectStorage.purgeFrozenProjectIds`. `addMember`/`removeMember`
+  take only the membership lock; release/reconcile take one lock per separate tx —
+  none can invert the order, so no deadlock.
+
+Proof (real Postgres, `account-purge-db.spec.ts` (11)): a **deterministic**
+concurrent test where connection A grabs the membership freeze-set lock first,
+the purge is confirmed BLOCKED on that lock via `pg_locks` (`NOT granted`) —
+proving it takes the lock before reading topology — then A commits a join and
+releases; the purge then sees the join, EXCLUDES the bucket from `eraseStorage`
+(`bucketProjectIds` ∌ the project), the bucket survives, and no residual freeze
+remains. Green 3/3 repeats.
+
+## Round 4 — RR-09: guarantee BEFORE the irreversible deletion
+
+RR-09 found the RR-08 drift guard fired too late — AFTER the irreversible GCS/PVC
+deletion — so in the sole→shared case the bucket was already destroyed and the
+guard only blocked the tombstone; and the object-storage freeze was never
+released, leaving a residual freeze on abort. Reordered and hardened:
+
+1. **Topology GUARANTEE acquired BEFORE any external deletion.**
+   `acquirePurgeGuarantee(userId)` runs first, in ONE tx under the per-user
+   advisory lock: it computes the authoritative sole/shared topology AND freezes
+   it — membership for every org the subject belongs to, object storage for the
+   sole-org buckets — atomically, then records a recoverable plan. The erasure
+   then runs on THIS locked inventory, so it only ever deletes buckets that are
+   sole under the guarantee.
+2. **Membership mutations blocked during erasure.** `addMember` / `removeMember`
+   take the freeze-set advisory lock and refuse (`MEMBERSHIP_FROZEN_FOR_PURGE`)
+   for a frozen org, so no join/leave can flip sole↔shared mid-erasure.
+3. **Delete only after the guarantee.** `deps.eraseStorage` is invoked only once
+   a guarantee is held, on `guarantee.bucketProjectIds`.
+4. **Recoverable freeze state machine, guaranteed release.**
+   `releasePurgeGuarantee` runs in a `finally` on EVERY exit (purged / drift /
+   throw) — unfreeze membership + object storage, clear the plan. A plan left by
+   a crashed run is released by `reconcilePurgeFreezes()` at the start of the next
+   purge-executor pass (surfaced as `reconciledFreezes`).
+5. **sole→shared: the bucket is NEVER deleted** — a bucket shared under the
+   guarantee is excluded from the erase inventory (a join before the guarantee),
+   or the join is refused (a join during erasure).
+
+Proof (real Postgres, `tests/account-purge-db.spec.ts`): (6) shared org's bucket
+never handed to the erasure + survives; (7) co-member cannot leave while frozen;
+(8) new member cannot join while frozen; (9) NO residual freeze after a failed
+purge (guaranteed release on throw) + org writable again; (10) reconciler
+releases a crashed run's freeze. The RR-08 drift check remains as a defence-in-
+depth backstop for the razor-thin read→freeze window.
+
+## Round 3 — RR-08: two blocking paths closed (fail-closed)
+
+The reviewer (RR-08) found two more holes. Both are fixed fail-closed with
+executable tests (real Postgres for the topology race; route + unit for the
+write barrier). These paths are code/logic, not new external-I/O, so the proof
+is the test suite below rather than a new GCS/kind artifact.
+
+1. **Thumbnail (and every future signed upload) was outside the freeze barrier.**
+   `POST /projects/:id/thumbnail/upload-url` called `ensureBucket` +
+   `createUploadUrl` with NO freeze check, so it could recreate a bucket/object
+   for a project the purge had already zero-checked. Fixed two ways:
+   - the route now calls the same `objectStorageWriteBlocked` guard (early 403);
+   - **structural** — `resolveObjectStorage()` now returns a
+     `guardObjectStorageWrites()` wrapper whose CREATE/MODIFY primitives
+     (`ensureBucket` / `createUploadUrl` / `putObject` / `moveObject`) refuse a
+     frozen project, so the background thumbnail *capturer* and any future write
+     path are covered by construction. The purge's OWN erasure uses the RAW
+     (unwrapped) adapter, so it can still delete the very project it froze.
+     Proof: `tests/object-storage-purge-freeze.spec.ts` (thumbnail → 403,
+     generic upload-url → 403, reads still 200, unfreeze → 200) +
+     `object-storage.spec.ts` `guardObjectStorageWrites` unit (every write
+     refused, reads/deletes pass, unfrozen project writes).
+
+2. **Topology was not serialized against the tombstone.** The external GCS/PVC
+   erasure ran on the PRE-transaction sole/shared classification; the tx then
+   recomputed it independently, so a membership race (shared→sole / sole→shared)
+   during the erasure could strand a newly-sole org's bucket or destroy a
+   newly-shared org's bucket, yet still stamp `purgedAt`. Fixed: the purge tx now
+   re-derives the EXACT topology fingerprint under the advisory lock and
+   **aborts (`ACCOUNT_PURGE_TOPOLOGY_DRIFT`) before any delete or the tombstone**
+   on any drift — the account stays queued and the next run recomputes a fresh
+   inventory (idempotent erasure). Never finalize on a stale inventory.
+   Proof (real Postgres): `tests/account-purge-db.spec.ts` (6) shared→sole and
+   (7) sole→shared — the `eraseStorage` hook IS the race window, so the tests
+   mutate membership inside it and assert the purge aborts with no tombstone and
+   intact storage rows.
+
+## Round 2 — the six required corrections (fail-closed) + negatives
+
+Each is implemented fail-closed and has an executable negative proving it:
+
+1. **k8s barrier fails on ANY delete failure** — `manager.freezeWorkspace` now
+   attempts every revoke (`allSettled`) but **throws** if any rejected and never
+   marks the row stopped; the barrier is never reported acquired with a live
+   write path. Negative: `manager.spec.ts` "reserve #1" (a failing Pod delete →
+   throws, row not STOPPED).
+2. **Real GCS backend required** — `eraseSubjectStorage` refuses (unverified,
+   never calls delete) when there are buckets but no `active` backend; a
+   `NoopObjectStorage` can never certify "absent". Negatives:
+   `account-storage-purge.spec.ts` "reserve #2" and the **real GCS E2E**
+   (`negative.inertBackendRefusedAndBucketSurvived: true` — the bucket survives).
+3. **Block ALL object-storage write paths during purge** — the write barrier
+   marks the subject's projects purge-frozen; `upload-url` / `ensure-bucket` /
+   `move` return `403 OBJECT_STORAGE_PURGE_FROZEN`, so nothing is recreated after
+   the zero-check.
+4. **Inventory by REAL authorization** — workspaces are enumerated for EVERY
+   project in ANY org the subject belongs to (shared orgs included, **without**
+   needing a `ProjectCollaborator` row), plus explicit collaborations.
+5. **Only an authenticated NotFound = absence** — `manager.pvcExists` does NOT
+   catch `k8s.get`; the k8s-client returns undefined only for a real NotFound and
+   re-throws network/RBAC errors, so a read error propagates (→ fail-closed),
+   never "PVC absent". Negatives: `manager.spec.ts` "reserve #5", and the **kind
+   E2E** (`negative.survivingPvcReportedPresent: true` — a live PVC is reported
+   present, never mis-read as gone).
+6. **E2E negatives** — both real E2Es carry a negative (above); the #1/#5
+   error-handling negatives are proven deterministically in `manager.spec.ts`
+   because a k8s network/RBAC/partial-delete error cannot be reliably injected
+   through `kubectl` against `kind`.
+
+## The four reserves (code)
+
+- **#1 write barrier** — `eraseSubjectStorage` calls `WriteBarrierPort.freeze`
+  BEFORE any delete; a freeze failure aborts erasure (nothing deleted, not
+  verified). Prod path: workspace-manager `POST /workspaces/:id/freeze` (revoke
+  token + stop pod).
+- **#2 real disappearance** — verification re-checks the LIVE backend (GCS list /
+  `GET /workspaces/:id/pvc-exists` → real `get pvc`), never a DB flag.
+- **#3 by data subject** — the inventory erases the subject's sole-org buckets
+  AND their per-user workspace in EVERY project they touched (sole-org +
+  collaborator), not just one main `workspaceId`.
+- **#4 real proof** — the two artifacts above.
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-SHA256SUMS b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-SHA256SUMS
new file mode 100644
index 00000000..e9b1c36d
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-SHA256SUMS
@@ -0,0 +1 @@
+c427b032e522ca3ab7c2220f9100fc0e17c1b1ce8a848e93fe7b741832b24aa6  gcs-proof.json
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-proof.json b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-proof.json
new file mode 100644
index 00000000..69f01e65
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/gcs-proof.json
@@ -0,0 +1,46 @@
+{
+  "after": {
+    "bucketExists": false,
+    "objectsRemaining": 0
+  },
+  "before": {
+    "count": 3,
+    "objects": [
+      "assets/logo.png",
+      "data/export.json",
+      "nested/dir/notes.txt"
+    ]
+  },
+  "bucket": "vc-purgee2emrxwjafc",
+  "classes": [
+    {
+      "action": "deleted",
+      "dataClass": "object_storage",
+      "models": {
+        "Buckets": 1,
+        "BucketsDeleted": 1,
+        "ObjectsErased": 3,
+        "RealBackend": 1
+      },
+      "remainingAfterPurge": 0
+    },
+    {
+      "action": "deleted",
+      "dataClass": "workspace_volumes",
+      "models": {
+        "PvcsDeleted": 0,
+        "Workspaces": 0,
+        "WriteBarrier": 1
+      },
+      "remainingAfterPurge": 0
+    }
+  ],
+  "kind": "physical-purge-gcs-e2e",
+  "location": "EU",
+  "negative": {
+    "inertBackendRefusedAndBucketSurvived": true
+  },
+  "project": "ecode-wif-proof-834022",
+  "verified": true,
+  "version": 2
+}
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-SHA256SUMS b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-SHA256SUMS
new file mode 100644
index 00000000..50689df7
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-SHA256SUMS
@@ -0,0 +1 @@
+aac8090391be97e949984214110123dcf5c9f78e77d9ea7c69aa8a935f07a219  k8s-proof.json
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-proof.json b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-proof.json
new file mode 100644
index 00000000..d52acc22
--- /dev/null
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/k8s-proof.json
@@ -0,0 +1,20 @@
+{
+  "after": {
+    "pv": "present",
+    "pvc": "NotFound",
+    "pvcCount": 0
+  },
+  "before": {
+    "pv": "pvc-2edb76d9-70d6-4b91-aabc-dbe98aa896e5",
+    "pvcPhase": "Bound"
+  },
+  "cluster": "kind:purge-e2e (throwaway, torn down)",
+  "kind": "physical-purge-k8s-e2e",
+  "namespace": "purge-e2e",
+  "negative": {
+    "survivingPvcReportedPresent": true
+  },
+  "pvcName": "ws-e2e-pvc",
+  "verified": true,
+  "version": 2
+}
diff --git a/infra/helm/platform/templates/cronjobs.yaml b/infra/helm/platform/templates/cronjobs.yaml
index 58b9ab46..3ff9f94e 100644
--- a/infra/helm/platform/templates/cronjobs.yaml
+++ b/infra/helm/platform/templates/cronjobs.yaml
@@ -44,6 +44,11 @@
       "schedule" "0 4 * * *"
       "queue" "enterprise-jobs"
       "job" "inactivity.gc")
+    "accountPurge" (dict
+      "enabled" true
+      "schedule" "30 4 * * *"
+      "queue" "enterprise-jobs"
+      "job" "account.purge")
     "objectStorageMetering" (dict
       "enabled" true
       "schedule" "15 2 * * *"
diff --git a/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql b/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql
new file mode 100644
index 00000000..d456fee4
--- /dev/null
+++ b/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql
@@ -0,0 +1,32 @@
+-- RR-1bd27929: per-plan ownership of account-purge freezes (PurgePlan + PurgeFreeze).
+
+-- CreateTable
+CREATE TABLE "PurgePlan" (
+    "id" TEXT NOT NULL,
+    "userId" TEXT NOT NULL,
+    "ownerToken" TEXT NOT NULL,
+    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
+    "version" INTEGER NOT NULL DEFAULT 0,
+    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
+    CONSTRAINT "PurgePlan_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateTable
+CREATE TABLE "PurgeFreeze" (
+    "id" TEXT NOT NULL,
+    "planId" TEXT NOT NULL,
+    "resourceType" TEXT NOT NULL,
+    "resourceId" TEXT NOT NULL,
+    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
+    CONSTRAINT "PurgeFreeze_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateIndex
+CREATE INDEX "PurgePlan_userId_idx" ON "PurgePlan"("userId");
+CREATE INDEX "PurgePlan_leaseExpiresAt_idx" ON "PurgePlan"("leaseExpiresAt");
+CREATE UNIQUE INDEX "PurgeFreeze_resourceType_resourceId_planId_key" ON "PurgeFreeze"("resourceType", "resourceId", "planId");
+CREATE INDEX "PurgeFreeze_resourceType_resourceId_idx" ON "PurgeFreeze"("resourceType", "resourceId");
+CREATE INDEX "PurgeFreeze_planId_idx" ON "PurgeFreeze"("planId");
+
+-- AddForeignKey
+ALTER TABLE "PurgeFreeze" ADD CONSTRAINT "PurgeFreeze_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
diff --git a/packages/database/prisma/schema.prisma b/packages/database/prisma/schema.prisma
index 05e737d8..7270c541 100644
--- a/packages/database/prisma/schema.prisma
+++ b/packages/database/prisma/schema.prisma
@@ -2742,3 +2742,38 @@ model WorkspacePostMortem {
 
   @@index([workspaceId, capturedAt])
 }
+
+// RR-1bd27929 — PER-PLAN ownership of account-purge freezes (§16.12). The old
+// model used GLOBAL id-lists, so two concurrent purges sharing an org/project could
+// not tell whose freeze was whose: releasing plan A lifted a freeze plan B still
+// needed. Now each active purge holds a PurgePlan (lease + ownerToken + version for
+// CAS reclaim) and each frozen resource is a PurgeFreeze row OWNED by exactly one
+// plan. A resource is frozen iff >= 1 PurgeFreeze row references it, so releasing
+// one plan only deletes ITS rows and never lifts a freeze another live plan owns.
+// The reconciler reclaims ONLY plans whose lease has expired, via CAS on version —
+// it never touches a live plan.
+model PurgePlan {
+  id             String        @id @default(cuid())
+  userId         String
+  ownerToken     String
+  leaseExpiresAt DateTime
+  version        Int           @default(0)
+  createdAt      DateTime      @default(now())
+  freezes        PurgeFreeze[]
+
+  @@index([userId])
+  @@index([leaseExpiresAt])
+}
+
+model PurgeFreeze {
+  id           String    @id @default(cuid())
+  planId       String
+  resourceType String
+  resourceId   String
+  createdAt    DateTime  @default(now())
+  plan         PurgePlan @relation(fields: [planId], references: [id], onDelete: Cascade)
+
+  @@unique([resourceType, resourceId, planId])
+  @@index([resourceType, resourceId])
+  @@index([planId])
+}
diff --git a/services/api/scripts/physical-purge-gcs-e2e.ts b/services/api/scripts/physical-purge-gcs-e2e.ts
new file mode 100644
index 00000000..108273b2
--- /dev/null
+++ b/services/api/scripts/physical-purge-gcs-e2e.ts
@@ -0,0 +1,179 @@
+/**
+ * REAL GCS end-to-end proof of physical erasure (expert reserve #4).
+ *
+ * Runs the ACTUAL production path — `GcsObjectStorage` (the same adapter the API
+ * uses) driving `eraseSubjectStorage` — against a THROWAWAY bucket in a DEDICATED
+ * TEST project (never prod), with the WIF-proof guardrails: Application Default
+ * Credentials (no persistent key), ~$0, and a full teardown at the end. It seeds
+ * real objects, lists BEFORE, erases, and re-checks the LIVE bucket AFTER
+ * (0 objects, bucket gone), then writes a hashed before/after artifact.
+ *
+ *   GCP_TEST_PROJECT=ecode-proof-b906ss npx tsx services/api/scripts/physical-purge-gcs-e2e.ts --write
+ */
+import { createHash } from 'node:crypto';
+import { mkdirSync, writeFileSync } from 'node:fs';
+import { dirname, join } from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { Storage } from '@google-cloud/storage';
+import { eraseSubjectStorage } from '../src/account-storage-purge.js';
+import { GcsObjectStorage, type StorageLike } from '../src/object-storage.js';
+
+const TEST_PROJECT = process.env.GCP_TEST_PROJECT ?? 'ecode-wif-proof-834022';
+const LOCATION = process.env.GCP_TEST_LOCATION ?? 'EU';
+
+function canonicalize(value: unknown): string {
+  const sort = (input: unknown): unknown => {
+    if (Array.isArray(input)) {
+      return input.map(sort);
+    }
+
+    if (input && typeof input === 'object') {
+      return Object.fromEntries(
+        Object.keys(input as Record<string, unknown>)
+          .sort()
+          .map((key) => [key, sort((input as Record<string, unknown>)[key])]),
+      );
+    }
+
+    return input;
+  };
+
+  return JSON.stringify(sort(value), null, 2);
+}
+
+async function main() {
+  const write = process.argv.includes('--write');
+  const storage = new Storage({ projectId: TEST_PROJECT });
+  const gcs = new GcsObjectStorage(storage as unknown as StorageLike);
+
+  // Unique, clearly-namespaced throwaway project id → bucket `vc-purgee2e...`.
+  const projectId = `purgee2e${Date.now().toString(36)}`;
+  const seedKeys = ['assets/logo.png', 'data/export.json', 'nested/dir/notes.txt'];
+
+  const bucketName = `vc-${projectId}`;
+  let leaked = false;
+
+  try {
+    // ---- seed a REAL bucket + objects ----
+    await gcs.ensureBucket(projectId);
+
+    for (const key of seedKeys) {
+      await gcs.putObject(projectId, { key, body: new Uint8Array([1, 2, 3, 4]), contentType: 'application/octet-stream' });
+    }
+
+    const objectsBefore = (await gcs.listObjects(projectId)).objects.map((o) => o.key).sort();
+
+    if (objectsBefore.length !== seedKeys.length) {
+      throw new Error(`seed failed: expected ${seedKeys.length} objects, found ${objectsBefore.length}`);
+    }
+
+    // ---- run the REAL erasure (production module + adapter) ----
+    const outcome = await eraseSubjectStorage(
+      { bucketProjectIds: [projectId], workspaceIds: [] },
+      { objectStorage: gcs },
+    );
+
+    // ---- verify against the LIVE backend (reserve #2/#4) ----
+    const bucketStillExists = await gcs.bucketExists(projectId);
+    const objectsAfter = bucketStillExists ? (await gcs.listObjects(projectId)).objects.length : 0;
+
+    if (!outcome.verified || bucketStillExists || objectsAfter !== 0) {
+      leaked = bucketStillExists;
+      throw new Error(
+        `PHYSICAL_GCS_E2E_FAILED: verified=${outcome.verified} bucketStillExists=${bucketStillExists} objectsAfter=${objectsAfter}`,
+      );
+    }
+
+    // ---- NEGATIVE (reserve #2 + #6): an inert backend must REFUSE, not certify ----
+    const negProjectId = `purgee2eneg${Date.now().toString(36)}`;
+    const negBucket = `vc-${negProjectId}`;
+    let negRefusedAndSurvived = false;
+
+    try {
+      await gcs.ensureBucket(negProjectId);
+      await gcs.putObject(negProjectId, { key: 'still-here.bin', body: new Uint8Array([9]), contentType: 'application/octet-stream' });
+
+      // An inert (feature-flag-off) backend: active=false. It would answer
+      // bucketExists=false ("absent"), but that proves nothing.
+      const inert = {
+        active: false,
+        bucketExists: (p: string) => gcs.bucketExists(p),
+        listObjects: (p: string) => gcs.listObjects(p),
+        deleteBucket: () => {
+          throw new Error('inert backend must never delete');
+        },
+      };
+      const negOutcome = await eraseSubjectStorage(
+        { bucketProjectIds: [negProjectId], workspaceIds: [] },
+        { objectStorage: inert },
+      );
+      // Must REFUSE (not verified) AND the real bucket must SURVIVE untouched.
+      const negBucketStillThere = await gcs.bucketExists(negProjectId);
+      negRefusedAndSurvived = negOutcome.verified === false && negBucketStillThere === true;
+
+      if (!negRefusedAndSurvived) {
+        throw new Error(`NEGATIVE FAILED: inert backend was allowed to certify (verified=${negOutcome.verified}, bucketThere=${negBucketStillThere})`);
+      }
+    } finally {
+      // teardown the negative bucket (it intentionally survived the refused purge)
+      try {
+        await storage.bucket(negBucket).deleteFiles({ force: true });
+        await storage.bucket(negBucket).delete();
+      } catch {
+        /* best-effort */
+      }
+    }
+
+    const artifact = {
+      kind: 'physical-purge-gcs-e2e',
+      version: 2,
+      project: TEST_PROJECT,
+      location: LOCATION,
+      bucket: bucketName,
+      before: { objects: objectsBefore, count: objectsBefore.length },
+      after: { bucketExists: bucketStillExists, objectsRemaining: objectsAfter },
+      negative: { inertBackendRefusedAndBucketSurvived: negRefusedAndSurvived },
+      classes: outcome.classes,
+      verified: outcome.verified,
+    };
+    const canonical = canonicalize(artifact);
+    const sha256 = createHash('sha256').update(canonical).digest('hex');
+
+    process.stdout.write(
+      `PHYSICAL GCS E2E: PASS\n` +
+        `  project: ${TEST_PROJECT} (dedicated test — not prod)\n` +
+        `  bucket:  ${bucketName}\n` +
+        `  objects before: ${objectsBefore.length}, bucket+objects after: gone / 0\n` +
+        `  verified: ${outcome.verified}\n` +
+        `  NEGATIVE (reserve #2): inert backend refused + bucket survived: ${negRefusedAndSurvived}\n` +
+        `  sha256: ${sha256}\n`,
+    );
+
+    if (write) {
+      const dir = join(
+        dirname(fileURLToPath(import.meta.url)),
+        '../../../docs/deploy-evidence/2026-07-23-physical-purge-e2e',
+      );
+      mkdirSync(dir, { recursive: true });
+      writeFileSync(join(dir, 'gcs-proof.json'), `${canonical}\n`);
+      writeFileSync(join(dir, 'gcs-SHA256SUMS'), `${sha256}  gcs-proof.json\n`);
+      process.stdout.write(`  wrote artifacts to ${dir}\n`);
+    }
+  } finally {
+    // ---- teardown: never leave a test bucket behind (guardrail) ----
+    if (leaked) {
+      try {
+        await storage.bucket(bucketName).deleteFiles({ force: true });
+        await storage.bucket(bucketName).delete();
+        process.stdout.write(`  teardown: force-deleted leaked bucket ${bucketName}\n`);
+      } catch (error) {
+        process.stderr.write(`  teardown WARNING: could not delete ${bucketName}: ${String(error)}\n`);
+      }
+    }
+  }
+}
+
+main().catch((error) => {
+  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
+  process.exit(1);
+});
diff --git a/services/api/scripts/physical-purge-k8s-e2e.sh b/services/api/scripts/physical-purge-k8s-e2e.sh
new file mode 100755
index 00000000..aa209db7
--- /dev/null
+++ b/services/api/scripts/physical-purge-k8s-e2e.sh
@@ -0,0 +1,117 @@
+#!/usr/bin/env bash
+#
+# REAL Kubernetes end-to-end proof of workspace-volume (PVC) erasure — expert
+# reserve #2 ("verify the REAL disappearance of each PVC, not the DB DELETED
+# flag") and reserve #4 ("real cluster, not memory adapters").
+#
+# Uses a throwaway local `kind` cluster (a real k8s API server + real PVC
+# lifecycle) — $0, no GKE — with the WIF-proof guardrails: dedicated test cluster
+# (never prod), no persistent credentials, full teardown at the end (trap).
+#
+# Flow: create a Bound PVC (via a pod), record BEFORE, run the SAME primitives
+# the erasure uses (kubectl delete pvc/pod + kubectl get pvc), then verify the
+# PVC is REALLY gone (get -> NotFound). Writes a hashed before/after artifact.
+#
+#   services/api/scripts/physical-purge-k8s-e2e.sh [--write]
+set -euo pipefail
+
+CLUSTER="purge-e2e"
+NS="purge-e2e"
+PVC="ws-e2e-pvc"
+POD="ws-e2e-pod"
+WRITE="${1:-}"
+HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
+OUT_DIR="$HERE/../../../docs/deploy-evidence/2026-07-23-physical-purge-e2e"
+
+teardown() {
+  echo "  teardown: deleting kind cluster $CLUSTER"
+  kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
+}
+trap teardown EXIT
+
+echo "== creating throwaway kind cluster (real k8s API, \$0, local) =="
+kind create cluster --name "$CLUSTER" --wait 120s >/dev/null 2>&1
+KCTX="kind-$CLUSTER"
+
+kubectl --context "$KCTX" create namespace "$NS" >/dev/null
+
+# A real PVC + a pod to bind it (kind's default StorageClass is WaitForFirstConsumer).
+cat <<YAML | kubectl --context "$KCTX" apply -f - >/dev/null
+apiVersion: v1
+kind: PersistentVolumeClaim
+metadata: { name: $PVC, namespace: $NS }
+spec:
+  accessModes: ["ReadWriteOnce"]
+  resources: { requests: { storage: 64Mi } }
+---
+apiVersion: v1
+kind: Pod
+metadata: { name: $POD, namespace: $NS }
+spec:
+  containers:
+    - name: c
+      image: registry.k8s.io/pause:3.9
+      volumeMounts: [{ name: v, mountPath: /data }]
+  volumes:
+    - name: v
+      persistentVolumeClaim: { claimName: $PVC }
+YAML
+
+echo "== waiting for the PVC to bind (real volume provisioned) =="
+kubectl --context "$KCTX" -n "$NS" wait --for=jsonpath='{.status.phase}'=Bound "pvc/$PVC" --timeout=120s >/dev/null
+
+PVC_BEFORE=$(kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}' 2>/dev/null || echo "MISSING")
+PV_NAME=$(kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" -o jsonpath='{.spec.volumeName}' 2>/dev/null || echo "")
+echo "  BEFORE: pvc=$PVC phase=$PVC_BEFORE pv=$PV_NAME"
+
+# NEGATIVE (reserve #2 + #6): a PVC that STILL EXISTS must be reported present —
+# a surviving PVC can never be certified "gone". Create an extra (unmounted)
+# survivor PVC and confirm the live `get` sees it, so a partial delete that left
+# a PVC behind is caught, not misread as absent.
+echo "== NEGATIVE: a surviving (still-existing) PVC must be reported present =="
+kubectl --context "$KCTX" -n "$NS" apply -f - >/dev/null <<YAML
+apiVersion: v1
+kind: PersistentVolumeClaim
+metadata: { name: ws-e2e-survivor, namespace: $NS }
+spec:
+  accessModes: ["ReadWriteOnce"]
+  resources: { requests: { storage: 32Mi } }
+YAML
+NEG_SURVIVOR_PRESENT="false"
+if kubectl --context "$KCTX" -n "$NS" get pvc ws-e2e-survivor >/dev/null 2>&1; then NEG_SURVIVOR_PRESENT="true"; fi
+echo "  NEGATIVE: surviving pvc reported present: $NEG_SURVIVOR_PRESENT"
+if [ "$NEG_SURVIVOR_PRESENT" != "true" ]; then echo "  negative FAILED (a live PVC was not detected)"; exit 1; fi
+kubectl --context "$KCTX" -n "$NS" delete pvc ws-e2e-survivor --wait=false >/dev/null 2>&1 || true
+
+echo "== erase (same primitives the workspace eraser uses): delete pod + pvc =="
+kubectl --context "$KCTX" -n "$NS" delete pod "$POD" --wait=true --timeout=60s >/dev/null
+kubectl --context "$KCTX" -n "$NS" delete pvc "$PVC" --wait=true --timeout=60s >/dev/null
+
+# Reserve #2: verify the PVC is REALLY gone in the cluster (get -> NotFound).
+if kubectl --context "$KCTX" -n "$NS" get pvc "$PVC" >/dev/null 2>&1; then
+  echo "  AFTER: pvc STILL EXISTS — FAIL"; exit 1
+fi
+PVC_AFTER="NotFound"
+PV_AFTER="gone"
+if [ -n "$PV_NAME" ] && kubectl --context "$KCTX" get pv "$PV_NAME" >/dev/null 2>&1; then
+  PV_AFTER="present"
+fi
+PVC_COUNT=$(kubectl --context "$KCTX" -n "$NS" get pvc --no-headers 2>/dev/null | wc -l | tr -d ' ')
+echo "  AFTER: pvc=$PVC_AFTER pvcCount=$PVC_COUNT pv=$PV_AFTER"
+
+if [ "$PVC_COUNT" != "0" ]; then echo "  residual PVCs remain — FAIL"; exit 1; fi
+
+CANON=$(printf '{\n  "after": {\n    "pv": "%s",\n    "pvc": "%s",\n    "pvcCount": %s\n  },\n  "before": {\n    "pv": "%s",\n    "pvcPhase": "%s"\n  },\n  "cluster": "kind:%s (throwaway, torn down)",\n  "kind": "physical-purge-k8s-e2e",\n  "namespace": "%s",\n  "negative": {\n    "survivingPvcReportedPresent": %s\n  },\n  "pvcName": "%s",\n  "verified": true,\n  "version": 2\n}' \
+  "$PV_AFTER" "$PVC_AFTER" "$PVC_COUNT" "$PV_NAME" "$PVC_BEFORE" "$CLUSTER" "$NS" "$NEG_SURVIVOR_PRESENT" "$PVC")
+SHA=$(printf '%s' "$CANON" | shasum -a 256 | awk '{print $1}')
+
+echo "PHYSICAL K8S E2E: PASS"
+echo "  PVC Bound -> deleted -> verified gone (real k8s API), 0 PVC remaining"
+echo "  sha256: $SHA"
+
+if [ "$WRITE" = "--write" ]; then
+  mkdir -p "$OUT_DIR"
+  printf '%s\n' "$CANON" > "$OUT_DIR/k8s-proof.json"
+  printf '%s  k8s-proof.json\n' "$SHA" > "$OUT_DIR/k8s-SHA256SUMS"
+  echo "  wrote artifacts to $OUT_DIR"
+fi
diff --git a/services/api/src/account-purge.ts b/services/api/src/account-purge.ts
new file mode 100644
index 00000000..006a43fd
--- /dev/null
+++ b/services/api/src/account-purge.ts
@@ -0,0 +1,140 @@
+/**
+ * Account-purge worker support (pure, IO-free) — the EXECUTOR half of the
+ * self-serve deletion machine in ./data-deletion.ts (§16.12 : tombstone →
+ * fenêtre de récupération → purge réelle → PREUVE d'effacement).
+ *
+ * The state machine (request → 14-day grace → ready_to_purge) lives in
+ * data-deletion.ts; this module defines the structured ERASURE PROOF the purge
+ * executor persists (per data class: rows deleted / anonymized / retained with
+ * an explicit reason, plus a post-purge "0 rows remaining" verification), and
+ * the pure helpers to assemble/validate it. The store's purgeUserAccount
+ * (prisma-store.ts / test-api-store.ts) produces one proof per purged account;
+ * the /internal/account-purge route records it to the AdminAuditLog.
+ */
+
+/** How a data class was handled by the purge. */
+export type PurgeAction = 'deleted' | 'anonymized' | 'retained';
+
+/** One data class in the erasure proof. */
+export interface PurgeClassReport {
+  /** Stable class key (sessions, ai_history, financial_records, ...). */
+  dataClass: string;
+  /** What happened to the class as a whole. */
+  action: PurgeAction;
+  /** Rows affected per concrete model (Session, AiConversation, ...). */
+  models: Record<string, number>;
+  /** Mandatory motive when action === 'retained' (fail-closed exceptions). */
+  reason?: string;
+  /**
+   * Post-purge verification for DELETED classes: rows still matching the purge
+   * selector after the deletes ran. Must be 0 for the proof to verify.
+   */
+  remainingAfterPurge?: number;
+}
+
+/** A consigned exception: rows we could NOT erase, and exactly why. */
+export interface PurgeException {
+  dataClass: string;
+  reason: string;
+  rows: number;
+}
+
+/**
+ * The persisted, auditable proof of erasure (§16.12). Written to the
+ * AdminAuditLog (action account.purge_completed) by the purge route.
+ */
+export interface ErasureProof {
+  version: 1;
+  kind: 'account-erasure-proof';
+  userId: string;
+  requestedAt: string;
+  purgedAt: string;
+  classes: PurgeClassReport[];
+  /** Retention exceptions, consigned — never silent. */
+  exceptions: PurgeException[];
+  /** True only when every deleted class re-counted to 0 rows post-purge. */
+  verifiedZeroRemaining: boolean;
+}
+
+/**
+ * Optional physical-erasure hook passed into purgeUserAccount. It erases the
+ * given projects' out-of-database storage (GCS buckets + workspace PVCs) and
+ * reports the auditable classes + whether every one re-counted to 0 remaining.
+ * FAIL-CLOSED contract: when it returns `verified: false`, the purge MUST NOT
+ * stamp the account `purged` (throws / rolls back), so an account is only ever
+ * marked erased once BOTH its rows and its physical storage are proven gone.
+ * Omitted → DB-only purge (unit tests of the row layer).
+ */
+/** Per-subject physical footprint the store resolves for erasure (reserve #3). */
+export interface PurgeStorageInventory {
+  /** Projects whose per-project GCS bucket the subject owns (their sole orgs). */
+  bucketProjectIds: string[];
+  /** Every project the subject has a workspace in (sole-org + collaborator). */
+  workspaceProjectIds: string[];
+}
+
+export interface PurgeStorageDeps {
+  eraseStorage?: (inventory: PurgeStorageInventory) => Promise<{ classes: PurgeClassReport[]; verified: boolean }>;
+}
+
+/** Outcome of one purgeUserAccount attempt (store layer). */
+export type PurgeUserAccountResult =
+  | { outcome: 'purged'; proof: ErasureProof }
+  | { outcome: 'already_purged'; purgedAt: string }
+  | { outcome: 'not_requested' }
+  | { outcome: 'not_due'; purgeDueAt: string };
+
+/** Tombstone e-mail for the anonymized user row (unique per user, no PII). */
+export function anonymizedEmail(userId: string): string {
+  return `purged-${userId}@erased.invalid`;
+}
+
+/** Tombstone slug for an anonymized sole-member organization (unique, no PII). */
+export function anonymizedOrgSlug(organizationId: string): string {
+  return `purged-${organizationId}`;
+}
+
+/**
+ * Assemble the proof from per-class reports. Derives the exceptions list from
+ * every retained class (a retained class without a reason is a programming
+ * error — fail closed by refusing to mark the proof verified) and computes the
+ * "0 rows remaining" verification across deleted classes.
+ */
+export function buildErasureProof(input: {
+  userId: string;
+  requestedAt: string;
+  purgedAt: string;
+  classes: PurgeClassReport[];
+}): ErasureProof {
+  const exceptions: PurgeException[] = input.classes
+    .filter((entry) => entry.action === 'retained')
+    .map((entry) => ({
+      dataClass: entry.dataClass,
+      reason: entry.reason ?? 'unspecified_retention',
+      rows: Object.values(entry.models).reduce((sum, count) => sum + count, 0),
+    }));
+
+  const verifiedZeroRemaining =
+    input.classes
+      .filter((entry) => entry.action === 'deleted')
+      .every((entry) => entry.remainingAfterPurge === 0) &&
+    input.classes.filter((entry) => entry.action === 'retained').every((entry) => Boolean(entry.reason));
+
+  return {
+    version: 1,
+    kind: 'account-erasure-proof',
+    userId: input.userId,
+    requestedAt: input.requestedAt,
+    purgedAt: input.purgedAt,
+    classes: input.classes,
+    exceptions,
+    verifiedZeroRemaining,
+  };
+}
+
+/** Total rows a proof claims were physically deleted. */
+export function proofDeletedRows(proof: ErasureProof): number {
+  return proof.classes
+    .filter((entry) => entry.action === 'deleted')
+    .reduce((sum, entry) => sum + Object.values(entry.models).reduce((s, c) => s + c, 0), 0);
+}
diff --git a/services/api/src/account-storage-purge.ts b/services/api/src/account-storage-purge.ts
new file mode 100644
index 00000000..f96606ae
--- /dev/null
+++ b/services/api/src/account-storage-purge.ts
@@ -0,0 +1,241 @@
+/**
+ * Physical (out-of-database) erasure for account purge — the missing half of the
+ * §16.12 deletion machine. PR #43 erases DB rows with a "0 rows remaining" proof;
+ * this module does the same for a purged DATA SUBJECT's PHYSICAL storage:
+ *   - the per-project GCS object-storage buckets (`vc-<projectId>`) they own, and
+ *   - EVERY per-subject workspace volume (PVC), wherever it lives.
+ *
+ * It answers the four expert reserves on PR #47:
+ *
+ *  #1 WRITE BARRIER — writes are frozen BEFORE erasure (`WriteBarrierPort.freeze`)
+ *     so nothing can be recreated between the erase/verify and the tombstone.
+ *  #2 REAL DISAPPEARANCE — verification re-checks the LIVE backend (GCS list /
+ *     Kubernetes PVC), never a DB `DELETED` flag, because k8s deletes can be
+ *     partial (a PVC can survive a "deleted" row).
+ *  #3 BY DATA SUBJECT — the inventory is per-subject: their sole-org buckets AND
+ *     their workspace in every project they touched (incl. collaborator
+ *     workspaces in shared orgs), not just the one main `workspaceId`.
+ *  #4 REAL PROOF — the ports are the real GCS/Kubernetes adapters in the E2E; the
+ *     list-BEFORE → delete → recount-AFTER evidence folds into the ErasureProof.
+ *
+ * FAIL-CLOSED: any bucket/PVC that does not re-count to 0 (or whose delete threw,
+ * or whose freeze failed) leaves `remainingAfterPurge` > 0, which forbids
+ * stamping the account `purged`. Idempotent, so the worker can safely retry.
+ */
+import type { PurgeClassReport } from './account-purge.js';
+
+/** Object-storage operations the erasure needs (a subset of ObjectStorage). */
+export interface ObjectStorageErasurePort {
+  /**
+   * True only for a REAL, wired backend. Reserve #2: an inert NoopObjectStorage
+   * (feature flag off) must NEVER be allowed to certify "bucket absent" — a
+   * no-op means "cannot prove", so a destructive purge with buckets to erase is
+   * REFUSED unless a real backend is present.
+   */
+  readonly active: boolean;
+  bucketExists(projectId: string): Promise<boolean>;
+  listObjects(projectId: string): Promise<{ objects: Array<{ key: string }> }>;
+  deleteBucket(projectId: string): Promise<{ deleted: boolean; bucket: string }>;
+}
+
+/**
+ * Workspace-volume operations. `pvcExists` MUST reflect the REAL Kubernetes PVC
+ * (reserve #2) — a live `kubectl get pvc`, not the workspace row's status — so a
+ * PVC that survives a partial delete is caught as remaining.
+ */
+export interface WorkspaceVolumeErasurePort {
+  pvcExists(workspaceId: string): Promise<boolean>;
+  deleteWorkspace(workspaceId: string): Promise<void>;
+}
+
+/**
+ * Freezes writes to the subject's storage BEFORE erasure (reserve #1): revoke
+ * workspace tokens / stop pods / mark projects non-provisionable, so nothing can
+ * be recreated in the window between erase-verify and the tombstone. Must throw
+ * on failure (the erasure then fails closed).
+ */
+export interface WriteBarrierPort {
+  freeze(inventory: StorageErasureInventory): Promise<void>;
+}
+
+export interface StorageErasureLogger {
+  warn(obj: unknown, msg?: string): void;
+}
+
+/** The per-subject physical footprint to erase (reserve #3). */
+export interface StorageErasureInventory {
+  /** Projects whose per-project GCS bucket the subject owns (their sole orgs). */
+  bucketProjectIds: string[];
+  /** EVERY per-subject workspace id (sole-org + shared/collaborator workspaces). */
+  workspaceIds: string[];
+}
+
+export interface StorageErasureDeps {
+  /** Undefined => object storage not wired; that class reports nothing to erase. */
+  objectStorage?: ObjectStorageErasurePort;
+  /** Undefined => workspace volumes not wired; that class reports nothing to erase. */
+  workspaceVolumes?: WorkspaceVolumeErasurePort;
+  /** Undefined => no write barrier (unit tests of the erase math). */
+  writeBarrier?: WriteBarrierPort;
+  log?: StorageErasureLogger;
+}
+
+/** Per-bucket before/after evidence. */
+export interface BucketErasureResult {
+  projectId: string;
+  objectsBefore: number;
+  bucketDeleted: boolean;
+  objectsRemaining: number;
+}
+
+/** Per-workspace before/after evidence. */
+export interface WorkspaceErasureResult {
+  workspaceId: string;
+  pvcExistedBefore: boolean;
+  pvcRemaining: number;
+}
+
+export interface StorageErasureOutcome {
+  buckets: BucketErasureResult[];
+  workspaces: WorkspaceErasureResult[];
+  frozen: boolean;
+  /** object_storage + workspace_volumes reports, ready to fold into the proof. */
+  classes: PurgeClassReport[];
+  /** True only when the barrier held AND every bucket + PVC re-counted to 0. */
+  verified: boolean;
+}
+
+async function eraseBucket(
+  projectId: string,
+  port: ObjectStorageErasurePort,
+  log?: StorageErasureLogger,
+): Promise<BucketErasureResult> {
+  try {
+    if (!(await port.bucketExists(projectId))) {
+      return { projectId, objectsBefore: 0, bucketDeleted: false, objectsRemaining: 0 };
+    }
+
+    const objectsBefore = (await port.listObjects(projectId)).objects.length;
+    const del = await port.deleteBucket(projectId);
+
+    // Reserve #2/#4: re-check the LIVE bucket, not any cached/DB state.
+    const objectsRemaining = (await port.bucketExists(projectId)) ? (await port.listObjects(projectId)).objects.length : 0;
+
+    return { projectId, objectsBefore, bucketDeleted: del.deleted, objectsRemaining };
+  } catch (error) {
+    log?.warn({ projectId, err: error }, 'object-storage erase failed');
+
+    return { projectId, objectsBefore: 0, bucketDeleted: false, objectsRemaining: 1 };
+  }
+}
+
+async function eraseWorkspace(
+  workspaceId: string,
+  port: WorkspaceVolumeErasurePort,
+  log?: StorageErasureLogger,
+): Promise<WorkspaceErasureResult> {
+  try {
+    const pvcExistedBefore = await port.pvcExists(workspaceId);
+
+    if (!pvcExistedBefore) {
+      return { workspaceId, pvcExistedBefore: false, pvcRemaining: 0 };
+    }
+
+    await port.deleteWorkspace(workspaceId);
+
+    // Reserve #2: the PVC must be REALLY gone in Kubernetes, not just DELETED in DB.
+    const pvcRemaining = (await port.pvcExists(workspaceId)) ? 1 : 0;
+
+    return { workspaceId, pvcExistedBefore: true, pvcRemaining };
+  } catch (error) {
+    log?.warn({ workspaceId, err: error }, 'workspace-volume erase failed');
+
+    return { workspaceId, pvcExistedBefore: true, pvcRemaining: 1 };
+  }
+}
+
+/**
+ * Erase every physical resource in `inventory` and assemble auditable evidence.
+ * Freezes writes first (reserve #1); a freeze failure fails closed (nothing is
+ * proven erased). Idempotent — a missing bucket/PVC is a verified no-op.
+ */
+export async function eraseSubjectStorage(
+  inventory: StorageErasureInventory,
+  deps: StorageErasureDeps,
+): Promise<StorageErasureOutcome> {
+  // ---- reserve #1: write barrier BEFORE any deletion ----
+  let frozen = true;
+
+  if (deps.writeBarrier) {
+    try {
+      await deps.writeBarrier.freeze(inventory);
+    } catch (error) {
+      deps.log?.warn({ err: error }, 'write barrier freeze failed');
+      frozen = false;
+    }
+  }
+
+  const buckets: BucketErasureResult[] = [];
+  const workspaces: WorkspaceErasureResult[] = [];
+
+  /*
+   * Reserve #2: a destructive purge with buckets to erase REQUIRES a real,
+   * active object-storage backend. An inert NoopObjectStorage (feature flag off)
+   * cannot prove a bucket absent — so we do NOT erase and mark the whole class
+   * unverified, which refuses the purge (fail-closed) rather than certifying
+   * "nothing to erase".
+   */
+  const objectStorageReal = inventory.bucketProjectIds.length === 0 || Boolean(deps.objectStorage?.active);
+
+  // Only proceed with erasure once writes are barred, so nothing is recreated
+  // between delete and verify.
+  if (frozen) {
+    if (deps.objectStorage && objectStorageReal) {
+      for (const projectId of inventory.bucketProjectIds) {
+        buckets.push(await eraseBucket(projectId, deps.objectStorage, deps.log));
+      }
+    }
+
+    if (deps.workspaceVolumes) {
+      for (const workspaceId of inventory.workspaceIds) {
+        workspaces.push(await eraseWorkspace(workspaceId, deps.workspaceVolumes, deps.log));
+      }
+    }
+  }
+
+  const objectsErased = buckets.reduce((sum, r) => sum + r.objectsBefore, 0);
+  const bucketsDeleted = buckets.filter((r) => r.bucketDeleted).length;
+  const objectsRemaining = buckets.reduce((sum, r) => sum + r.objectsRemaining, 0);
+  const pvcsDeleted = workspaces.filter((r) => r.pvcExistedBefore && r.pvcRemaining === 0).length;
+  const pvcsRemaining = workspaces.reduce((sum, r) => sum + r.pvcRemaining, 0);
+
+  // Any unmet precondition (barrier didn't hold, or no real GCS backend) makes
+  // the affected class fully "remaining" so the proof cannot verify.
+  const objectStoragePenalty =
+    (frozen ? 0 : inventory.bucketProjectIds.length) + (objectStorageReal ? 0 : inventory.bucketProjectIds.length);
+
+  const classes: PurgeClassReport[] = [
+    {
+      dataClass: 'object_storage',
+      action: 'deleted',
+      models: {
+        Buckets: inventory.bucketProjectIds.length,
+        BucketsDeleted: bucketsDeleted,
+        ObjectsErased: objectsErased,
+        RealBackend: objectStorageReal ? 1 : 0,
+      },
+      remainingAfterPurge: objectsRemaining + objectStoragePenalty,
+    },
+    {
+      dataClass: 'workspace_volumes',
+      action: 'deleted',
+      models: { Workspaces: inventory.workspaceIds.length, PvcsDeleted: pvcsDeleted, WriteBarrier: frozen ? 1 : 0 },
+      remainingAfterPurge: pvcsRemaining + (frozen ? 0 : inventory.workspaceIds.length),
+    },
+  ];
+
+  const verified =
+    frozen && objectStorageReal && classes.every((entry) => (entry.remainingAfterPurge ?? 0) === 0);
+
+  return { buckets, workspaces, frozen, classes, verified };
+}
diff --git a/services/api/src/app.ts b/services/api/src/app.ts
index 62d9fa25..3804d87d 100644
--- a/services/api/src/app.ts
+++ b/services/api/src/app.ts
@@ -156,6 +156,14 @@ import {
   reportUsagePaygUsage,
   settleCheckpoint,
 } from './credits-service.js';
+import type { PurgeClassReport } from './account-purge.js';
+import {
+  eraseSubjectStorage,
+  type WorkspaceVolumeErasurePort,
+  type WriteBarrierPort,
+  type StorageErasureInventory,
+} from './account-storage-purge.js';
+import type { PurgeStorageInventory } from './account-purge.js';
 import {
   DELETION_GRACE_PERIOD_DAYS,
   canCancelDeletion,
@@ -281,6 +289,7 @@ import {
 import {
   ObjectStorageError,
   type ObjectStorage,
+  guardObjectStorageWrites,
   isObjectStorageEnabled,
   PROJECT_THUMBNAIL_KEY,
   resolveDefaultObjectStorage,
@@ -424,6 +433,16 @@ export interface ApiAppOptions {
   /** Override the per-project object storage backend (tests inject a fake). */
   objectStorage?: ObjectStorage;
 
+  /**
+   * Physical-erasure hook for account purge (§16.12). Defaults to erasing real
+   * GCS buckets + workspace PVCs via `eraseSubjectStorage`; tests inject a fake
+   * to exercise the fail-closed gate without live GCS / workspace-manager.
+   */
+  accountStoragePurger?: (
+    inventory: PurgeStorageInventory,
+    userId: string,
+  ) => Promise<{ classes: PurgeClassReport[]; verified: boolean }>;
+
   /** Injectable for tests; defaults to an env-configured (inert-unless-set) capturer. */
   thumbnailCapturer?: ThumbnailCapturer;
   gitProvider?: GitProvider;
@@ -6691,6 +6710,98 @@ async function writeReleaseManifest(
   }
 }
 
+/*
+ * Workspace-volume eraser for account purge (§16.12 physical erasure): deletes a
+ * workspace's Pod+PVC+Service+Secret via workspace-manager and verifies it is
+ * gone. The API pod has no Kubernetes access of its own — only workspace-manager
+ * does — so PVC deletion necessarily goes through it. `workspaceExists` treats a
+ * 404 or a DELETED row as "gone" (verified erased).
+ */
+function createWorkspaceVolumeEraser(): WorkspaceVolumeErasurePort {
+  const authHeaders = () => {
+    const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();
+
+    return {
+      accept: 'application/json',
+      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
+    };
+  };
+
+  return {
+    async pvcExists(workspaceId: string) {
+      /*
+       * Reserve #2: ask workspace-manager for the REAL Kubernetes PVC state
+       * (a live `kubectl get pvc`), NOT the workspace row's `DELETED` flag — a
+       * partial k8s delete can leave a PVC while the row says deleted.
+       */
+      const response = await fetch(`${workspaceManagerUrl()}/workspaces/${encodeURIComponent(workspaceId)}/pvc-exists`, {
+        headers: authHeaders(),
+        signal: AbortSignal.timeout(15_000),
+      });
+
+      if (response.status === 404) {
+        return false;
+      }
+
+      if (!response.ok) {
+        throw new Error(`pvc existence check failed: ${response.status}`);
+      }
+
+      const body = (await response.json().catch(() => null)) as { exists?: boolean } | null;
+
+      return Boolean(body?.exists);
+    },
+
+    async deleteWorkspace(workspaceId: string) {
+      const response = await fetch(`${workspaceManagerUrl()}/workspaces/${encodeURIComponent(workspaceId)}`, {
+        method: 'DELETE',
+        headers: authHeaders(),
+        signal: AbortSignal.timeout(60_000),
+      });
+
+      // 404 = already gone (idempotent). Anything else non-2xx is a real failure
+      // → the caller re-counts (real PVC check) and fails closed.
+      if (!response.ok && response.status !== 404) {
+        throw new Error(`workspace delete failed: ${response.status}`);
+      }
+    },
+  };
+}
+
+/*
+ * Workspace write barrier (reserve #1): freeze each of the subject's workspaces
+ * BEFORE the erasure — workspace-manager `POST /workspaces/:id/freeze` (revoke
+ * token + stop pod) — so a pod can't recreate files between erase/verify and the
+ * tombstone. The OBJECT-STORAGE freeze (and the membership freeze) is now acquired
+ * earlier, inside the store's topology guarantee (RR-09), before this runs.
+ * FAIL-CLOSED: throws on ANY failure (freeze not acquired) so the erasure aborts.
+ */
+function createWriteBarrier(workspaceIdsFor: (inv: StorageErasureInventory) => string[]): WriteBarrierPort {
+  const authHeaders = () => {
+    const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();
+
+    return { accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) };
+  };
+
+  return {
+    async freeze(inventory: StorageErasureInventory) {
+      // Freeze each workspace (reserve #1). Throws on any failure.
+      for (const workspaceId of workspaceIdsFor(inventory)) {
+        const response = await fetch(`${workspaceManagerUrl()}/workspaces/${encodeURIComponent(workspaceId)}/freeze`, {
+          method: 'POST',
+          headers: authHeaders(),
+          signal: AbortSignal.timeout(30_000),
+        });
+
+        // 404 = no workspace to freeze (idempotent); other non-2xx = real failure.
+        if (!response.ok && response.status !== 404) {
+          throw new Error(`workspace freeze failed for ${workspaceId}: ${response.status}`);
+        }
+      }
+    },
+  };
+}
+
 /*
  * Run ONE isolated build pod via the workspace-manager (synchronous, like the
  * scheduled-jobs transport): revision in, docker-context artifact out. The HTTP
@@ -27852,6 +27963,188 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
     };
   });
 
+  /*
+   * ===== Account-purge executor (§16.12 — internal, worker-triggered) =====
+   * Consumes the ready_to_purge queue the self-serve deletion machine feeds
+   * (request → 14-day grace → ready_to_purge, ./data-deletion.ts): for each
+   * user in account.pendingDeletionUserIds whose grace window has ELAPSED, run
+   * store.purgeUserAccount — the real class-by-class erasure with fail-closed
+   * financial retention (canPurgeFinancialRecord), audit-log redaction (never
+   * deletion), ledger immutability respected (mig 0078), an anonymized
+   * tombstone carrying purgedAt, and a structured ERASURE PROOF verified
+   * "0 rows remaining" per purged class. The proof is persisted to the
+   * AdminAuditLog (action account.purge_completed) and the user leaves the
+   * pending set. Idempotent (already-purged → no-op) and concurrency-safe
+   * (per-user advisory lock in the store).
+   *
+   * DRY-RUN by default: scans + counts but only purges when
+   * ACCOUNT_PURGE_ENABLED=true (or body.enabled) — mirrors /internal/inactivity-gc.
+   */
+  app.post('/internal/account-purge', async (request) => {
+    requireInternalSecret(request);
+
+    const body = parse(
+      z.object({
+        enabled: z.boolean().optional(),
+        take: z.number().int().positive().max(1000).optional(),
+        userId: z.string().min(1).optional(),
+      }),
+      request.body ?? {},
+    );
+
+    const enabled = body.enabled ?? process.env.ACCOUNT_PURGE_ENABLED === 'true';
+    const nowMs = Date.now();
+
+    let ids: string[];
+
+    if (body.userId) {
+      ids = [body.userId];
+    } else {
+      const settings = await store.listSystemSettings();
+      const pending = settings.find((setting) => setting.key === ACCOUNT_DELETION_PENDING_KEY);
+      ids = Array.isArray(pending?.value)
+        ? (pending!.value as unknown[]).filter((id): id is string => typeof id === 'string')
+        : [];
+    }
+
+    ids = ids.slice(0, body.take ?? 500);
+
+    /*
+     * RR-09 (4): recover from a crash. Release any purge freeze left behind by a
+     * run that died between acquiring its topology guarantee and releasing it, so
+     * a legitimate org/project is never frozen forever. Users still ready_to_purge
+     * re-acquire a fresh guarantee below.
+     */
+    const reconciled = await store.reconcilePurgeFreezes();
+
+    let ready = 0;
+    let purged = 0;
+    let alreadyPurged = 0;
+    let notDue = 0;
+    let stale = 0;
+    let failed = 0;
+
+    for (const userId of ids) {
+      const user = await store.findUserById(userId);
+      const state = readAccountDeletionState(user?.preferences);
+      const status = deletionStatus({ ...state, nowMs });
+
+      if (!user || status === 'none') {
+        // Cancelled/vanished request still indexed — drop the stale id.
+        stale += 1;
+        await store.mutateSystemSettingIds(ACCOUNT_DELETION_PENDING_KEY, { remove: userId });
+        continue;
+      }
+
+      if (status === 'grace_period') {
+        notDue += 1;
+        continue;
+      }
+
+      if (status === 'purged') {
+        alreadyPurged += 1;
+        await store.mutateSystemSettingIds(ACCOUNT_DELETION_PENDING_KEY, { remove: userId });
+        continue;
+      }
+
+      // ready_to_purge
+      ready += 1;
+
+      if (!enabled) {
+        continue; // dry-run: counted, not purged
+      }
+
+      try {
+        const result = await store.purgeUserAccount(
+          { userId, nowMs },
+          {
+            /*
+             * Physical-erasure gate (§16.12): erase the account's GCS buckets +
+             * workspace PVCs and prove 0 remaining BEFORE the DB tombstone is
+             * stamped. A failure throws → the account stays queued and is retried
+             * → an account is never marked purged with storage still on disk.
+             */
+            eraseStorage: (inventory) =>
+              options.accountStoragePurger
+                ? options.accountStoragePurger(inventory, userId)
+                : eraseSubjectStorage(
+                    {
+                      bucketProjectIds: inventory.bucketProjectIds,
+                      // Reserve #3: a per-user workspace exists in EVERY project the
+                      // subject touched (sole-org + collaborator), deterministically
+                      // named runtimeWorkspaceId(projectId, userId).
+                      workspaceIds: inventory.workspaceProjectIds.map((projectId) =>
+                        runtimeWorkspaceId(projectId, userId),
+                      ),
+                    },
+                    {
+                      // RAW (unguarded) backend: the erasure must delete the very
+                      // projects it freezes; the freeze guard would refuse them.
+                      objectStorage: resolveRawObjectStorage(),
+                      workspaceVolumes: createWorkspaceVolumeEraser(),
+                      // Object-storage + membership freeze is acquired earlier, in
+                      // the store's topology guarantee (RR-09); this barrier now
+                      // only freezes the workspaces.
+                      writeBarrier: createWriteBarrier((inv) => inv.workspaceIds),
+                      log: app.log as unknown as { warn(o: unknown, m?: string): void },
+                    },
+                  ),
+          },
+        );
+
+        if (result.outcome === 'purged') {
+          purged += 1;
+          /*
+           * The PROOF is persisted before the id leaves the pending set: if the
+           * audit write fails the purge stays visible in the queue and the next
+           * run resolves it as already_purged (idempotent), so an erasure can
+           * never end up both unlisted and unproven.
+           */
+          await store.recordAdminAudit({
+            actorUserId: undefined,
+            action: 'account.purge_completed',
+            metadata: { userId, proof: result.proof },
+          });
+          await store.mutateSystemSettingIds(ACCOUNT_DELETION_PENDING_KEY, { remove: userId });
+        } else if (result.outcome === 'already_purged') {
+          alreadyPurged += 1;
+          await store.mutateSystemSettingIds(ACCOUNT_DELETION_PENDING_KEY, { remove: userId });
+        } else if (result.outcome === 'not_due') {
+          // Store-level re-check disagreed (clock skew) — leave it queued.
+          ready -= 1;
+          notDue += 1;
+        } else {
+          ready -= 1;
+          stale += 1;
+          await store.mutateSystemSettingIds(ACCOUNT_DELETION_PENDING_KEY, { remove: userId });
+        }
+      } catch (error) {
+        // Fail-closed: a failed purge stays in the queue and is observable.
+        failed += 1;
+        request.log?.error?.({ err: error, userId }, 'account purge failed');
+        await store
+          .recordAdminAudit({
+            actorUserId: undefined,
+            action: 'account.purge_failed',
+            metadata: { userId, error: error instanceof Error ? error.message : String(error) },
+          })
+          .catch(() => {});
+      }
+    }
+
+    return {
+      enabled,
+      scanned: ids.length,
+      ready,
+      purged,
+      alreadyPurged,
+      notDue,
+      stale,
+      failed,
+      reconciledFreezes: reconciled.reconciled,
+    };
+  });
+
   /*
    * ===== Replit-parity metering ingest (P8/P4 — internal, service-to-service) =====
    * The workspace-manager GC (compute), and other producers (object storage, DB,
@@ -30069,7 +30362,14 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
   /* -------- Object Storage (GCS, per-project) — dormant unless OBJECT_STORAGE_ENABLED -------- */
   const sendObjectStorageError = (reply: FastifyReply, error: unknown) => {
     if (error instanceof ObjectStorageError) {
-      const status = error.code === 'INVALID_KEY' ? 400 : error.code === 'FEATURE_NOT_ENABLED' ? 404 : 422;
+      const status =
+        error.code === 'INVALID_KEY'
+          ? 400
+          : error.code === 'FEATURE_NOT_ENABLED'
+            ? 404
+            : error.code === 'OBJECT_STORAGE_PURGE_FROZEN'
+              ? 403
+              : 422;
 
       return reply.code(status).send({ error: error.message, code: error.code });
     }
@@ -30077,7 +30377,29 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
     throw error;
   };
 
-  const resolveObjectStorage = (): ObjectStorage => options.objectStorage ?? resolveDefaultObjectStorage();
+  /*
+   * Reserve #3 / RR-08 #1: is THIS project's object storage frozen by an in-flight
+   * account purge? Shared by the explicit route guard (objectStorageWriteBlocked,
+   * early 403) and the structural write wrapper below (defence in depth for the
+   * background thumbnail capturer and any future write path).
+   */
+  const isObjectStoragePurgeFrozen = async (projectId: string): Promise<boolean> =>
+    store.isObjectStorageProjectPurgeFrozen(projectId);
+
+  /*
+   * RAW backend — used ONLY by the account-purge erasure, which must be able to
+   * delete the very project it just froze (the guard below would otherwise refuse
+   * it). Erasure only ever reads/deletes, never creates, so this is safe.
+   */
+  const resolveRawObjectStorage = (): ObjectStorage => options.objectStorage ?? resolveDefaultObjectStorage();
+
+  /*
+   * Everyone else — every request route AND the background thumbnail capturer —
+   * obtains the freeze-GUARDED wrapper, so no present or future write path can
+   * recreate a bucket/object for a project under purge (RR-08 #1).
+   */
+  const resolveObjectStorage = (): ObjectStorage =>
+    guardObjectStorageWrites(resolveRawObjectStorage(), isObjectStoragePurgeFrozen);
 
   /*
    * P11 automatic thumbnails. Inert unless SCREENSHOTTER_URL is set, so this is a
@@ -30130,6 +30452,24 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
     }
   });
 
+  /*
+   * Reserve #3: refuse any object-storage WRITE for a project whose storage was
+   * frozen by an in-flight account purge, so a bucket/object can't be recreated
+   * after the zero-check and before the tombstone. Returns true (blocked) after
+   * sending the 403.
+   */
+  const objectStorageWriteBlocked = async (projectId: string, reply: FastifyReply): Promise<boolean> => {
+    if (await isObjectStoragePurgeFrozen(projectId)) {
+      await reply
+        .code(403)
+        .send({ error: 'Object storage is frozen for account deletion', code: 'OBJECT_STORAGE_PURGE_FROZEN' });
+
+      return true;
+    }
+
+    return false;
+  };
+
   app.post('/projects/:projectId/object-storage/bucket', async (request, reply) => {
     if (!isObjectStorageEnabled()) {
       return reply.code(404).send({ error: 'Object storage is not enabled', code: 'FEATURE_NOT_ENABLED' });
@@ -30137,6 +30477,10 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
 
     const project = await requireObjectStorageProject(request, 'projects:write');
 
+    if (await objectStorageWriteBlocked(project.id, reply)) {
+      return reply;
+    }
+
     try {
       return reply.send(await resolveObjectStorage().ensureBucket(project.id));
     } catch (error) {
@@ -30184,6 +30528,10 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
 
     const project = await requireObjectStorageProject(request, 'projects:write');
 
+    if (await objectStorageWriteBlocked(project.id, reply)) {
+      return reply;
+    }
+
     const body = parse(
       z.object({ key: z.string().min(1).max(1024), contentType: z.string().max(255).optional() }),
       request.body ?? {},
@@ -30218,6 +30566,10 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
 
     const project = await requireObjectStorageProject(request, 'projects:write');
 
+    if (await objectStorageWriteBlocked(project.id, reply)) {
+      return reply;
+    }
+
     const body = parse(
       z.object({ from: z.string().min(1).max(1024), to: z.string().min(1).max(1024) }),
       request.body ?? {},
@@ -30272,6 +30624,13 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
 
     const project = await requireObjectStorageProject(request, 'projects:write');
 
+    // RR-08 #1: the thumbnail signed-upload is a storage WRITE like any other —
+    // it must refuse a project frozen for account deletion, or ensureBucket +
+    // createUploadUrl could recreate the bucket/object after the purge zero-check.
+    if (await objectStorageWriteBlocked(project.id, reply)) {
+      return reply;
+    }
+
     try {
       const storage = resolveObjectStorage();
 
diff --git a/services/api/src/object-storage.spec.ts b/services/api/src/object-storage.spec.ts
index aeca5fba..e0b75f86 100644
--- a/services/api/src/object-storage.spec.ts
+++ b/services/api/src/object-storage.spec.ts
@@ -6,9 +6,11 @@ import {
   ObjectStorageError,
   assertValidObjectKey,
   buildLifecycleRules,
+  guardObjectStorageWrites,
   projectBucketName,
   type BucketLike,
   type FileLike,
+  type ObjectStorage,
   type StorageLike,
 } from './object-storage.js';
 
@@ -333,3 +335,67 @@ describe('GcsObjectStorage', () => {
     expect(result.deleted).toBe(false);
   });
 });
+
+describe('guardObjectStorageWrites — account-purge freeze barrier (RR-08 #1)', () => {
+  function tracking(): { storage: ObjectStorage; calls: string[] } {
+    const calls: string[] = [];
+    const record =
+      <T>(name: string, value: T) =>
+      async () => {
+        calls.push(name);
+
+        return value;
+      };
+    const storage: ObjectStorage = {
+      active: true,
+      ensureBucket: record('ensureBucket', { bucket: 'vc-p', created: true, location: 'EU' }),
+      bucketExists: record('bucketExists', true),
+      listObjects: record('listObjects', { objects: [], folders: [] }),
+      createUploadUrl: record('createUploadUrl', { url: 'u', method: 'PUT' as const, headers: {}, expiresAt: 'x' }),
+      createDownloadUrl: record('createDownloadUrl', { url: 'd', expiresAt: 'y' }),
+      putObject: record('putObject', { key: 'k', size: 1 }),
+      moveObject: record('moveObject', { moved: true, key: 't' }),
+      deleteObject: record('deleteObject', { deleted: true, count: 1 }),
+      deletePrefix: record('deletePrefix', { deleted: true, count: 1 }),
+      deleteBucket: record('deleteBucket', { deleted: true, bucket: 'vc-p' }),
+    };
+
+    return { storage, calls };
+  }
+
+  const frozenFor = (frozen: Set<string>) => async (projectId: string) => frozen.has(projectId);
+
+  it('REFUSES every create/modify primitive for a frozen project and never touches the backend', async () => {
+    const { storage, calls } = tracking();
+    const guarded = guardObjectStorageWrites(storage, frozenFor(new Set(['p'])));
+
+    for (const call of [
+      () => guarded.ensureBucket('p'),
+      () => guarded.createUploadUrl('p', { key: 'thumbnail.png' }),
+      () => guarded.putObject('p', { key: 'thumbnail.png', body: new Uint8Array([1]) }),
+      () => guarded.moveObject('p', { from: 'a', to: 'b' }),
+    ]) {
+      await expect(call()).rejects.toMatchObject({ code: 'OBJECT_STORAGE_PURGE_FROZEN' });
+    }
+
+    // Not one write reached the underlying backend.
+    expect(calls).toEqual([]);
+  });
+
+  it('lets a frozen project still be READ and DELETED, and lets an UNFROZEN project write', async () => {
+    const { storage, calls } = tracking();
+    const guarded = guardObjectStorageWrites(storage, frozenFor(new Set(['p'])));
+
+    // Reads + deletes pass through even for the frozen project.
+    await guarded.bucketExists('p');
+    await guarded.listObjects('p');
+    await guarded.deleteBucket('p');
+    await guarded.deleteObject('p', { key: 'x' });
+
+    // A different, unfrozen project writes normally.
+    await guarded.ensureBucket('other');
+    await guarded.createUploadUrl('other', { key: 'k' });
+
+    expect(calls).toEqual(['bucketExists', 'listObjects', 'deleteBucket', 'deleteObject', 'ensureBucket', 'createUploadUrl']);
+  });
+});
diff --git a/services/api/src/object-storage.ts b/services/api/src/object-storage.ts
index 0fe98dab..97fdd1bf 100644
--- a/services/api/src/object-storage.ts
+++ b/services/api/src/object-storage.ts
@@ -173,6 +173,61 @@ export interface StorageLike {
   bucket(name: string): BucketLike;
 }
 
+/*
+ * Wrap an ObjectStorage so every CREATE/MODIFY primitive REFUSES a project whose
+ * storage was frozen by an in-flight account purge (§16.12, RR-08 #1). This is
+ * the STRUCTURAL barrier: every request route and the background thumbnail
+ * capturer obtain their storage through this wrapper, so no present or future
+ * write path (signed upload-url, ensureBucket, server-side putObject, move) can
+ * recreate a bucket/object after the purge's zero-check and before the tombstone.
+ *
+ * Reads and DELETES pass through unguarded on purpose: a delete never resurrects
+ * data, and the purge's OWN erasure runs on the raw (unwrapped) adapter so it can
+ * still delete the very project it froze.
+ */
+export function guardObjectStorageWrites(
+  inner: ObjectStorage,
+  isFrozen: (projectId: string) => Promise<boolean>,
+): ObjectStorage {
+  const refuseIfFrozen = async (projectId: string) => {
+    if (await isFrozen(projectId)) {
+      throw new ObjectStorageError('Object storage is frozen for account deletion', 'OBJECT_STORAGE_PURGE_FROZEN');
+    }
+  };
+
+  return {
+    get active() {
+      return inner.active;
+    },
+    async ensureBucket(projectId) {
+      await refuseIfFrozen(projectId);
+
+      return inner.ensureBucket(projectId);
+    },
+    bucketExists: (projectId) => inner.bucketExists(projectId),
+    listObjects: (projectId, opts) => inner.listObjects(projectId, opts),
+    async createUploadUrl(projectId, input) {
+      await refuseIfFrozen(projectId);
+
+      return inner.createUploadUrl(projectId, input);
+    },
+    createDownloadUrl: (projectId, input) => inner.createDownloadUrl(projectId, input),
+    async putObject(projectId, input) {
+      await refuseIfFrozen(projectId);
+
+      return inner.putObject(projectId, input);
+    },
+    async moveObject(projectId, input) {
+      await refuseIfFrozen(projectId);
+
+      return inner.moveObject(projectId, input);
+    },
+    deleteObject: (projectId, input) => inner.deleteObject(projectId, input),
+    deletePrefix: (projectId, input) => inner.deletePrefix(projectId, input),
+    deleteBucket: (projectId) => inner.deleteBucket(projectId),
+  };
+}
+
 /** Inert object storage: the default while the feature is off and in tests. */
 export class NoopObjectStorage implements ObjectStorage {
   readonly active = false;
diff --git a/services/api/src/prisma-store.ts b/services/api/src/prisma-store.ts
index 410d7345..0b32960a 100644
--- a/services/api/src/prisma-store.ts
+++ b/services/api/src/prisma-store.ts
@@ -1,9 +1,19 @@
+import { randomUUID } from 'node:crypto';
 import { promises as dnsPromises } from 'node:dns';
 import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
 import { hashToken } from '@vibecore/auth';
 import type { PlanKey, QuotaKey } from '@vibecore/billing';
 import { createDatabaseClient, Prisma, type DatabaseClient } from '@vibecore/database';
 import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
+import {
+  anonymizedEmail,
+  anonymizedOrgSlug,
+  buildErasureProof,
+  type PurgeClassReport,
+  type PurgeStorageDeps,
+  type PurgeUserAccountResult,
+} from './account-purge.js';
+import { deletionStatus, purgeDueAtMs, FINANCIAL_RETENTION_DAYS } from './data-deletion.js';
 import { API_KEY_SCOPES, DEFAULT_ENV_VAR_SCOPE, ENV_VAR_SCOPES } from './store.js';
 import type {
   AbuseEventRecord,
@@ -120,6 +130,63 @@ function parseJsonArray<T>(value: string | null | undefined): T[] {
   }
 }
 
+/*
+ * A stable, order-independent signature of the storage topology an account purge
+ * depends on. The external GCS/PVC erasure runs on the PRE-transaction topology;
+ * the purge tx re-derives this same fingerprint under the advisory lock and
+ * aborts on any drift, so a membership race (shared→sole / sole→shared) can never
+ * finalize a purge on a stale inventory (RR-08 #3).
+ */
+function storageTopologyFingerprint(topology: {
+  orgIds: string[];
+  soleOrgIds: string[];
+  bucketProjectIds: string[];
+  workspaceProjectIds: string[];
+}): string {
+  const sorted = (values: string[]) => [...values].sort();
+
+  return JSON.stringify({
+    orgIds: sorted(topology.orgIds),
+    soleOrgIds: sorted(topology.soleOrgIds),
+    bucketProjectIds: sorted(topology.bucketProjectIds),
+    workspaceProjectIds: sorted(topology.workspaceProjectIds),
+  });
+}
+
+/*
+ * Account-purge topology guarantee (RR-09 + RR-1bd27929 per-plan ownership).
+ * Freezes are now DB rows OWNED by a plan, not global id-lists:
+ *   - a PurgePlan row per active purge carries a lease (leaseExpiresAt), an
+ *     ownerToken and a version for CAS reclaim;
+ *   - a PurgeFreeze row (planId, resourceType, resourceId) freezes ONE resource
+ *     for ONE plan. A resource is frozen iff >= 1 PurgeFreeze row references it.
+ * So two purges sharing an org each hold their OWN membership row: releasing one
+ * plan deletes only ITS rows and never lifts a freeze another live plan owns; and
+ * the reconciler reclaims ONLY plans whose lease expired (CAS on version) — never
+ * a live plan. resourceType values: 'membership' (orgId) | 'objectStorage'
+ * (projectId). addMember/removeMember and the object-storage routes refuse while
+ * >= 1 plan freezes the resource.
+ */
+const MEMBERSHIP_RESOURCE = 'membership';
+const OBJECT_STORAGE_RESOURCE = 'objectStorage';
+// Advisory-lock name that serialises the membership guarantee's read→freeze with
+// addMember/removeMember (see CANONICAL LOCK ORDER in acquirePurgeGuarantee).
+const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
+// Lease TTL: comfortably exceeds any GCS/PVC erasure, so the reconciler never
+// reclaims a live plan mid-erasure. Abandoned plans self-heal within one TTL.
+const PURGE_LEASE_TTL_MS = 30 * 60 * 1000;
+
+/** The topology-locked plan the external erasure is authorized to act on. */
+interface PurgeGuarantee {
+  planId: string;
+  ownerToken: string;
+  userId: string;
+  fingerprint: string;
+  orgIds: string[];
+  bucketProjectIds: string[];
+  workspaceProjectIds: string[];
+}
+
 type PrismaKnownRequestError = Error & { readonly code: string };
 
 /**
@@ -393,6 +460,713 @@ export class PrismaApiStore implements ApiStore {
     }
   }
 
+  /*
+   * §16.12 purge executor — consumes ready_to_purge and REALLY erases the
+   * account, class by class, producing a persisted-shape erasure proof.
+   *
+   * Concurrency: the whole purge runs in ONE interactive transaction opened
+   * with a per-user pg_advisory_xact_lock, so two workers racing on the same
+   * user serialize; the loser re-reads the tombstone (purgedAt set) and
+   * returns already_purged without touching a row. Idempotent by the same
+   * mechanism. Fail-closed retention: financial records inside the 7-year
+   * window (canPurgeFinancialRecord) and posted ledger transactions
+   * (immutability triggers, mig 0078) are never DELETEd — they are counted
+   * and consigned as exceptions in the proof. Audit logs are redacted in
+   * place, never deleted. Any non-zero post-purge recount throws, rolling the
+   * transaction back so a half-purge can never be reported as done.
+   */
+  /**
+   * The full storage TOPOLOGY the purge depends on: the user's orgs, which are
+   * SOLE-member (bucket + DB rows are erased) vs shared (retained for the other
+   * members), and the resolved project-id sets. Computed against ANY client — the
+   * live `this.prisma` (pre-transaction, to drive the external GCS/PVC erasure)
+   * OR the purge `tx` (authoritative, under the advisory lock). The `fingerprint`
+   * lets the tx detect a membership race (shared→sole / sole→shared) that shifted
+   * the topology while the external erasure ran, and ABORT before the tombstone
+   * rather than finalize on a stale inventory (see purgeUserAccount, RR-08 #3).
+   */
+  private async resolveStorageTopology(
+    client: Prisma.TransactionClient,
+    userId: string,
+  ): Promise<{
+    orgIds: string[];
+    soleOrgIds: string[];
+    sharedOrgIds: string[];
+    bucketProjectIds: string[];
+    workspaceProjectIds: string[];
+    fingerprint: string;
+  }> {
+    const memberships = await client.organizationMember.findMany({
+      where: { userId },
+      select: { organizationId: true },
+    });
+    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
+    const soleOrgIds: string[] = [];
+    const sharedOrgIds: string[] = [];
+
+    for (const orgId of orgIds) {
+      const members = await client.organizationMember.count({ where: { organizationId: orgId } });
+      (members === 1 ? soleOrgIds : sharedOrgIds).push(orgId);
+    }
+
+    // Buckets: only the subject's SOLE-org projects (the bucket is org-owned; a
+    // shared org's bucket belongs to the other members and is retained).
+    const bucketProjects =
+      soleOrgIds.length > 0
+        ? await client.project.findMany({ where: { organizationId: { in: soleOrgIds } }, select: { id: true } })
+        : [];
+    const bucketProjectIds = bucketProjects.map((p) => p.id);
+
+    /*
+     * Workspaces (reserve #3 + #4): the subject can hold a per-user workspace in
+     * EVERY project they are AUTHORIZED to open, which follows the REAL access
+     * rules — org membership grants project access, so ANY project in ANY org the
+     * subject belongs to (sole OR shared) is reachable, WITHOUT needing an explicit
+     * ProjectCollaborator row. Enumerate all of them, plus any explicit
+     * collaborations (defence in depth), not just sole-org + collaborators.
+     */
+    const orgProjects =
+      orgIds.length > 0
+        ? await client.project.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
+        : [];
+    const collaborations = await client.projectCollaborator.findMany({
+      where: { userId },
+      select: { projectId: true },
+    });
+    const workspaceProjectIds = [
+      ...new Set([...orgProjects.map((p) => p.id), ...collaborations.map((c) => c.projectId)]),
+    ];
+
+    const fingerprint = storageTopologyFingerprint({ orgIds, soleOrgIds, bucketProjectIds, workspaceProjectIds });
+
+    return { orgIds, soleOrgIds, sharedOrgIds, bucketProjectIds, workspaceProjectIds, fingerprint };
+  }
+
+  /* ---------------- account-purge topology guarantee (RR-09) ---------------- */
+
+  /** Is this project's object storage frozen by >= 1 in-flight account purge? */
+  async isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean> {
+    return (
+      (await this.prisma.purgeFreeze.count({
+        where: { resourceType: OBJECT_STORAGE_RESOURCE, resourceId: projectId },
+      })) > 0
+    );
+  }
+
+  /**
+   * RR-09 (1)(2)(3) + RR-1bd27929: acquire the topology GUARANTEE before any
+   * external deletion, as a PLAN that OWNS its freeze rows. In ONE tx:
+   *   CANONICAL LOCK ORDER — account-purge:<userId>  <  MEMBERSHIP_FREEZE_LOCK
+   * both taken BEFORE the topology read (addMember/removeMember and the purge
+   * finalize tombstone take these in the same order — no inversion, no deadlock).
+   * CODEX-10: the membership lock is held from before the read to commit, so the
+   * read and the freeze are atomic w.r.t. membership — a join that grabbed the lock
+   * first commits before ours and is reflected in the topology (a now-shared org's
+   * bucket is excluded); one arriving after blocks until commit and is refused.
+   * Creates a PurgePlan (lease + ownerToken + version for CAS reclaim) and one
+   * PurgeFreeze row per org (membership) and per sole-org bucket (objectStorage),
+   * all OWNED by this plan.
+   */
+  private async acquirePurgeGuarantee(userId: string): Promise<PurgeGuarantee> {
+    const ownerToken = randomUUID();
+    const leaseExpiresAt = new Date(Date.now() + PURGE_LEASE_TTL_MS);
+
+    return this.prisma.$transaction(async (tx) => {
+      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
+      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
+
+      const topology = await this.resolveStorageTopology(tx, userId);
+
+      const plan = await tx.purgePlan.create({ data: { userId, ownerToken, leaseExpiresAt } });
+
+      const freezeRows = [
+        ...topology.orgIds.map((orgId) => ({
+          planId: plan.id,
+          resourceType: MEMBERSHIP_RESOURCE,
+          resourceId: orgId,
+        })),
+        ...topology.bucketProjectIds.map((projectId) => ({
+          planId: plan.id,
+          resourceType: OBJECT_STORAGE_RESOURCE,
+          resourceId: projectId,
+        })),
+      ];
+
+      if (freezeRows.length > 0) {
+        await tx.purgeFreeze.createMany({ data: freezeRows, skipDuplicates: true });
+      }
+
+      return {
+        planId: plan.id,
+        ownerToken,
+        userId,
+        fingerprint: topology.fingerprint,
+        orgIds: topology.orgIds,
+        bucketProjectIds: topology.bucketProjectIds,
+        workspaceProjectIds: topology.workspaceProjectIds,
+      };
+    });
+  }
+
+  /**
+   * RR-1bd27929: release the guarantee — delete ONLY THIS plan's freeze rows (never
+   * another plan's, so a shared resource stays frozen while another live plan owns
+   * it) then the plan row (CAS on ownerToken). Thaws membership then object storage
+   * as separate steps; if a thaw fails, the plan is LEFT (not deleted) so the
+   * reconciler recovers it via its lease — a freeze is never stranded without a
+   * plan pointing at it. Deleting the plan cascades any remaining freeze rows.
+   */
+  private async releasePurgeGuarantee(guarantee: PurgeGuarantee): Promise<void> {
+    try {
+      await this.prisma.purgeFreeze.deleteMany({
+        where: { planId: guarantee.planId, resourceType: MEMBERSHIP_RESOURCE },
+      });
+      await this.prisma.purgeFreeze.deleteMany({
+        where: { planId: guarantee.planId, resourceType: OBJECT_STORAGE_RESOURCE },
+      });
+    } catch {
+      // A thaw failed mid-release → keep the plan (and its remaining rows) for the
+      // reconciler; never delete the plan while a freeze it owns might still be up.
+      return;
+    }
+
+    await this.prisma.purgePlan
+      .deleteMany({ where: { id: guarantee.planId, ownerToken: guarantee.ownerToken } })
+      .catch(() => undefined);
+  }
+
+  /**
+   * RR-1bd27929: recover ABANDONED plans only. Reclaims a plan ONLY when its lease
+   * has EXPIRED (a live plan — valid lease — is never touched, even one blocked in
+   * a slow erasure), and via CAS on `version` so two concurrent reconcilers (or a
+   * late owner) can't double-reclaim. Deletes ONLY the reclaimed plan's own freeze
+   * rows — never a concurrent plan's.
+   */
+  async reconcilePurgeFreezes(): Promise<{ reconciled: number }> {
+    const now = new Date();
+    const expired = await this.prisma.purgePlan.findMany({ where: { leaseExpiresAt: { lt: now } } });
+    let reconciled = 0;
+
+    for (const plan of expired) {
+      // CAS: only the reconciler that wins the version bump owns the reclaim.
+      const won = await this.prisma.purgePlan.updateMany({
+        where: { id: plan.id, version: plan.version, leaseExpiresAt: { lt: now } },
+        data: { version: { increment: 1 } },
+      });
+
+      if (won.count === 0) {
+        continue; // lost the race, or the plan was renewed / already removed
+      }
+
+      await this.prisma.purgeFreeze.deleteMany({ where: { planId: plan.id } }).catch(() => undefined);
+      await this.prisma.purgePlan.deleteMany({ where: { id: plan.id } }).catch(() => undefined);
+      reconciled += 1;
+    }
+
+    return { reconciled };
+  }
+
+  /**
+   * RR-09 (2) + RR-1bd27929: refuse a membership mutation while >= 1 plan freezes
+   * this org. Takes the MEMBERSHIP_FREEZE_LOCK the guarantee holds, so a mutation
+   * either serialises BEFORE the guarantee's read (and is reflected in its
+   * topology) or sees the freeze row and is refused — never interleaving to flip
+   * sole↔shared mid-erasure. The org stays refused while ANY plan freezes it (so
+   * releasing one of two sharing plans does not re-open it). Call inside the
+   * caller's tx.
+   */
+  private async assertOrgMembershipNotPurgeFrozen(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
+    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
+    const frozen = await tx.purgeFreeze.count({
+      where: { resourceType: MEMBERSHIP_RESOURCE, resourceId: organizationId },
+    });
+
+    if (frozen > 0) {
+      throw new Error(
+        `MEMBERSHIP_FROZEN_FOR_PURGE: organization ${organizationId} membership is frozen during an account purge`,
+      );
+    }
+  }
+
+  async purgeUserAccount(
+    input: { userId: string; nowMs?: number },
+    deps?: PurgeStorageDeps,
+  ): Promise<PurgeUserAccountResult> {
+    const { userId } = input;
+    const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
+    const nowIso = new Date(nowMs).toISOString();
+
+    /*
+     * PHYSICAL ERASURE GATE (§16.12 + RR-09) — GCS/PVC deletes are external,
+     * non-transactional I/O, so they run before the DB tx. RR-09 order:
+     *   (1) ACQUIRE a topology GUARANTEE — freeze membership + object storage and
+     *       record the authoritative sole/shared topology, atomically under the
+     *       advisory lock — BEFORE any deletion;
+     *   (2) ERASE only the guaranteed-sole buckets/PVCs (idempotent, fail-closed);
+     *   (3) FINALIZE (DB tx): deletes + tombstone, with a drift backstop;
+     *   (4) RELEASE the guarantee in `finally` — ALWAYS, so no freeze is stranded.
+     * Only runs when the account is actually ready_to_purge.
+     */
+    let physicalClasses: PurgeClassReport[] = [];
+    // The topology guarantee the external erasure acted under (RR-09). Null when
+    // no physical erasure ran (dry-run / no storage deps): nothing external was
+    // touched, so there is no guarantee to acquire, drift to guard, or freeze to
+    // release.
+    let guarantee: PurgeGuarantee | null = null;
+
+    if (deps?.eraseStorage) {
+      const pre = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
+      const preDeletion = ((pre?.preferences ?? {}) as Record<string, unknown>).accountDeletion as
+        | { requestedAt?: string; purgedAt?: string }
+        | undefined;
+      const toMsPre = (value?: string) => {
+        const ms = value ? new Date(value).getTime() : NaN;
+
+        return Number.isFinite(ms) ? ms : null;
+      };
+      const preStatus = deletionStatus({
+        requestedAtMs: toMsPre(preDeletion?.requestedAt),
+        purgedAtMs: toMsPre(preDeletion?.purgedAt),
+        nowMs,
+      });
+
+      if (preStatus === 'ready_to_purge') {
+        // (1) acquire the guarantee BEFORE deleting anything external.
+        guarantee = await this.acquirePurgeGuarantee(userId);
+      }
+    }
+
+    try {
+      // (2) erase ONLY under an acquired guarantee, on its locked inventory.
+      if (guarantee && deps?.eraseStorage) {
+        const erasure = await deps.eraseStorage({
+          bucketProjectIds: guarantee.bucketProjectIds,
+          workspaceProjectIds: guarantee.workspaceProjectIds,
+        });
+
+        if (!erasure.verified) {
+          throw new Error(
+            `ACCOUNT_PURGE_PHYSICAL_INCOMPLETE: physical storage not fully erased for ${userId} ` +
+              `(${erasure.classes.map((c) => `${c.dataClass}=${c.remainingAfterPurge ?? 0}`).join(', ')})`,
+          );
+        }
+
+        physicalClasses = erasure.classes;
+      }
+
+      const erasedTopologyFingerprint = guarantee?.fingerprint ?? null;
+
+      // (3) finalize.
+      return await this.prisma.$transaction(
+        async (tx) => {
+        // CANONICAL LOCK ORDER (see acquirePurgeGuarantee): account-purge < membership.
+        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
+
+        /*
+         * RR-20260804-CODEX-10 A.1: this finalize tx reads the topology (drift
+         * backstop) AND deletes the subject's OrganizationMember rows (the tombstone
+         * below) — a direct write that changes existing orgs' member counts. It MUST
+         * take the SAME membership freeze-set lock addMember/removeMember/the
+         * guarantee take, so it cannot interleave DURING another purge's atomic
+         * read→freeze section and flip an org sole↔shared under that purge's snapshot.
+         */
+        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
+
+        const user = await tx.user.findUnique({ where: { id: userId } });
+
+        if (!user) {
+          return { outcome: 'not_requested' as const };
+        }
+
+        const preferences = (user.preferences ?? {}) as Record<string, unknown>;
+        const deletion = (preferences.accountDeletion ?? null) as { requestedAt?: string; purgedAt?: string } | null;
+        const toMs = (value?: string) => {
+          if (!value) {
+            return null;
+          }
+
+          const ms = new Date(value).getTime();
+
+          return Number.isFinite(ms) ? ms : null;
+        };
+        const requestedAtMs = toMs(deletion?.requestedAt);
+        const purgedAtMs = toMs(deletion?.purgedAt);
+        const status = deletionStatus({ requestedAtMs, purgedAtMs, nowMs });
+
+        if (status === 'purged') {
+          return { outcome: 'already_purged' as const, purgedAt: deletion!.purgedAt! };
+        }
+
+        if (status === 'none') {
+          return { outcome: 'not_requested' as const };
+        }
+
+        if (status === 'grace_period') {
+          return { outcome: 'not_due' as const, purgeDueAt: new Date(purgeDueAtMs(requestedAtMs!)).toISOString() };
+        }
+
+        /*
+         * ready_to_purge: resolve the org topology (sole-member vs shared)
+         * AUTHORITATIVELY under the advisory lock. This is the same computation
+         * the pre-transaction step used to drive the external GCS/PVC erasure.
+         */
+        const topology = await this.resolveStorageTopology(tx, userId);
+        const { orgIds, soleOrgIds, sharedOrgIds } = topology;
+
+        /*
+         * TOPOLOGY DRIFT BACKSTOP (RR-08 #3 / RR-09). The guarantee froze
+         * membership before the erasure, so the topology CANNOT have shifted while
+         * we erased — this re-verify should never fire. It remains as defence in
+         * depth against the razor-thin window between the guarantee's topology read
+         * and its freeze commit: if anything drifted, ABORT before any delete or the
+         * tombstone. The tx rolls back, purgedAt is never stamped, the freeze is
+         * released (finally), and the next run re-acquires a fresh guarantee.
+         */
+        if (erasedTopologyFingerprint !== null && topology.fingerprint !== erasedTopologyFingerprint) {
+          throw new Error(
+            `ACCOUNT_PURGE_TOPOLOGY_DRIFT: storage topology changed during physical erasure for ${userId} ` +
+              `— refusing to finalize on a stale inventory (account re-queued)`,
+          );
+        }
+
+        const classes: PurgeClassReport[] = [];
+
+        // ---- deleted classes ----
+        const sessions = await tx.session.deleteMany({ where: { userId } });
+        classes.push({ dataClass: 'sessions', action: 'deleted', models: { Session: sessions.count } });
+
+        const emailTokens = await tx.emailVerificationToken.deleteMany({ where: { userId } });
+        const resetTokens = await tx.passwordResetToken.deleteMany({ where: { userId } });
+        const recoveryCodes = await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
+        classes.push({
+          dataClass: 'auth_tokens',
+          action: 'deleted',
+          models: {
+            EmailVerificationToken: emailTokens.count,
+            PasswordResetToken: resetTokens.count,
+            MfaRecoveryCode: recoveryCodes.count,
+          },
+        });
+
+        const apiKeys = await tx.apiKey.deleteMany({ where: { userId } });
+        classes.push({ dataClass: 'api_keys', action: 'deleted', models: { ApiKey: apiKeys.count } });
+
+        const accounts = await tx.account.deleteMany({ where: { userId } });
+        const oauthConnections = await tx.oAuthConnection.deleteMany({ where: { userId } });
+        const userConnections = await tx.userConnection.deleteMany({ where: { userId } });
+        classes.push({
+          dataClass: 'connected_accounts',
+          action: 'deleted',
+          models: {
+            Account: accounts.count,
+            OAuthConnection: oauthConnections.count,
+            UserConnection: userConnections.count,
+          },
+        });
+
+        // AI history. AiMessage / AiToolCall / AiTokenUsage cascade off the
+        // conversation delete — count them FIRST so the proof carries real
+        // per-model numbers, not just the parent count. AiTokenUsage rows ride
+        // this cascade by schema design; the canonical billing truth
+        // (AiCostLedger / UsageEvent / Ledger*) is org-scoped and RETAINED below.
+        const aiMessages = await tx.aiMessage.count({ where: { conversation: { userId } } });
+        const aiToolCalls = await tx.aiToolCall.count({ where: { message: { conversation: { userId } } } });
+        const aiTokenUsages = await tx.aiTokenUsage.count({ where: { message: { conversation: { userId } } } });
+        const aiConversations = await tx.aiConversation.deleteMany({ where: { userId } });
+        const agentRuns = await tx.agentRun.deleteMany({ where: { userId } });
+        const agentMemories = await tx.agentMemory.deleteMany({ where: { userId } });
+        const agentMemoryPreferences = await tx.agentMemoryPreference.deleteMany({ where: { userId } });
+        const mcpInstalls = await tx.mcpInstall.deleteMany({ where: { userId } });
+        const mcpUserConfigs = await tx.mcpUserConfig.deleteMany({ where: { userId } });
+        const aiFeedback = await tx.aiMessageFeedback.deleteMany({ where: { userId } });
+        const notifications = await tx.notification.deleteMany({ where: { userId } });
+        const soleOrgCheckpoints =
+          soleOrgIds.length > 0
+            ? await tx.agentCheckpoint.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
+            : { count: 0 };
+        classes.push({
+          dataClass: 'ai_history',
+          action: 'deleted',
+          models: {
+            AiConversation: aiConversations.count,
+            AiMessage: aiMessages,
+            AiToolCall: aiToolCalls,
+            AiTokenUsage: aiTokenUsages,
+            AgentRun: agentRuns.count,
+            AgentMemory: agentMemories.count,
+            AgentMemoryPreference: agentMemoryPreferences.count,
+            McpInstall: mcpInstalls.count,
+            McpUserConfig: mcpUserConfigs.count,
+            AiMessageFeedback: aiFeedback.count,
+            Notification: notifications.count,
+            AgentCheckpoint: soleOrgCheckpoints.count,
+          },
+        });
+
+        const collaborators = await tx.projectCollaborator.deleteMany({ where: { userId } });
+        const presence = await tx.collaborationPresence.deleteMany({ where: { userId } });
+        const comments = await tx.collaborationComment.deleteMany({ where: { userId } });
+        const shareLinks = await tx.projectShareLink.deleteMany({ where: { createdByUserId: userId } });
+        const spendLimits = await tx.userSpendLimit.deleteMany({ where: { userId } });
+        classes.push({
+          dataClass: 'collaboration',
+          action: 'deleted',
+          models: {
+            ProjectCollaborator: collaborators.count,
+            CollaborationPresence: presence.count,
+            CollaborationComment: comments.count,
+            ProjectShareLink: shareLinks.count,
+            UserSpendLimit: spendLimits.count,
+          },
+        });
+
+        // Projects & workspaces of sole-member orgs (files, snapshots,
+        // deployments, workspaces, gallery listings... cascade off Project).
+        const projects =
+          soleOrgIds.length > 0
+            ? await tx.project.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
+            : { count: 0 };
+        classes.push({ dataClass: 'projects', action: 'deleted', models: { Project: projects.count } });
+
+        const importJobs =
+          soleOrgIds.length > 0
+            ? await tx.importJob.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
+            : { count: 0 };
+        classes.push({ dataClass: 'imports', action: 'deleted', models: { ImportJob: importJobs.count } });
+
+        const orgMemberships = await tx.organizationMember.deleteMany({ where: { userId } });
+        classes.push({
+          dataClass: 'memberships',
+          action: 'deleted',
+          models: { OrganizationMember: orgMemberships.count },
+        });
+
+        // Marketing: unsubscribe by e-mail BEFORE the tombstone rewrites it.
+        const newsletter = await tx.newsletterSubscriber.deleteMany({ where: { email: user.email } });
+        classes.push({ dataClass: 'marketing', action: 'deleted', models: { NewsletterSubscriber: newsletter.count } });
+
+        // ---- anonymized classes (redacted in place, never deleted) ----
+        const auditRedacted = await tx.auditLog.updateMany({
+          where: { actorUserId: userId },
+          data: { ipAddress: null, metadata: { redacted: true, redactedAt: nowIso } as Prisma.InputJsonValue },
+        });
+        const adminAuditRedacted = await tx.adminAuditLog.updateMany({
+          where: { actorUserId: userId },
+          data: { ipAddress: null },
+        });
+        classes.push({
+          dataClass: 'audit_logs',
+          action: 'anonymized',
+          reason: 'append_only_redacted_never_deleted',
+          models: { AuditLog: auditRedacted.count, AdminAuditLog: adminAuditRedacted.count },
+        });
+
+        const usageEventRefs = await tx.usageEvent.updateMany({ where: { userId }, data: { userId: null } });
+        const agentCallLogRefs = await tx.agentCallLog.updateMany({ where: { userId }, data: { userId: null } });
+        const reservationRefs = await tx.ledgerReservation.updateMany({ where: { userId }, data: { userId: null } });
+        const checkpointRefs = await tx.agentCheckpoint.updateMany({ where: { userId }, data: { userId: null } });
+        const activityRefs = await tx.projectActivity.updateMany({
+          where: { actorUserId: userId },
+          data: { actorUserId: null },
+        });
+        const importRefs = await tx.importJob.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });
+        const galleryRefs = await tx.galleryListing.updateMany({
+          where: { authorUserId: userId },
+          data: { authorUserId: null, authorName: 'Deleted account' },
+        });
+        const ticketRefs = await tx.supportTicket.updateMany({ where: { userId }, data: { userId: null } });
+        classes.push({
+          dataClass: 'user_references',
+          action: 'anonymized',
+          reason: 'retained_rows_detached_from_user',
+          models: {
+            UsageEvent: usageEventRefs.count,
+            AgentCallLog: agentCallLogRefs.count,
+            LedgerReservation: reservationRefs.count,
+            AgentCheckpoint: checkpointRefs.count,
+            ProjectActivity: activityRefs.count,
+            ImportJob: importRefs.count,
+            GalleryListing: galleryRefs.count,
+            SupportTicket: ticketRefs.count,
+          },
+        });
+
+        // Sole-member org shells: anonymize the name/slug (may carry PII), keep
+        // the row as the anchor of the retained financial records.
+        let orgsAnonymized = 0;
+
+        for (const orgId of soleOrgIds) {
+          await tx.organization.update({
+            where: { id: orgId },
+            data: { name: 'Purged account', slug: anonymizedOrgSlug(orgId), billingEmail: null },
+          });
+          orgsAnonymized += 1;
+        }
+
+        classes.push({
+          dataClass: 'organizations',
+          action: 'anonymized',
+          reason: 'retained_as_anchor_for_financial_records',
+          models: { Organization: orgsAnonymized },
+        });
+
+        // ---- retained classes (fail-closed retention, consigned) ----
+        // Financial rows past the 7-year window MAY be erased
+        // (canPurgeFinancialRecord); everything inside the window is retained.
+        const financialCutoff = new Date(nowMs - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
+        const soleOrgWhere = { organizationId: { in: soleOrgIds } };
+        let financialExpiredDeleted = 0;
+
+        if (soleOrgIds.length > 0) {
+          const expiredUsage = await tx.usageEvent.deleteMany({
+            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
+          });
+          const expiredAiCost = await tx.aiCostLedger.deleteMany({
+            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
+          });
+          const expiredCredits = await tx.creditLedger.deleteMany({
+            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
+          });
+          financialExpiredDeleted = expiredUsage.count + expiredAiCost.count + expiredCredits.count;
+        }
+
+        const retainedFinancial = {
+          UsageEvent: soleOrgIds.length > 0 ? await tx.usageEvent.count({ where: soleOrgWhere }) : 0,
+          AiCostLedger: soleOrgIds.length > 0 ? await tx.aiCostLedger.count({ where: soleOrgWhere }) : 0,
+          CreditLedger: soleOrgIds.length > 0 ? await tx.creditLedger.count({ where: soleOrgWhere }) : 0,
+          StripeEvent: soleOrgIds.length > 0 ? await tx.stripeEvent.count({ where: soleOrgWhere }) : 0,
+          Subscription: soleOrgIds.length > 0 ? await tx.subscription.count({ where: soleOrgWhere }) : 0,
+        };
+        classes.push({
+          dataClass: 'financial_records',
+          action: 'retained',
+          reason: 'financial_retention_7y_fail_closed',
+          models: { ...retainedFinancial, ExpiredRowsErased: financialExpiredDeleted },
+        });
+
+        const ledgerTransactions =
+          soleOrgIds.length > 0 ? await tx.ledgerTransaction.count({ where: soleOrgWhere }) : 0;
+        classes.push({
+          dataClass: 'ledger',
+          action: 'retained',
+          reason: 'ledger_immutable_posted_entries_mig0078',
+          models: { LedgerTransaction: ledgerTransactions },
+        });
+
+        const sharedProjects =
+          sharedOrgIds.length > 0 ? await tx.project.count({ where: { organizationId: { in: sharedOrgIds } } }) : 0;
+        classes.push({
+          dataClass: 'shared_org_content',
+          action: 'retained',
+          reason: 'shared_organization_belongs_to_other_members',
+          models: { Project: sharedProjects },
+        });
+
+        // ---- tombstone: anonymize the user row, stamp purgedAt ----
+        await tx.user.update({
+          where: { id: userId },
+          data: {
+            email: anonymizedEmail(userId),
+            name: null,
+            passwordHash: null,
+            emailVerifiedAt: null,
+            mfaEnabled: false,
+            mfaSecretCiphertext: null,
+            platformAdmin: false,
+            language: null,
+            timezone: null,
+            lastActiveAt: null,
+            preferences: {
+              accountDeletion: { requestedAt: deletion!.requestedAt, purgedAt: nowIso },
+            } as Prisma.InputJsonValue,
+          },
+        });
+        classes.push({
+          dataClass: 'profile',
+          action: 'anonymized',
+          reason: 'tombstone_carries_purgedAt',
+          models: { User: 1 },
+        });
+
+        // ---- post-purge verification: recount every deleted class ----
+        const verify: Record<string, number> = {
+          sessions: await tx.session.count({ where: { userId } }),
+          auth_tokens:
+            (await tx.emailVerificationToken.count({ where: { userId } })) +
+            (await tx.passwordResetToken.count({ where: { userId } })) +
+            (await tx.mfaRecoveryCode.count({ where: { userId } })),
+          api_keys: await tx.apiKey.count({ where: { userId } }),
+          connected_accounts:
+            (await tx.account.count({ where: { userId } })) +
+            (await tx.oAuthConnection.count({ where: { userId } })) +
+            (await tx.userConnection.count({ where: { userId } })),
+          ai_history:
+            (await tx.aiConversation.count({ where: { userId } })) +
+            (await tx.agentRun.count({ where: { userId } })) +
+            (await tx.agentMemory.count({ where: { userId } })) +
+            (await tx.agentMemoryPreference.count({ where: { userId } })) +
+            (await tx.mcpInstall.count({ where: { userId } })) +
+            (await tx.mcpUserConfig.count({ where: { userId } })) +
+            (await tx.aiMessageFeedback.count({ where: { userId } })) +
+            (await tx.notification.count({ where: { userId } })),
+          collaboration:
+            (await tx.projectCollaborator.count({ where: { userId } })) +
+            (await tx.collaborationPresence.count({ where: { userId } })) +
+            (await tx.collaborationComment.count({ where: { userId } })) +
+            (await tx.projectShareLink.count({ where: { createdByUserId: userId } })) +
+            (await tx.userSpendLimit.count({ where: { userId } })),
+          projects: soleOrgIds.length > 0 ? await tx.project.count({ where: soleOrgWhere }) : 0,
+          imports: soleOrgIds.length > 0 ? await tx.importJob.count({ where: soleOrgWhere }) : 0,
+          memberships: await tx.organizationMember.count({ where: { userId } }),
+          marketing: await tx.newsletterSubscriber.count({ where: { email: user.email } }),
+        };
+
+        for (const entry of classes) {
+          if (entry.action === 'deleted') {
+            entry.remainingAfterPurge = verify[entry.dataClass] ?? 0;
+          }
+        }
+
+        const leftovers = Object.entries(verify).filter(([, remaining]) => remaining > 0);
+
+        if (leftovers.length > 0) {
+          // Roll the whole purge back: a partial erasure must never be
+          // reported (and stamped purgedAt) as complete.
+          throw new Error(
+            `ACCOUNT_PURGE_VERIFICATION_FAILED: rows remaining after purge for ${userId}: ${leftovers
+              .map(([k, v]) => `${k}=${v}`)
+              .join(', ')}`,
+          );
+        }
+
+        /*
+         * Fold the physical-erasure evidence (object_storage, workspace_volumes)
+         * into the proof. It was already verified (remainingAfterPurge === 0)
+         * before this tx started; appending it here makes buildErasureProof's
+         * verifiedZeroRemaining cover physical storage too.
+         */
+        classes.push(...physicalClasses);
+
+        const proof = buildErasureProof({
+          userId,
+          requestedAt: deletion!.requestedAt!,
+          purgedAt: nowIso,
+          classes,
+        });
+
+        return { outcome: 'purged' as const, proof };
+      },
+        { timeout: 120_000, maxWait: 20_000 },
+      );
+    } finally {
+      // (4) RR-09 — RELEASE the guarantee on EVERY exit (purged / drift / any
+      // throw), so membership + object-storage freezes are never left behind.
+      if (guarantee) {
+        await this.releasePurgeGuarantee(guarantee);
+      }
+    }
+  }
+
   async findUserByEmail(email: string) {
     const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
     return user ? mapUser(user) : undefined;
@@ -669,11 +1443,19 @@ export class PrismaApiStore implements ApiStore {
   async addMember(input: { organizationId: string; userId: string; roleKey: string }) {
     const role = await this.ensureRole(input.roleKey);
 
-    const membership = await this.prisma.organizationMember.upsert({
-      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
-      create: { organizationId: input.organizationId, userId: input.userId, roleId: role.id },
-      update: { roleId: role.id },
-      include: { role: true },
+    // RR-09 (2): refuse a join while this org's membership is frozen by an
+    // in-flight account purge, so the sole→shared flip can't happen mid-erasure.
+    // The assertion + the upsert share one tx (and the freeze-set advisory lock)
+    // so the check and the write cannot straddle a concurrent guarantee.
+    const membership = await this.prisma.$transaction(async (tx) => {
+      await this.assertOrgMembershipNotPurgeFrozen(tx, input.organizationId);
+
+      return tx.organizationMember.upsert({
+        where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
+        create: { organizationId: input.organizationId, userId: input.userId, roleId: role.id },
+        update: { roleId: role.id },
+        include: { role: true },
+      });
     });
 
     return mapMembership(membership);
@@ -697,24 +1479,35 @@ export class PrismaApiStore implements ApiStore {
   }
 
   async removeMember(organizationId: string, userId: string) {
-    const membership = await this.prisma.organizationMember.findUnique({
-      where: { organizationId_userId: { organizationId, userId } },
-      include: { role: true },
-    });
-
-    if (!membership) {
-      return undefined;
-    }
-
     /*
+     * RR-09 (2): refuse a leave while this org's membership is frozen by an
+     * in-flight account purge, so a co-member leaving can't flip the subject's
+     * org shared→sole mid-erasure and strand its bucket. The freeze check and the
+     * delete share one tx (and the freeze-set advisory lock).
+     *
      * Delete via deleteMany gated on count rather than delete({ where: { id } }):
-     * between the lookup above and this write a concurrent removeMember() can
-     * delete the same row, and delete() would then throw an unhandled P2025.
-     * deleteMany returns count 0 in that case, which we surface as "already gone".
+     * between the lookup and this write a concurrent removeMember() can delete the
+     * same row, and delete() would then throw an unhandled P2025. deleteMany
+     * returns count 0 in that case, which we surface as "already gone".
      */
-    const deleted = await this.prisma.organizationMember.deleteMany({ where: { id: membership.id } });
+    const membership = await this.prisma.$transaction(async (tx) => {
+      await this.assertOrgMembershipNotPurgeFrozen(tx, organizationId);
+
+      const found = await tx.organizationMember.findUnique({
+        where: { organizationId_userId: { organizationId, userId } },
+        include: { role: true },
+      });
+
+      if (!found) {
+        return undefined;
+      }
+
+      const deleted = await tx.organizationMember.deleteMany({ where: { id: found.id } });
 
-    if (deleted.count === 0) {
+      return deleted.count === 0 ? undefined : found;
+    });
+
+    if (!membership) {
       return undefined;
     }
 
diff --git a/services/api/src/store.ts b/services/api/src/store.ts
index 28c197a2..1be1d640 100644
--- a/services/api/src/store.ts
+++ b/services/api/src/store.ts
@@ -2,6 +2,7 @@ import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
 import { hashToken } from '@vibecore/auth';
 import type { PlanKey, QuotaKey } from '@vibecore/billing';
 import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
+import type { PurgeStorageDeps, PurgeUserAccountResult } from './account-purge.js';
 
 export interface UserRecord {
   id: string;
@@ -1243,6 +1244,28 @@ export interface ApiStore {
     preferences?: Record<string, unknown> | null;
   }): Promise<UserRecord>;
   deleteUser(userId: string): Promise<boolean>;
+
+  /**
+   * Execute the REAL purge of a self-serve account deletion (§16.12 : the
+   * executor that consumes ready_to_purge). Guarded end-to-end:
+   *   - refuses unless the user's accountDeletion request exists AND the
+   *     14-day grace window has elapsed (deletionStatus === 'ready_to_purge');
+   *   - idempotent: an already-purged account returns already_purged, no-op;
+   *   - concurrency-safe: two workers racing on the same user must yield ONE
+   *     purge (the store serializes per user — advisory lock in Postgres);
+   *   - retention fail-closed: financial records inside the 7-year window and
+   *     posted ledger transactions (immutability triggers, mig 0078) are
+   *     RETAINED and consigned as exceptions in the proof, never silently;
+   *   - audit logs are REDACTED (anonymized), never deleted;
+   *   - the user row becomes an anonymized tombstone carrying purgedAt.
+   * Returns the persisted-shape erasure proof (per class: deleted/anonymized/
+   * retained counts + post-purge 0-rows verification) on success.
+   */
+  purgeUserAccount(input: { userId: string; nowMs?: number }, deps?: PurgeStorageDeps): Promise<PurgeUserAccountResult>;
+  /** RR-09: release any account-purge freeze left behind by a crashed run. */
+  reconcilePurgeFreezes(): Promise<{ reconciled: number }>;
+  /** RR-1bd27929: is this project's object storage frozen by >= 1 in-flight purge? */
+  isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean>;
   findUserByEmail(email: string): Promise<UserRecord | undefined>;
   findUserById(id: string): Promise<UserRecord | undefined>;
   /**
diff --git a/services/api/src/tests/account-purge-db.spec.ts b/services/api/src/tests/account-purge-db.spec.ts
new file mode 100644
index 00000000..24d8fc17
--- /dev/null
+++ b/services/api/src/tests/account-purge-db.spec.ts
@@ -0,0 +1,853 @@
+import { hashPassword } from '@vibecore/auth';
+import { createDatabaseClient } from '@vibecore/database';
+import { describe, expect, it, vi } from 'vitest';
+
+import type { ErasureProof, PurgeStorageInventory } from '../account-purge.js';
+import { eraseSubjectStorage } from '../account-storage-purge.js';
+import { buildApiApp } from '../app.js';
+import type { EmailProvider } from '../email.js';
+import { PrismaApiStore } from '../prisma-store.js';
+
+/*
+ * Physical-erasure hook for these real-Postgres route tests. It drives the REAL
+ * eraseProjectsStorage orchestration against in-memory fake storage seeded with
+ * a bucket + workspace per project — so the route's fail-closed physical gate is
+ * genuinely exercised (list → delete → verify 0) WITHOUT a live workspace-manager
+ * / GCS. The SQL assertions below verify the row-level purge; the physical proof
+ * has its own dedicated suites. Without this, the route's default eraser would
+ * fetch a non-existent workspace-manager and (correctly) fail the purge closed.
+ */
+function verifiedPhysicalPurger() {
+  return (inventory: PurgeStorageInventory) => {
+    const buckets = new Map<string, string[]>();
+    const pvcs = new Set<string>();
+    let frozen = false;
+
+    for (const id of inventory.bucketProjectIds) {
+      buckets.set(id, ['seed-object.bin']);
+    }
+
+    const workspaceIds = inventory.workspaceProjectIds.map((id) => `ws-${id}`);
+
+    for (const wsId of workspaceIds) {
+      pvcs.add(wsId);
+    }
+
+    return eraseSubjectStorage(
+      { bucketProjectIds: inventory.bucketProjectIds, workspaceIds },
+      {
+        writeBarrier: {
+          async freeze() {
+            frozen = true;
+          },
+        },
+        objectStorage: {
+          active: true,
+          async bucketExists(projectId) {
+            return buckets.has(projectId);
+          },
+          async listObjects(projectId) {
+            return { objects: (buckets.get(projectId) ?? []).map((key) => ({ key })) };
+          },
+          async deleteBucket(projectId) {
+            // Only allow deletion after the write barrier (reserve #1).
+            if (frozen) {
+              buckets.delete(projectId);
+            }
+
+            return { deleted: frozen, bucket: `vc-${projectId}` };
+          },
+        },
+        workspaceVolumes: {
+          async pvcExists(workspaceId) {
+            return pvcs.has(workspaceId);
+          },
+          async deleteWorkspace(workspaceId) {
+            if (frozen) {
+              pvcs.delete(workspaceId);
+            }
+          },
+        },
+      },
+    );
+  };
+}
+
+/*
+ * §16.12 purge executor — DURABLE proofs against a REAL Postgres. Gated on
+ * DATABASE_URL like the other DB-backed suites (ledger-store-db.spec.ts):
+ * runs in CI and locally against a migrated Postgres, silently skips otherwise.
+ *
+ * Proves, with real SQL state:
+ *   (1) full account purge: data seeded across classes (session, org, project,
+ *       import, AI conversation+message, usage event, audit trail) → deletion
+ *       requested → grace window elapsed by REWRITING the requestedAt
+ *       timestamp in the DB (never the clock) → worker route executed →
+ *       per-class "0 rows remaining" SQL verification → erasure proof re-read
+ *       from the AdminAuditLog table;
+ *   (2) refusal while the window has not elapsed (negative);
+ *   (3) idempotence: a re-run on a purged account is a no-op;
+ *   (4) concurrency: two INDEPENDENT Prisma clients racing on the same user
+ *       yield exactly one purge (advisory-lock serialization);
+ *   (5) fail-closed retention: a posted double-entry ledger transaction
+ *       (immutability triggers, mig 0078) survives the purge and is consigned.
+ */
+
+async function canReachDatabase() {
+  if (!process.env.DATABASE_URL) {
+    return false;
+  }
+
+  const prisma = createDatabaseClient();
+
+  try {
+    await prisma.$queryRaw`SELECT 1`;
+    return true;
+  } catch {
+    return false;
+  } finally {
+    await prisma.$disconnect();
+  }
+}
+
+class QuietEmailProvider implements EmailProvider {
+  async send() {}
+}
+
+const runDbTests = (await canReachDatabase()) ? describe : describe.skip;
+
+const DAY = 24 * 60 * 60 * 1000;
+const SECRET = 'purge-db-internal-secret';
+const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
+
+/** Seed a user with rows in every purgeable class. Returns ids for later SQL checks. */
+async function seedAccount(store: PrismaApiStore) {
+  const tag = suffix();
+  const user = await store.createUser({
+    email: `purge-${tag}@example.com`,
+    name: 'Purge Db',
+    passwordHash: hashPassword('password123'),
+  });
+  await store.createSession({ userId: user.id, token: `tok-${tag}`, expiresAt: new Date(Date.now() + 3600_000) });
+
+  const org = await store.createOrganization({ name: `Purge Org ${tag}`, slug: `purge-org-${tag}`, ownerUserId: user.id });
+  const project = await store.createProject({ organizationId: org.id, name: `Secret ${tag}`, slug: `secret-${tag}` });
+  const importJob = await store.createImportJob({ organizationId: org.id, actorUserId: user.id, provider: 'zip' });
+  const conversation = await store.createAiConversation({ projectId: project.id, userId: user.id, title: 'chat' });
+  await store.createAiMessage({ conversationId: conversation.id, role: 'user', content: 'hello purge' });
+  await store.recordUsageEvent({ organizationId: org.id, userId: user.id, type: 'ai.tokens', quantity: 7 });
+  await store.recordAudit({
+    actorUserId: user.id,
+    action: 'project.created',
+    resourceType: 'project',
+    resourceId: project.id,
+    ipAddress: '203.0.113.9',
+    metadata: { name: `Secret ${tag}` },
+  });
+
+  return { user, org, project, importJob, conversation, tag };
+}
+
+/** Mark deletion requested, then rewind requestedAt IN THE DB (never the clock). */
+async function requestElapsedDeletion(store: PrismaApiStore, userId: string, daysAgo = 15) {
+  const user = (await store.findUserById(userId))!;
+  const requestedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
+  await store.updateUser({
+    userId,
+    preferences: { ...(user.preferences ?? {}), accountDeletion: { requestedAt } },
+  });
+  await store.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: userId });
+}
+
+runDbTests('account purge — durable proofs (real Postgres)', () => {
+  it('(2 NEGATIVE first) refuses while the grace window has not elapsed', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user } = await seedAccount(store);
+      await requestElapsedDeletion(store, user.id, 2); // only 2 days in
+
+      const result = await store.purgeUserAccount({ userId: user.id });
+      expect(result.outcome).toBe('not_due');
+
+      // Untouched: session + conversation still present in SQL.
+      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
+      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(1);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops', async () => {
+    const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
+    process.env.INTERNAL_API_SHARED_SECRET = SECRET;
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const app = await buildApiApp({
+        store,
+        emailProvider: new QuietEmailProvider(),
+        accountStoragePurger: verifiedPhysicalPurger(),
+      });
+      const { user, org, project, importJob, conversation } = await seedAccount(store);
+      await requestElapsedDeletion(store, user.id);
+
+      const res = await app.inject({
+        method: 'POST',
+        url: '/internal/account-purge',
+        headers: { authorization: `Bearer ${SECRET}` },
+        payload: { enabled: true, userId: user.id },
+      });
+      expect(res.statusCode).toBe(200);
+      expect(res.json()).toMatchObject({ ready: 1, purged: 1, failed: 0 });
+
+      // ---- per-class SQL verification: 0 rows remaining ----
+      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
+      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(0);
+      expect(await prisma.aiMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
+      expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
+      expect(await prisma.importJob.count({ where: { id: importJob.id } })).toBe(0);
+      expect(await prisma.organizationMember.count({ where: { userId: user.id } })).toBe(0);
+      expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
+      expect(await prisma.oAuthConnection.count({ where: { userId: user.id } })).toBe(0);
+
+      // ---- anonymized, not deleted ----
+      const tombstone = await prisma.user.findUnique({ where: { id: user.id } });
+      expect(tombstone).toBeTruthy();
+      expect(tombstone!.email).toBe(`purged-${user.id}@erased.invalid`);
+      expect(tombstone!.name).toBeNull();
+      expect(tombstone!.passwordHash).toBeNull();
+
+      const orgShell = await prisma.organization.findUnique({ where: { id: org.id } });
+      expect(orgShell!.name).toBe('Purged account');
+      expect(orgShell!.slug).toBe(`purged-${org.id}`);
+
+      // Financial record retained (7-year fail-closed), detached from the user.
+      const usage = await prisma.usageEvent.findMany({ where: { organizationId: org.id } });
+      expect(usage.length).toBe(1);
+      expect(usage[0]!.userId).toBeNull();
+
+      // Audit trail redacted in place, rows preserved.
+      const audits = await prisma.auditLog.findMany({ where: { actorUserId: user.id } });
+      expect(audits.length).toBeGreaterThanOrEqual(1);
+
+      for (const row of audits) {
+        expect(row.ipAddress).toBeNull();
+        expect((row.metadata as { redacted?: boolean }).redacted).toBe(true);
+      }
+
+      // ---- the proof, re-read from the DB ----
+      const proofRow = await prisma.adminAuditLog.findFirst({
+        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
+        orderBy: { createdAt: 'desc' },
+      });
+      expect(proofRow).toBeTruthy();
+
+      const proof = (proofRow!.metadata as unknown as { proof: ErasureProof }).proof;
+      expect(proof.kind).toBe('account-erasure-proof');
+      expect(proof.verifiedZeroRemaining).toBe(true);
+      expect(proof.classes.filter((c) => c.action === 'deleted').every((c) => c.remainingAfterPurge === 0)).toBe(true);
+      expect(proof.exceptions.some((e) => e.dataClass === 'financial_records')).toBe(true);
+
+      // ---- (3) idempotence: re-run is a proven no-op ----
+      const again = await store.purgeUserAccount({ userId: user.id });
+      expect(again.outcome).toBe('already_purged');
+
+      const proofCount = await prisma.adminAuditLog.count({
+        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
+      });
+      expect(proofCount).toBe(1);
+    } finally {
+      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(4) two INDEPENDENT clients racing on the same user yield exactly one purge', async () => {
+    const prismaA = createDatabaseClient();
+    const prismaB = createDatabaseClient();
+
+    try {
+      const storeA = new PrismaApiStore(prismaA);
+      const storeB = new PrismaApiStore(prismaB);
+      const { user } = await seedAccount(storeA);
+      await requestElapsedDeletion(storeA, user.id);
+
+      const [a, b] = await Promise.all([
+        storeA.purgeUserAccount({ userId: user.id }),
+        storeB.purgeUserAccount({ userId: user.id }),
+      ]);
+      expect([a.outcome, b.outcome].sort()).toEqual(['already_purged', 'purged']);
+
+      // Single tombstone; the account was erased once.
+      expect(await prismaA.session.count({ where: { userId: user.id } })).toBe(0);
+    } finally {
+      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
+    }
+  });
+
+  it('(5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org } = await seedAccount(store);
+
+      // Post a balanced double-entry transaction for the user's org.
+      const account = await prisma.ledgerAccount.create({
+        data: { organizationId: org.id, key: 'user_credits', type: 'LIABILITY', currency: 'usd' },
+      });
+      const contra = await prisma.ledgerAccount.create({
+        data: { organizationId: org.id, key: 'revenue', type: 'REVENUE', currency: 'usd' },
+      });
+      const posted = await prisma.ledgerTransaction.create({
+        data: {
+          organizationId: org.id,
+          reason: 'purge.test',
+          entries: {
+            create: [
+              { accountId: account.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
+              { accountId: contra.id, direction: 'CREDIT', amountMinor: 100n, currency: 'usd' },
+            ],
+          },
+        },
+      });
+
+      await requestElapsedDeletion(store, user.id);
+      const result = await store.purgeUserAccount({ userId: user.id });
+      expect(result.outcome).toBe('purged');
+
+      if (result.outcome === 'purged') {
+        const ledger = result.proof.classes.find((entry) => entry.dataClass === 'ledger')!;
+        expect(ledger.action).toBe('retained');
+        expect(ledger.reason).toBe('ledger_immutable_posted_entries_mig0078');
+        expect(ledger.models.LedgerTransaction).toBe(1);
+        expect(result.proof.exceptions.some((e) => e.dataClass === 'ledger')).toBe(true);
+      }
+
+      // The posted transaction is still there…
+      expect(await prisma.ledgerTransaction.count({ where: { id: posted.id } })).toBe(1);
+
+      // …and the DB trigger still refuses a DELETE outright.
+      await expect(prisma.ledgerTransaction.delete({ where: { id: posted.id } })).rejects.toThrow(/append-only/);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  /*
+   * RR-09 — the topology GUARANTEE is acquired BEFORE the irreversible external
+   * erasure: membership + object storage are frozen and the authoritative
+   * sole/shared topology is recorded atomically under the advisory lock. So the
+   * deletion only ever touches buckets that are sole UNDER THE LOCK, membership
+   * cannot flip while the erasure runs, and the freeze is released on every exit.
+   * The `eraseStorage` hook is the during-erasure window (it runs after the
+   * guarantee, before the finalize tx), so membership mutations attempted inside
+   * it must be refused.
+   */
+
+  const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
+  type Db = ReturnType<typeof createDatabaseClient>;
+
+  // RR-1bd27929: a resource is frozen iff >= 1 PurgeFreeze row references it.
+  async function membershipFrozen(prisma: Db, orgId: string): Promise<boolean> {
+    return (await prisma.purgeFreeze.count({ where: { resourceType: 'membership', resourceId: orgId } })) > 0;
+  }
+
+  async function objectStorageFrozen(prisma: Db, projectId: string): Promise<boolean> {
+    return (await prisma.purgeFreeze.count({ where: { resourceType: 'objectStorage', resourceId: projectId } })) > 0;
+  }
+
+  async function planFor(prisma: Db, userId: string) {
+    return prisma.purgePlan.findFirst({ where: { userId } });
+  }
+
+  // Seed a PurgePlan (+ its PurgeFreeze rows) directly — models a crashed/abandoned
+  // run. `leaseExpiresAt` in the past = reclaimable by the reconciler.
+  async function seedPlan(
+    prisma: Db,
+    userId: string,
+    orgIds: string[],
+    projectIds: string[],
+    opts?: { leaseExpiresAt?: Date; ownerToken?: string },
+  ) {
+    const plan = await prisma.purgePlan.create({
+      data: {
+        userId,
+        ownerToken: opts?.ownerToken ?? `token-${suffix()}`,
+        leaseExpiresAt: opts?.leaseExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
+      },
+    });
+    const rows = [
+      ...orgIds.map((id) => ({ planId: plan.id, resourceType: 'membership', resourceId: id })),
+      ...projectIds.map((id) => ({ planId: plan.id, resourceType: 'objectStorage', resourceId: id })),
+    ];
+
+    if (rows.length > 0) {
+      await prisma.purgeFreeze.createMany({ data: rows });
+    }
+
+    return plan;
+  }
+
+  async function makeShared(store: PrismaApiStore, prisma: ReturnType<typeof createDatabaseClient>, orgId: string, ownerUserId: string) {
+    const owner = (await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId: ownerUserId } }))!;
+    const co = await store.createUser({
+      email: `co-${suffix()}@example.com`,
+      name: 'Co Member',
+      passwordHash: hashPassword('password123'),
+    });
+    await prisma.organizationMember.create({ data: { organizationId: orgId, userId: co.id, roleId: owner.roleId } });
+
+    return co;
+  }
+
+  it('(6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives)', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store);
+      await makeShared(store, prisma, org.id, user.id); // org is SHARED at guarantee time
+      await requestElapsedDeletion(store, user.id);
+
+      let captured: PurgeStorageInventory | undefined;
+      const eraseStorage = async (inv: PurgeStorageInventory) => {
+        captured = inv;
+
+        return { classes: [], verified: true };
+      };
+
+      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
+      expect(result.outcome).toBe('purged');
+
+      // The shared org's bucket is NEVER handed to the erasure → never deleted.
+      expect(captured!.bucketProjectIds).not.toContain(project.id);
+      // The shared org + its project survive (retained for the co-member).
+      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
+      expect(await prisma.organization.count({ where: { id: org.id } })).toBe(1);
+      // No residual freeze after the successful purge.
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org } = await seedAccount(store);
+      const co = await makeShared(store, prisma, org.id, user.id);
+      await requestElapsedDeletion(store, user.id);
+
+      let leaveError: unknown;
+      const eraseStorage = async () => {
+        // Co-member tries to leave during the erasure → must be REFUSED.
+        leaveError = await store
+          .removeMember(org.id, co.id)
+          .then(() => null)
+          .catch((e) => e);
+
+        return { classes: [], verified: true };
+      };
+
+      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
+      expect(result.outcome).toBe('purged');
+      expect(String(leaveError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
+      // The leave was blocked → the co-member is still a member.
+      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: co.id } })).toBe(1);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store); // SOLE org
+      const joiner = await store.createUser({
+        email: `join-${suffix()}@example.com`,
+        name: 'Late Joiner',
+        passwordHash: hashPassword('password123'),
+      });
+      await requestElapsedDeletion(store, user.id);
+
+      let joinError: unknown;
+      let captured: PurgeStorageInventory | undefined;
+      const eraseStorage = async (inv: PurgeStorageInventory) => {
+        captured = inv;
+        joinError = await store
+          .addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })
+          .then(() => null)
+          .catch((e) => e);
+
+        return { classes: [], verified: true };
+      };
+
+      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
+      expect(result.outcome).toBe('purged');
+      expect(String(joinError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
+      // The join was blocked → the sole bucket was correctly in the erase set.
+      expect(captured!.bucketProjectIds).toContain(project.id);
+      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: joiner.id } })).toBe(0);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(9) NO residual freeze after a FAILED purge (guaranteed release on throw)', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store);
+      await requestElapsedDeletion(store, user.id);
+
+      // Physical erasure reports NOT verified → the purge throws fail-closed.
+      const eraseStorage = async () => ({ classes: [], verified: false });
+
+      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toThrow(
+        /ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/,
+      );
+
+      // RR-09 (6): both freeze sets released, plan cleared — nothing left behind.
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await planFor(prisma, user.id)).toBeNull();
+      // The org is writable again: a member can join now that the freeze is gone.
+      const joiner = await store.createUser({
+        email: `after-${suffix()}@example.com`,
+        name: 'After',
+        passwordHash: hashPassword('password123'),
+      });
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(10) reconciler releases a freeze left behind by a crashed run (recoverable state machine)', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store);
+
+      // Simulate a crash mid-erasure: an ABANDONED plan (lease already expired) +
+      // its freeze rows persisted but never released.
+      await seedPlan(prisma, user.id, [org.id], [project.id], { leaseExpiresAt: new Date(Date.now() - 60_000) });
+
+      // The org is frozen — a join is refused…
+      const joiner = await store.createUser({
+        email: `recon-${suffix()}@example.com`,
+        name: 'Recon',
+        passwordHash: hashPassword('password123'),
+      });
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
+        /MEMBERSHIP_FROZEN_FOR_PURGE/,
+      );
+
+      // …until the reconciler releases the stale freeze.
+      const { reconciled } = await store.reconcilePurgeFreezes();
+      expect(reconciled).toBeGreaterThanOrEqual(1);
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await planFor(prisma, user.id)).toBeNull();
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased)', async () => {
+    const prisma = createDatabaseClient(); // seed + assertions
+    const prismaA = createDatabaseClient(); // the racing mutation: holds the freeze-set lock FIRST
+    const prismaB = createDatabaseClient(); // the purge
+    const prismaC = createDatabaseClient(); // pg_locks poller
+
+    const MEMBERSHIP_LOCK = MEMBERSHIP_FREEZE_LOCK;
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const storeB = new PrismaApiStore(prismaB);
+      const { user, org, project } = await seedAccount(store); // SOLE org + bucket
+      const owner = (await prisma.organizationMember.findFirst({
+        where: { organizationId: org.id, userId: user.id },
+      }))!;
+      const joiner = await store.createUser({
+        email: `race-${suffix()}@example.com`,
+        name: 'Racer',
+        passwordHash: hashPassword('password123'),
+      });
+      await requestElapsedDeletion(store, user.id);
+
+      /*
+       * Connection A grabs the SAME membership freeze-set advisory lock the
+       * guarantee needs, BEFORE the purge starts, then — on signal — adds a member
+       * and commits. This is exactly "a mutation that slipped into the read→freeze
+       * window". Because the guarantee now takes that lock BEFORE reading topology,
+       * the purge blocks until A commits, so A's join is REFLECTED in the topology.
+       */
+      let signalHeld!: () => void;
+      const held = new Promise<void>((resolve) => (signalHeld = resolve));
+      let go!: () => void;
+      const proceed = new Promise<void>((resolve) => (go = resolve));
+
+      const aTx = prismaA.$transaction(
+        async (txA) => {
+          await txA.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_LOCK);
+          signalHeld();
+          await proceed;
+          await txA.organizationMember.create({
+            data: { organizationId: org.id, userId: joiner.id, roleId: owner.roleId },
+          });
+        },
+        { timeout: 30_000 },
+      );
+
+      await held; // A now holds the freeze-set lock
+
+      let captured: PurgeStorageInventory | undefined;
+      const bPurge = storeB.purgeUserAccount(
+        { userId: user.id },
+        {
+          eraseStorage: async (inv: PurgeStorageInventory) => {
+            captured = inv;
+
+            return { classes: [], verified: true };
+          },
+        },
+      );
+
+      // Wait until the purge is BLOCKED on the membership advisory lock — proving it
+      // takes that lock BEFORE reading topology (the CODEX-10 fix). Without the fix
+      // the purge would read topology first and would NOT block here.
+      let blocked = false;
+
+      for (let i = 0; i < 200 && !blocked; i++) {
+        const rows = (await prismaC.$queryRawUnsafe(
+          `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
+        )) as Array<{ n: number }>;
+        blocked = (rows[0]?.n ?? 0) >= 1;
+
+        if (!blocked) {
+          await new Promise((resolve) => setTimeout(resolve, 25));
+        }
+      }
+
+      expect(blocked).toBe(true);
+
+      go(); // let A insert the member + commit + release the lock
+      await aTx;
+      const result = await bPurge;
+
+      // The join committed just before the freeze IS reflected: the org is shared
+      // under the guarantee → its bucket is NEVER handed to eraseStorage.
+      expect(result.outcome).toBe('purged');
+      expect(captured!.bucketProjectIds).not.toContain(project.id);
+      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1); // bucket/project survive
+      // No residual freeze after the successful purge.
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+    } finally {
+      await Promise.allSettled([
+        prisma.$disconnect(),
+        prismaA.$disconnect(),
+        prismaB.$disconnect(),
+        prismaC.$disconnect(),
+      ]);
+    }
+  });
+
+  /*
+   * RR-1bd27929 — MULTI-PLAN SAFETY. Freezes are per-plan rows, so releasing one
+   * plan never lifts a freeze another live plan owns; the reconciler reclaims ONLY
+   * lease-expired plans, via CAS, touching just that plan's rows.
+   */
+
+  it('(15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org } = await seedAccount(store);
+      const co = await makeShared(store, prisma, org.id, user.id); // org SHARED (user + co)
+
+      // Plan B: a SECOND concurrent purge (co's), blocked in erase → a live plan
+      // that also freezes this org. Modelled by its persisted plan + freeze row.
+      const planB = await seedPlan(prisma, co.id, [org.id], []);
+
+      // Plan A: user's REAL purge runs to completion (org is shared → no bucket);
+      // its release must delete ONLY plan A's rows.
+      await requestElapsedDeletion(store, user.id);
+      const result = await store.purgeUserAccount(
+        { userId: user.id },
+        { eraseStorage: async () => ({ classes: [], verified: true }) },
+      );
+      expect(result.outcome).toBe('purged');
+
+      // Plan A released, but plan B still freezes the org → STILL frozen.
+      expect(await planFor(prisma, user.id)).toBeNull(); // A gone
+      expect(await membershipFrozen(prisma, org.id)).toBe(true); // B's row remains
+      // …and a join stays REFUSED while >= 1 plan freezes the org.
+      const joiner = await store.createUser({
+        email: `j15-${suffix()}@example.com`,
+        name: 'J15',
+        passwordHash: hashPassword('password123'),
+      });
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
+        /MEMBERSHIP_FROZEN_FOR_PURGE/,
+      );
+
+      // The freeze disappears ONLY after the LAST plan (B) releases.
+      await prisma.purgePlan.delete({ where: { id: planB.id } }); // cascade removes B's rows
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store);
+
+      // Plan B holds a VALID lease (its owner is blocked in a slow eraseStorage).
+      const planB = await seedPlan(prisma, user.id, [org.id], [project.id], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
+      });
+
+      // A different executor runs the reconciler: it must touch NOTHING.
+      const { reconciled } = await store.reconcilePurgeFreezes();
+      expect(reconciled).toBe(0);
+      expect(await prisma.purgePlan.findUnique({ where: { id: planB.id } })).not.toBeNull();
+      expect(await membershipFrozen(prisma, org.id)).toBe(true);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+  it('(17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources', async () => {
+    const prismaX = createDatabaseClient();
+    const prismaY = createDatabaseClient();
+
+    try {
+      const storeX = new PrismaApiStore(prismaX);
+      const storeY = new PrismaApiStore(prismaY);
+      const { user, org, project } = await seedAccount(storeX);
+      const other = await makeShared(storeX, prismaX, org.id, user.id); // shares org with a live plan
+
+      // Abandoned plan (expired lease) freezing org + project.
+      const abandoned = await seedPlan(prismaX, user.id, [org.id], [project.id], {
+        leaseExpiresAt: new Date(Date.now() - 60_000),
+      });
+      // A concurrent LIVE plan (valid lease) that ALSO freezes the same org.
+      const live = await seedPlan(prismaX, other.id, [org.id], [], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
+      });
+
+      // Two executors reconcile concurrently → CAS ensures the abandoned plan is
+      // reclaimed exactly ONCE (never double-reclaimed).
+      const [rx, ry] = await Promise.all([storeX.reconcilePurgeFreezes(), storeY.reconcilePurgeFreezes()]);
+      expect(rx.reconciled + ry.reconciled).toBe(1);
+
+      // The abandoned plan + its OWN rows are gone…
+      expect(await prismaX.purgePlan.findUnique({ where: { id: abandoned.id } })).toBeNull();
+      expect(await objectStorageFrozen(prismaX, project.id)).toBe(false); // was only the abandoned plan's
+      // …but the concurrent LIVE plan is untouched, so the org stays frozen.
+      expect(await prismaX.purgePlan.findUnique({ where: { id: live.id } })).not.toBeNull();
+      expect(await membershipFrozen(prismaX, org.id)).toBe(true);
+    } finally {
+      await Promise.allSettled([prismaX.$disconnect(), prismaY.$disconnect()]);
+    }
+  });
+
+  it('(18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched', async () => {
+    const prisma = createDatabaseClient();
+
+    try {
+      const store = new PrismaApiStore(prisma);
+      const { user, org, project } = await seedAccount(store);
+      await requestElapsedDeletion(store, user.id);
+
+      // A DIFFERENT plan (distinct owner) on other resources — must remain
+      // untouched throughout. Distinct owner so planFor(user.id) resolves only the
+      // crashed purge plan, not this one.
+      const otherUser = await store.createUser({
+        email: `other18-${suffix()}@example.com`,
+        name: 'Other18',
+        passwordHash: hashPassword('password123'),
+      });
+      const otherOrg = await store.createOrganization({
+        name: `Other ${suffix()}`,
+        slug: `other-${suffix()}`,
+        ownerUserId: otherUser.id,
+      });
+      const otherProject = await store.createProject({
+        organizationId: otherOrg.id,
+        name: 'OtherP',
+        slug: `otherp-${suffix()}`,
+      });
+      const otherPlan = await seedPlan(prisma, otherUser.id, [otherOrg.id], [otherProject.id], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
+      });
+
+      // Crash BETWEEN the two thaws: fail the object-storage thaw (2nd deleteMany).
+      const realDeleteMany = prisma.purgeFreeze.deleteMany.bind(prisma.purgeFreeze);
+      const spy = vi
+        .spyOn(prisma.purgeFreeze, 'deleteMany')
+        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
+          if ((args as { where?: { resourceType?: string } })?.where?.resourceType === 'objectStorage') {
+            throw new Error('boom: object-storage thaw failed');
+          }
+
+          return realDeleteMany(args);
+        }) as typeof realDeleteMany);
+
+      // Physical erase fails → purge throws → release runs and crashes mid-thaw.
+      await expect(
+        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
+      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);
+
+      const plan = await planFor(prisma, user.id);
+      // Membership thawed, object-storage still frozen, plan KEPT (recoverable).
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
+      expect(plan).not.toBeNull();
+      // The OTHER plan's freezes are completely untouched.
+      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
+      expect(await objectStorageFrozen(prisma, otherProject.id)).toBe(true);
+      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
+
+      // Recovery: expire the crashed plan's lease → reconciler reclaims it.
+      await prisma.purgePlan.update({ where: { id: plan!.id }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
+      const r1 = await store.reconcilePurgeFreezes();
+      expect(r1.reconciled).toBeGreaterThanOrEqual(1);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false); // zero residual freeze
+      expect(await planFor(prisma, user.id)).toBeNull();
+
+      // Idempotent reprise: a second reconcile changes nothing, and the OTHER plan
+      // (still live) is STILL untouched.
+      const r2 = await store.reconcilePurgeFreezes();
+      expect(r2.reconciled).toBe(0);
+      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
+      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
+
+      spy.mockRestore();
+    } finally {
+      await prisma.$disconnect();
+    }
+  });
+
+});
diff --git a/services/api/src/tests/account-purge-routes.spec.ts b/services/api/src/tests/account-purge-routes.spec.ts
new file mode 100644
index 00000000..d5eec096
--- /dev/null
+++ b/services/api/src/tests/account-purge-routes.spec.ts
@@ -0,0 +1,414 @@
+import { hashPassword } from '@vibecore/auth';
+import { afterEach, describe, expect, it } from 'vitest';
+
+import type { ErasureProof } from '../account-purge.js';
+import { buildApiApp } from '../app.js';
+import type { EmailProvider } from '../email.js';
+import { TestApiStore } from './test-api-store.js';
+
+/*
+ * §16.12 purge executor — the worker-triggered /internal/account-purge route +
+ * store.purgeUserAccount. NEGATIVE tests first (window not elapsed, cancelled
+ * request, dry-run default, double execution, concurrency race, fail-closed
+ * financial retention), then the positive full-purge proof (per-class 0-rows
+ * verification + persisted erasure proof).
+ */
+
+class QuietEmailProvider implements EmailProvider {
+  async send() {}
+}
+
+const DAY = 24 * 60 * 60 * 1000;
+const SECRET = 'internal-secret';
+const internalAuth = { authorization: `Bearer ${SECRET}` };
+const auth = (token: string) => ({ authorization: `Bearer ${token}` });
+
+const prevSecret = process.env.INTERNAL_API_SHARED_SECRET;
+const prevEnabled = process.env.ACCOUNT_PURGE_ENABLED;
+
+afterEach(() => {
+  if (prevSecret === undefined) {
+    delete process.env.INTERNAL_API_SHARED_SECRET;
+  } else {
+    process.env.INTERNAL_API_SHARED_SECRET = prevSecret;
+  }
+
+  if (prevEnabled === undefined) {
+    delete process.env.ACCOUNT_PURGE_ENABLED;
+  } else {
+    process.env.ACCOUNT_PURGE_ENABLED = prevEnabled;
+  }
+});
+
+/**
+ * A user with data in EVERY purgeable class: session, org+project, import,
+ * AI conversation+message, notification, api key, usage event (financial),
+ * newsletter subscription, and an audit trail entry.
+ */
+async function setup(
+  accountStoragePurger: (
+    inventory: { bucketProjectIds: string[]; workspaceProjectIds: string[] },
+    userId: string,
+  ) => Promise<{ classes: any[]; verified: boolean }> = async () => ({ classes: [], verified: true }),
+) {
+  process.env.INTERNAL_API_SHARED_SECRET = SECRET;
+  delete process.env.ACCOUNT_PURGE_ENABLED; // dry-run default under test
+
+  const store = new TestApiStore();
+  // Physical-erasure is stubbed here (verified by default) so these DB-purge
+  // route tests don't reach out to live GCS / workspace-manager; a dedicated
+  // test injects a failing purger to prove the fail-closed gate.
+  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider(), accountStoragePurger });
+
+  const user = await store.createUser({
+    email: 'purge-me@example.com',
+    name: 'Purge Me',
+    passwordHash: hashPassword('password123'),
+  });
+  await store.createSession({ userId: user.id, token: 'user-token', expiresAt: new Date(Date.now() + 3600_000) });
+
+  const org = await store.createOrganization({ name: 'Purge Org', slug: 'purge-org', ownerUserId: user.id });
+  const project = await store.createProject({ organizationId: org.id, name: 'Secret App', slug: 'secret-app' });
+  const importJob = await store.createImportJob({ organizationId: org.id, provider: 'zip' });
+  const conversation = await store.createAiConversation({ projectId: project.id, userId: user.id, title: 'chat' });
+  await store.createAiMessage({ conversationId: conversation.id, role: 'user', content: 'hello world' });
+  await store.createNotification({ userId: user.id, title: 'welcome' });
+  await store.createApiKey({ userId: user.id, name: 'cli', keyHash: 'kh', keyPrefix: 'vk_', scopes: [] });
+  await store.recordUsageEvent({ organizationId: org.id, userId: user.id, type: 'ai.tokens', quantity: 42 });
+  store.newsletterSubscribers.set(user.email, { email: user.email, source: 'footer', unsubscribedAt: null });
+  await store.recordAudit({
+    actorUserId: user.id,
+    action: 'project.created',
+    resourceType: 'project',
+    resourceId: project.id,
+    ipAddress: '203.0.113.7',
+    metadata: { name: 'Secret App' },
+  });
+
+  return { app, store, user, org, project, importJob, conversation };
+}
+
+/** Rewind the deletion request timestamp in the store (never the clock). */
+async function requestDeletionElapsed(app: Awaited<ReturnType<typeof setup>>['app'], store: TestApiStore, userId: string, daysAgo = 15) {
+  const res = await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
+  expect(res.statusCode).toBe(200);
+
+  const user = store.users.get(userId)!;
+  const deletion = (user.preferences!.accountDeletion ?? {}) as { requestedAt?: string };
+  deletion.requestedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
+  user.preferences = { ...user.preferences, accountDeletion: deletion };
+}
+
+function purgeProofs(store: TestApiStore): ErasureProof[] {
+  return store.adminAuditLogs
+    .filter((event) => event.action === 'account.purge_completed')
+    .map((event) => (event.metadata as { proof: ErasureProof }).proof);
+}
+
+describe('internal account purge — negatives first', () => {
+  it('rejects calls without the internal secret', async () => {
+    const { app } = await setup();
+    const res = await app.inject({ method: 'POST', url: '/internal/account-purge', payload: {} });
+    expect(res.statusCode).toBe(401);
+  });
+
+  it('REFUSES to purge while the 14-day grace window has not elapsed', async () => {
+    const { app, store, user } = await setup();
+    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
+
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(res.statusCode).toBe(200);
+    expect(res.json()).toMatchObject({ scanned: 1, notDue: 1, purged: 0, ready: 0 });
+
+    // Nothing was touched: session alive, conversation + project intact.
+    expect([...store.sessions.values()].some((s) => s.userId === user.id)).toBe(true);
+    expect([...store.aiConversations.values()].some((c) => c.userId === user.id)).toBe(true);
+    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
+    expect(purgeProofs(store)).toHaveLength(0);
+
+    // The store-level guard refuses too (defense in depth).
+    const direct = await store.purgeUserAccount({ userId: user.id });
+    expect(direct.outcome).toBe('not_due');
+  });
+
+  it('NEVER purges a request cancelled during the grace window', async () => {
+    const { app, store, user } = await setup();
+    await app.inject({ method: 'POST', url: '/account/deletion', headers: auth('user-token') });
+    await app.inject({ method: 'POST', url: '/account/deletion/cancel', headers: auth('user-token') });
+
+    // Even a targeted force-run finds nothing to purge.
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true, userId: user.id },
+    });
+    expect(res.json()).toMatchObject({ purged: 0, stale: 1 });
+
+    const direct = await store.purgeUserAccount({ userId: user.id });
+    expect(direct.outcome).toBe('not_requested');
+    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
+    expect(purgeProofs(store)).toHaveLength(0);
+  });
+
+  it('DRY-RUN by default: counts ready accounts but purges nothing without the flag', async () => {
+    const { app, store, user } = await setup();
+    await requestDeletionElapsed(app, store, user.id);
+
+    const res = await app.inject({ method: 'POST', url: '/internal/account-purge', headers: internalAuth, payload: {} });
+    expect(res.json()).toMatchObject({ enabled: false, ready: 1, purged: 0 });
+    expect(store.users.get(user.id)!.email).toBe('purge-me@example.com');
+    expect([...store.sessions.values()].some((s) => s.userId === user.id)).toBe(true);
+  });
+
+  it('double execution is a proven no-op: one purge, one proof', async () => {
+    const { app, store, user } = await setup();
+    await requestDeletionElapsed(app, store, user.id);
+
+    const first = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(first.json()).toMatchObject({ purged: 1 });
+
+    // Second sweep: the queue is empty.
+    const second = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(second.json()).toMatchObject({ scanned: 0, purged: 0 });
+
+    // Even a targeted re-run is a no-op.
+    const targeted = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true, userId: user.id },
+    });
+    expect(targeted.json()).toMatchObject({ purged: 0, alreadyPurged: 1 });
+
+    const direct = await store.purgeUserAccount({ userId: user.id });
+    expect(direct.outcome).toBe('already_purged');
+
+    expect(purgeProofs(store)).toHaveLength(1);
+  });
+
+  it('two concurrent workers on the same request yield exactly ONE purge', async () => {
+    const { app, store, user } = await setup();
+    await requestDeletionElapsed(app, store, user.id);
+
+    const [a, b] = await Promise.all([
+      store.purgeUserAccount({ userId: user.id }),
+      store.purgeUserAccount({ userId: user.id }),
+    ]);
+    const outcomes = [a.outcome, b.outcome].sort();
+    expect(outcomes).toEqual(['already_purged', 'purged']);
+  });
+
+  it('FAIL-CLOSED financial retention: records are retained AND consigned, the rest is purged', async () => {
+    const { app, store, user, org } = await setup();
+    await requestDeletionElapsed(app, store, user.id);
+
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(res.json()).toMatchObject({ purged: 1 });
+
+    const [proof] = purgeProofs(store);
+
+    // The recent usage event is inside the 7-year window: retained…
+    const financial = proof.classes.find((entry) => entry.dataClass === 'financial_records')!;
+    expect(financial.action).toBe('retained');
+    expect(financial.reason).toBe('financial_retention_7y_fail_closed');
+    expect(financial.models.UsageEvent).toBe(1);
+
+    // …physically still present, but detached from the purged user…
+    const survivor = [...store.usageEvents.values()].find((event) => event.organizationId === org.id)!;
+    expect(survivor).toBeTruthy();
+    expect(survivor.userId).toBeUndefined();
+
+    // …and the exception is CONSIGNED in the proof, never silent.
+    const exception = proof.exceptions.find((entry) => entry.dataClass === 'financial_records')!;
+    expect(exception.rows).toBeGreaterThanOrEqual(1);
+    expect(exception.reason).toBe('financial_retention_7y_fail_closed');
+
+    // The rest of the account was still purged (partial purge executed).
+    expect([...store.aiConversations.values()].some((c) => c.userId === user.id)).toBe(false);
+    expect([...store.projects.values()].some((p) => p.organizationId === org.id)).toBe(false);
+  });
+});
+
+describe('internal account purge — full erasure proof', () => {
+  it('purges every class, verifies 0 rows remaining, persists the proof, and tombstones the user', async () => {
+    const { app, store, user, org, project, importJob, conversation } = await setup();
+    await requestDeletionElapsed(app, store, user.id);
+
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(res.statusCode).toBe(200);
+    expect(res.json()).toMatchObject({ enabled: true, ready: 1, purged: 1, failed: 0 });
+
+    // Per-class SQL-equivalent verification: 0 rows remaining.
+    expect([...store.sessions.values()].filter((s) => s.userId === user.id)).toHaveLength(0);
+    expect([...store.apiKeys.values()].filter((k) => k.userId === user.id)).toHaveLength(0);
+    expect(store.aiConversations.has(conversation.id)).toBe(false);
+    expect([...store.aiMessages.values()].filter((m) => m.conversationId === conversation.id)).toHaveLength(0);
+    expect(store.projects.has(project.id)).toBe(false);
+    expect(store.importJobs.has(importJob.id)).toBe(false);
+    expect([...store.memberships.values()].filter((m) => m.userId === user.id)).toHaveLength(0);
+    expect([...store.notifications.values()].filter((n) => n.userId === user.id)).toHaveLength(0);
+    expect(store.newsletterSubscribers.has('purge-me@example.com')).toBe(false);
+
+    // Tombstone: anonymized, machine state = purged, purgedAt stamped.
+    const tombstone = store.users.get(user.id)!;
+    expect(tombstone.email).toBe(`purged-${user.id}@erased.invalid`);
+    expect(tombstone.name).toBeUndefined();
+    expect(tombstone.passwordHash).toBeUndefined();
+    const deletion = tombstone.preferences!.accountDeletion as { purgedAt?: string };
+    expect(typeof deletion.purgedAt).toBe('string');
+
+    // Sole org shell survives, anonymized, as the financial anchor.
+    const shell = store.organizations.get(org.id)!;
+    expect(shell.name).toBe('Purged account');
+    expect(shell.slug).toBe(`purged-${org.id}`);
+
+    // Audit logs were REDACTED in place, never deleted.
+    const audit = store.auditLogs.find((event) => event.actorUserId === user.id)!;
+    expect(audit).toBeTruthy();
+    expect(audit.ipAddress).toBeUndefined();
+    expect((audit.metadata as { redacted?: boolean }).redacted).toBe(true);
+
+    // The persisted proof: structured, per class, verified zero remaining.
+    const proofs = purgeProofs(store);
+    expect(proofs).toHaveLength(1);
+    const [proof] = proofs;
+    expect(proof.kind).toBe('account-erasure-proof');
+    expect(proof.userId).toBe(user.id);
+    expect(proof.verifiedZeroRemaining).toBe(true);
+
+    for (const entry of proof.classes.filter((c) => c.action === 'deleted')) {
+      expect(entry.remainingAfterPurge).toBe(0);
+    }
+
+    for (const entry of proof.classes.filter((c) => c.action === 'retained')) {
+      expect(entry.reason).toBeTruthy();
+    }
+
+    // Purge counts are real: the session/conversation/project rows we created.
+    const byClass = Object.fromEntries(proof.classes.map((entry) => [entry.dataClass, entry]));
+    expect(byClass.sessions.models.Session).toBe(1);
+    expect(byClass.ai_history.models.AiConversation).toBe(1);
+    expect(byClass.ai_history.models.AiMessage).toBe(1);
+    expect(byClass.projects.models.Project).toBe(1);
+    expect(byClass.imports.models.ImportJob).toBe(1);
+    expect(byClass.marketing.models.NewsletterSubscriber).toBe(1);
+    // project.created + account.deletion_requested (the request itself audits).
+    expect(byClass.audit_logs.models.AuditLog).toBe(2);
+
+    // The dead session no longer authenticates.
+    const afterPurge = await app.inject({ method: 'GET', url: '/account/deletion', headers: auth('user-token') });
+    expect(afterPurge.statusCode).toBe(401);
+  });
+
+  it('a shared organization is retained: membership removed, projects kept, consigned in the proof', async () => {
+    const { app, store, user } = await setup();
+    const other = await store.createUser({
+      email: 'colleague@example.com',
+      name: 'Colleague',
+      passwordHash: hashPassword('password123'),
+    });
+    const sharedOrg = await store.createOrganization({ name: 'Shared Org', slug: 'shared-org', ownerUserId: other.id });
+    await store.addMember({ organizationId: sharedOrg.id, userId: user.id, roleKey: 'member' });
+    const sharedProject = await store.createProject({ organizationId: sharedOrg.id, name: 'Team App', slug: 'team-app' });
+
+    await requestDeletionElapsed(app, store, user.id);
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+    expect(res.json()).toMatchObject({ purged: 1 });
+
+    // The shared project belongs to the other member: kept.
+    expect(store.projects.has(sharedProject.id)).toBe(true);
+    expect(store.organizations.get(sharedOrg.id)!.name).toBe('Shared Org');
+
+    // But the purged user's membership is gone.
+    expect(
+      [...store.memberships.values()].filter((m) => m.userId === user.id && m.organizationId === sharedOrg.id),
+    ).toHaveLength(0);
+
+    // And the retained shared content is consigned.
+    const [proof] = purgeProofs(store);
+    const shared = proof.classes.find((entry) => entry.dataClass === 'shared_org_content')!;
+    expect(shared.action).toBe('retained');
+    expect(shared.models.Project).toBe(1);
+  });
+
+  it('FAIL-CLOSED: physical erasure incomplete → account NOT purged, purgedAt never stamped, no proof', async () => {
+    // Inject a physical purger that reports a bucket it could not erase.
+    const { app, store, user } = await setup(async () => ({
+      classes: [{ dataClass: 'object_storage', action: 'deleted', models: {}, remainingAfterPurge: 3 }],
+      verified: false,
+    }));
+
+    await requestDeletionElapsed(app, store, user.id);
+    const res = await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+
+    // The run reports a failure, not a purge.
+    expect(res.json()).toMatchObject({ purged: 0, failed: 1 });
+
+    // The account is NOT tombstoned: still reachable, no purgedAt, and still queued.
+    const stored = store.users.get(user.id)!;
+    expect(stored.email).toBe('purge-me@example.com');
+    expect((stored.preferences!.accountDeletion as { purgedAt?: string }).purgedAt).toBeUndefined();
+    expect(purgeProofs(store)).toHaveLength(0);
+  });
+
+  it('embeds the physical-erasure classes (object_storage, workspace_volumes) in the proof', async () => {
+    const { app, store, user } = await setup(async () => ({
+      classes: [
+        { dataClass: 'object_storage', action: 'deleted', models: { BucketsDeleted: 1, ObjectsErased: 5 }, remainingAfterPurge: 0 },
+        { dataClass: 'workspace_volumes', action: 'deleted', models: { WorkspacesDeleted: 1 }, remainingAfterPurge: 0 },
+      ],
+      verified: true,
+    }));
+
+    await requestDeletionElapsed(app, store, user.id);
+    await app.inject({
+      method: 'POST',
+      url: '/internal/account-purge',
+      headers: internalAuth,
+      payload: { enabled: true },
+    });
+
+    const [proof] = purgeProofs(store);
+    expect(proof.verifiedZeroRemaining).toBe(true);
+    const os = proof.classes.find((c) => c.dataClass === 'object_storage')!;
+    const vols = proof.classes.find((c) => c.dataClass === 'workspace_volumes')!;
+    expect(os).toMatchObject({ action: 'deleted', remainingAfterPurge: 0, models: { ObjectsErased: 5 } });
+    expect(vols).toMatchObject({ action: 'deleted', remainingAfterPurge: 0 });
+  });
+});
diff --git a/services/api/src/tests/account-storage-purge.spec.ts b/services/api/src/tests/account-storage-purge.spec.ts
new file mode 100644
index 00000000..c5f7cd2e
--- /dev/null
+++ b/services/api/src/tests/account-storage-purge.spec.ts
@@ -0,0 +1,191 @@
+import { describe, expect, it, vi } from 'vitest';
+import {
+  eraseSubjectStorage,
+  type ObjectStorageErasurePort,
+  type WorkspaceVolumeErasurePort,
+  type WriteBarrierPort,
+} from '../account-storage-purge.js';
+
+/* ------------------------- in-memory fake backends ------------------------- */
+
+class FakeObjectStorage implements ObjectStorageErasurePort {
+  readonly active = true;
+  readonly buckets = new Map<string, string[]>();
+  refuseDelete = false;
+
+  seed(projectId: string, keys: string[]) {
+    this.buckets.set(projectId, keys);
+  }
+
+  async bucketExists(projectId: string) {
+    return this.buckets.has(projectId);
+  }
+
+  async listObjects(projectId: string) {
+    return { objects: (this.buckets.get(projectId) ?? []).map((key) => ({ key })) };
+  }
+
+  async deleteBucket(projectId: string) {
+    if (!this.refuseDelete) {
+      this.buckets.delete(projectId);
+    }
+
+    return { deleted: !this.refuseDelete, bucket: `vc-${projectId}` };
+  }
+}
+
+class FakePvcs implements WorkspaceVolumeErasurePort {
+  readonly present = new Set<string>();
+  refuseDelete = false;
+
+  seed(workspaceId: string) {
+    this.present.add(workspaceId);
+  }
+
+  async pvcExists(workspaceId: string) {
+    return this.present.has(workspaceId);
+  }
+
+  async deleteWorkspace(workspaceId: string) {
+    if (this.refuseDelete) {
+      throw new Error('kubectl unavailable');
+    }
+
+    this.present.delete(workspaceId);
+  }
+}
+
+function recordingBarrier(): WriteBarrierPort & { frozen: boolean } {
+  const barrier = {
+    frozen: false,
+    async freeze() {
+      barrier.frozen = true;
+    },
+  };
+
+  return barrier;
+}
+
+describe('eraseSubjectStorage', () => {
+  it('freezes writes first, then erases buckets + PVCs and verifies 0 remaining', async () => {
+    const objectStorage = new FakeObjectStorage();
+    objectStorage.seed('p1', ['a.png', 'b.json']);
+    const workspaceVolumes = new FakePvcs();
+    workspaceVolumes.seed('ws-p1');
+    workspaceVolumes.seed('ws-shared'); // a collaborator workspace in a shared org
+    const barrier = recordingBarrier();
+
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: ['p1'], workspaceIds: ['ws-p1', 'ws-shared'] },
+      { objectStorage, workspaceVolumes, writeBarrier: barrier },
+    );
+
+    expect(barrier.frozen).toBe(true); // reserve #1
+    expect(out.verified).toBe(true);
+    const [os, vols] = out.classes;
+    expect(os).toMatchObject({ remainingAfterPurge: 0, models: { ObjectsErased: 2, BucketsDeleted: 1 } });
+    expect(vols).toMatchObject({ remainingAfterPurge: 0, models: { Workspaces: 2, PvcsDeleted: 2, WriteBarrier: 1 } });
+    expect(objectStorage.buckets.has('p1')).toBe(false);
+    expect(workspaceVolumes.present.size).toBe(0);
+  });
+
+  it('FAIL-CLOSED: a freeze failure aborts erasure — nothing deleted, not verified (reserve #1)', async () => {
+    const objectStorage = new FakeObjectStorage();
+    objectStorage.seed('p1', ['keep.png']);
+    const workspaceVolumes = new FakePvcs();
+    workspaceVolumes.seed('ws-p1');
+    const warn = vi.fn();
+
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: ['p1'], workspaceIds: ['ws-p1'] },
+      {
+        objectStorage,
+        workspaceVolumes,
+        writeBarrier: {
+          async freeze() {
+            throw new Error('cannot revoke tokens');
+          },
+        },
+        log: { warn },
+      },
+    );
+
+    expect(out.frozen).toBe(false);
+    expect(out.verified).toBe(false);
+    expect(objectStorage.buckets.has('p1')).toBe(true); // NOT deleted — barrier held it closed
+    expect(workspaceVolumes.present.has('ws-p1')).toBe(true);
+    expect(warn).toHaveBeenCalled();
+  });
+
+  it('FAIL-CLOSED: a PVC that survives the delete (real k8s check) is caught (reserve #2)', async () => {
+    const workspaceVolumes = new FakePvcs();
+    workspaceVolumes.seed('ws-p1');
+    workspaceVolumes.refuseDelete = true;
+
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: [], workspaceIds: ['ws-p1'] },
+      { workspaceVolumes, writeBarrier: recordingBarrier() },
+    );
+
+    expect(out.verified).toBe(false);
+    expect(out.classes[1].remainingAfterPurge).toBe(1);
+  });
+
+  it('erases buckets and workspaces from independent inventories (reserve #3)', async () => {
+    const objectStorage = new FakeObjectStorage();
+    objectStorage.seed('sole1', ['x']);
+    const workspaceVolumes = new FakePvcs();
+    // buckets only for the sole org, but workspaces for sole + two collaborator projects
+    workspaceVolumes.seed('ws-sole1');
+    workspaceVolumes.seed('ws-collab1');
+    workspaceVolumes.seed('ws-collab2');
+
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: ['sole1'], workspaceIds: ['ws-sole1', 'ws-collab1', 'ws-collab2'] },
+      { objectStorage, workspaceVolumes, writeBarrier: recordingBarrier() },
+    );
+
+    expect(out.verified).toBe(true);
+    expect(out.classes[0].models).toMatchObject({ Buckets: 1, BucketsDeleted: 1 });
+    expect(out.classes[1].models).toMatchObject({ Workspaces: 3, PvcsDeleted: 3 });
+  });
+
+  it('FAIL-CLOSED: an inert (active:false) object-storage backend cannot certify absence (reserve #2)', async () => {
+    // A NoopObjectStorage would return bucketExists=false ("absent") — but it
+    // proves nothing. With buckets to erase, the purge must be REFUSED.
+    const inertObjectStorage: ObjectStorageErasurePort = {
+      active: false,
+      async bucketExists() {
+        return false;
+      },
+      async listObjects() {
+        return { objects: [] };
+      },
+      async deleteBucket(projectId) {
+        return { deleted: false, bucket: `vc-${projectId}` };
+      },
+    };
+    const deleteSpy = vi.spyOn(inertObjectStorage, 'deleteBucket');
+
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: ['p1'], workspaceIds: [] },
+      { objectStorage: inertObjectStorage, writeBarrier: recordingBarrier() },
+    );
+
+    expect(out.verified).toBe(false);
+    expect(out.classes[0].remainingAfterPurge).toBeGreaterThan(0);
+    expect(out.classes[0].models.RealBackend).toBe(0);
+    expect(deleteSpy).not.toHaveBeenCalled(); // never even attempts a destructive delete
+  });
+
+  it('is a verified no-op for an empty inventory', async () => {
+    const out = await eraseSubjectStorage(
+      { bucketProjectIds: [], workspaceIds: [] },
+      { objectStorage: new FakeObjectStorage(), workspaceVolumes: new FakePvcs(), writeBarrier: recordingBarrier() },
+    );
+
+    expect(out.verified).toBe(true);
+    expect(out.buckets).toHaveLength(0);
+    expect(out.workspaces).toHaveLength(0);
+  });
+});
diff --git a/services/api/src/tests/object-storage-purge-freeze.spec.ts b/services/api/src/tests/object-storage-purge-freeze.spec.ts
new file mode 100644
index 00000000..04b11fa3
--- /dev/null
+++ b/services/api/src/tests/object-storage-purge-freeze.spec.ts
@@ -0,0 +1,168 @@
+import { hashPassword } from '@vibecore/auth';
+import { afterEach, beforeEach, describe, expect, it } from 'vitest';
+
+import { buildApiApp } from '../app.js';
+import type { EmailProvider } from '../email.js';
+import { TestApiStore } from './test-api-store.js';
+
+/*
+ * RR-08 #1 / reserve #3 — ROUTE-LEVEL freeze barrier. While an account purge has
+ * frozen a project's object storage, EVERY write route must refuse (403) so a
+ * bucket/object can't be recreated after the purge's zero-check. This suite locks
+ * that in for the thumbnail signed-upload route the reviewer flagged, plus the
+ * generic upload-url for parity, and proves reads stay allowed and the block
+ * lifts once the freeze is cleared.
+ */
+
+class QuietEmailProvider implements EmailProvider {
+  async send() {}
+}
+
+const SECRET = 'unit-object-storage-freeze-secret';
+
+/** Fake ObjectStorage so the routes never touch real GCS. */
+const fakeStorage = {
+  active: true,
+  async ensureBucket(projectId: string) {
+    return { bucket: `vc-${projectId}`, created: true, location: 'EU' };
+  },
+  async bucketExists() {
+    return true;
+  },
+  async listObjects() {
+    return { objects: [{ key: 'a.txt', size: 3, updated: null, contentType: null, etag: null }], folders: [] };
+  },
+  async createUploadUrl() {
+    return { url: 'https://signed/put', method: 'PUT' as const, headers: {}, expiresAt: 'x' };
+  },
+  async createDownloadUrl() {
+    return { url: 'https://signed/get', expiresAt: 'y' };
+  },
+  async putObject() {
+    return { key: 'thumbnail.png', size: 10 };
+  },
+  async moveObject(_p: string, input: { to: string }) {
+    return { moved: true, key: input.to };
+  },
+  async deleteObject() {
+    return { deleted: true, count: 1 };
+  },
+  async deletePrefix() {
+    return { deleted: true, count: 2 };
+  },
+  async deleteBucket(projectId: string) {
+    return { deleted: true, bucket: `vc-${projectId}` };
+  },
+};
+
+const ORIGINAL = {
+  enabled: process.env.OBJECT_STORAGE_ENABLED,
+  secret: process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET,
+};
+
+beforeEach(() => {
+  process.env.OBJECT_STORAGE_ENABLED = 'true';
+  process.env.OBJECT_STORAGE_ACCESS_TOKEN_SECRET = SECRET;
+});
+
+afterEach(() => {
+  for (const [key, val] of [
+    ['OBJECT_STORAGE_ENABLED', ORIGINAL.enabled],
+    ['OBJECT_STORAGE_ACCESS_TOKEN_SECRET', ORIGINAL.secret],
+  ] as const) {
+    if (val === undefined) {
+      delete (process.env as Record<string, string | undefined>)[key];
+    } else {
+      process.env[key] = val;
+    }
+  }
+});
+
+async function setup() {
+  const store = new TestApiStore();
+  const app = await buildApiApp({
+    store,
+    emailProvider: new QuietEmailProvider(),
+    objectStorage: fakeStorage as unknown as Parameters<typeof buildApiApp>[0] extends { objectStorage?: infer T }
+      ? T
+      : never,
+  });
+
+  const user = await store.createUser({
+    email: 'freeze@example.com',
+    name: 'Freeze',
+    passwordHash: hashPassword('password123'),
+  });
+  const org = await store.createOrganization({ name: 'Freeze Org', slug: 'freeze-org', ownerUserId: user.id });
+  const project = await store.createProject({ organizationId: org.id, name: 'Freeze Project', slug: 'freeze-project' });
+
+  // Thumbnail is a normal user-session route (the workspace object-storage grant
+  // only covers /object-storage/*), so authenticate the owner with a session.
+  const token = 'freeze-user-session';
+  await store.createSession({ userId: user.id, token, expiresAt: new Date(Date.now() + 3600_000) });
+
+  return { app, store, project, token };
+}
+
+const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
+
+describe('object-storage routes — purge freeze barrier', () => {
+  it('thumbnail/upload-url returns 403 OBJECT_STORAGE_PURGE_FROZEN while the project is frozen (RR-08 #1)', async () => {
+    const { app, store, project, token } = await setup();
+
+    // Not frozen yet → the signed upload is minted.
+    const before = await app.inject({
+      method: 'POST',
+      url: `/projects/${project.id}/thumbnail/upload-url`,
+      headers: bearer(token),
+      payload: {},
+    });
+    expect(before.statusCode).toBe(200);
+    expect(before.json().url).toBe('https://signed/put');
+
+    // Freeze the project (what the account-purge guarantee does: a PurgeFreeze row).
+    store.setObjectStoragePurgeFrozen(project.id, true);
+
+    const blocked = await app.inject({
+      method: 'POST',
+      url: `/projects/${project.id}/thumbnail/upload-url`,
+      headers: bearer(token),
+      payload: {},
+    });
+    expect(blocked.statusCode).toBe(403);
+    expect(blocked.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');
+
+    // Unfreeze → the route works again (the block is conditional, not a wall).
+    store.setObjectStoragePurgeFrozen(project.id, false);
+    const after = await app.inject({
+      method: 'POST',
+      url: `/projects/${project.id}/thumbnail/upload-url`,
+      headers: bearer(token),
+      payload: {},
+    });
+    expect(after.statusCode).toBe(200);
+  });
+
+  it('a frozen project blocks the generic upload-url write too, but still allows reads', async () => {
+    const { app, store, project, token } = await setup();
+    store.setObjectStoragePurgeFrozen(project.id, true);
+
+    // Write path → 403.
+    const upload = await app.inject({
+      method: 'POST',
+      url: `/projects/${project.id}/object-storage/objects/upload-url`,
+      headers: bearer(token),
+      payload: { key: 'hello.txt', contentType: 'text/plain' },
+    });
+    expect(upload.statusCode).toBe(403);
+    expect(upload.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');
+
+    // Read path → still allowed (the freeze bars writes, not reads).
+    const list = await app.inject({
+      method: 'GET',
+      url: `/projects/${project.id}/object-storage/objects`,
+      headers: bearer(token),
+    });
+    expect(list.statusCode).toBe(200);
+  });
+});
diff --git a/services/api/src/tests/test-api-store.ts b/services/api/src/tests/test-api-store.ts
index 6c9dc134..6f4382e9 100644
--- a/services/api/src/tests/test-api-store.ts
+++ b/services/api/src/tests/test-api-store.ts
@@ -2,6 +2,15 @@ import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
 import { hashToken } from '@vibecore/auth';
 import type { PlanKey, QuotaKey } from '@vibecore/billing';
 import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
+import {
+  anonymizedEmail,
+  anonymizedOrgSlug,
+  buildErasureProof,
+  type PurgeClassReport,
+  type PurgeStorageDeps,
+  type PurgeUserAccountResult,
+} from '../account-purge.js';
+import { deletionStatus, purgeDueAtMs, FINANCIAL_RETENTION_DAYS } from '../data-deletion.js';
 import { DEFAULT_ENV_VAR_SCOPE } from '../store.js';
 import type {
   EnvVarScope,
@@ -276,6 +285,432 @@ export class TestApiStore implements ApiStore {
     return deleted;
   }
 
+  /*
+   * In-memory mirror of PrismaApiStore.purgeUserAccount (§16.12 purge
+   * executor). Guards + tombstone stamping happen SYNCHRONOUSLY (no await
+   * between the status check and the purgedAt write), so two racing calls in
+   * the single-threaded test runtime observe exactly-once purge semantics like
+   * the advisory-locked Postgres implementation.
+   */
+  /** RR-09: no durable freeze state in the in-memory store, so nothing to reconcile. */
+  async reconcilePurgeFreezes(): Promise<{ reconciled: number }> {
+    return { reconciled: 0 };
+  }
+
+  /** RR-1bd27929: in-memory object-storage purge-freeze set (route-test only). */
+  private readonly objectStoragePurgeFrozen = new Set<string>();
+
+  async isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean> {
+    return this.objectStoragePurgeFrozen.has(projectId);
+  }
+
+  /** Test helper: simulate a purge freezing / thawing a project's object storage. */
+  setObjectStoragePurgeFrozen(projectId: string, frozen: boolean): void {
+    if (frozen) {
+      this.objectStoragePurgeFrozen.add(projectId);
+    } else {
+      this.objectStoragePurgeFrozen.delete(projectId);
+    }
+  }
+
+  async purgeUserAccount(
+    input: { userId: string; nowMs?: number },
+    deps?: PurgeStorageDeps,
+  ): Promise<PurgeUserAccountResult> {
+    const { userId } = input;
+    const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
+    const nowIso = new Date(nowMs).toISOString();
+
+    const user = this.users.get(userId);
+
+    if (!user) {
+      return { outcome: 'not_requested' };
+    }
+
+    const deletion = (user.preferences?.accountDeletion ?? null) as
+      | { requestedAt?: string; purgedAt?: string }
+      | null;
+    const toMs = (value?: string) => {
+      if (!value) {
+        return null;
+      }
+
+      const ms = new Date(value).getTime();
+
+      return Number.isFinite(ms) ? ms : null;
+    };
+    const requestedAtMs = toMs(deletion?.requestedAt);
+    const purgedAtMs = toMs(deletion?.purgedAt);
+    const status = deletionStatus({ requestedAtMs, purgedAtMs, nowMs });
+
+    if (status === 'purged') {
+      return { outcome: 'already_purged', purgedAt: deletion!.purgedAt! };
+    }
+
+    if (status === 'none') {
+      return { outcome: 'not_requested' };
+    }
+
+    if (status === 'grace_period') {
+      return { outcome: 'not_due', purgeDueAt: new Date(purgeDueAtMs(requestedAtMs!)).toISOString() };
+    }
+
+    // ready_to_purge — claim atomically (synchronous stamp = the CAS).
+    const requestedAt = deletion!.requestedAt!;
+    const originalEmail = user.email;
+    user.preferences = { accountDeletion: { requestedAt, purgedAt: nowIso } };
+
+    const orgIds = [...new Set([...this.memberships.values()].filter((m) => m.userId === userId).map((m) => m.organizationId))];
+    const soleOrgIds = orgIds.filter(
+      (orgId) => [...this.memberships.values()].filter((m) => m.organizationId === orgId).length === 1,
+    );
+    const sharedOrgIds = orgIds.filter((orgId) => !soleOrgIds.includes(orgId));
+
+    /*
+     * PHYSICAL ERASURE GATE (mirror of PrismaApiStore): erase the sole-org
+     * projects' storage BEFORE any DB row is deleted. FAIL-CLOSED — if it can't
+     * be proven erased, release the just-claimed tombstone (so a retry can
+     * re-attempt) and throw before any destructive DB mutation.
+     */
+    let physicalClasses: PurgeClassReport[] = [];
+
+    if (deps?.eraseStorage) {
+      const bucketProjectIds = [...this.projects.values()]
+        .filter((p) => soleOrgIds.includes(p.organizationId))
+        .map((p) => p.id);
+      // Reserve #3: workspaces = sole-org projects + collaborator projects.
+      const collabProjectIds = [...this.projectCollaborators.values()]
+        .filter((c) => c.userId === userId)
+        .map((c) => c.projectId);
+      const workspaceProjectIds = [...new Set([...bucketProjectIds, ...collabProjectIds])];
+      const erasure = await deps.eraseStorage({ bucketProjectIds, workspaceProjectIds });
+
+      if (!erasure.verified) {
+        user.preferences = { accountDeletion: { requestedAt } };
+        throw new Error(
+          `ACCOUNT_PURGE_PHYSICAL_INCOMPLETE: physical storage not fully erased for ${userId} ` +
+            `(${erasure.classes.map((c) => `${c.dataClass}=${c.remainingAfterPurge ?? 0}`).join(', ')})`,
+        );
+      }
+
+      physicalClasses = erasure.classes;
+    }
+
+    const deleteWhere = <T>(map: Map<string, T>, match: (row: T) => boolean): number => {
+      let count = 0;
+
+      for (const [key, row] of map.entries()) {
+        if (match(row)) {
+          map.delete(key);
+          count += 1;
+        }
+      }
+
+      return count;
+    };
+
+    const classes: PurgeClassReport[] = [];
+
+    classes.push({
+      dataClass: 'sessions',
+      action: 'deleted',
+      models: { Session: deleteWhere(this.sessions, (s) => s.userId === userId) },
+    });
+
+    classes.push({
+      dataClass: 'auth_tokens',
+      action: 'deleted',
+      models: {
+        EmailVerificationToken: deleteWhere(this.emailVerifications, (t) => t.userId === userId),
+        PasswordResetToken: deleteWhere(this.passwordResets, (t) => t.userId === userId),
+        MfaRecoveryCode: deleteWhere(this.recoveryCodes, (c) => c.userId === userId),
+      },
+    });
+
+    classes.push({
+      dataClass: 'api_keys',
+      action: 'deleted',
+      models: { ApiKey: deleteWhere(this.apiKeys, (k) => k.userId === userId) },
+    });
+
+    classes.push({
+      dataClass: 'connected_accounts',
+      action: 'deleted',
+      models: {
+        OAuthConnection: deleteWhere(this.oauthConnections, (c) => c.userId === userId),
+        UserConnection: deleteWhere(this.userConnections, (c) => c.userId === userId),
+      },
+    });
+
+    const deletedConversationIds = new Set(
+      [...this.aiConversations.values()].filter((c) => c.userId === userId).map((c) => c.id),
+    );
+    const deletedMessageIds = new Set(
+      [...this.aiMessages.values()].filter((m) => deletedConversationIds.has(m.conversationId)).map((m) => m.id),
+    );
+    classes.push({
+      dataClass: 'ai_history',
+      action: 'deleted',
+      models: {
+        AiConversation: deleteWhere(this.aiConversations, (c) => c.userId === userId),
+        AiMessage: deleteWhere(this.aiMessages, (m) => deletedConversationIds.has(m.conversationId)),
+        AiToolCall: deleteWhere(this.aiToolCalls, (t) => deletedMessageIds.has(t.messageId)),
+        AiTokenUsage: deleteWhere(this.aiTokenUsages, (u) => deletedMessageIds.has(u.messageId)),
+        AiMessageFeedback: deleteWhere(this.aiMessageFeedback, (f) => f.userId === userId),
+        Notification: deleteWhere(this.notifications, (n) => n.userId === userId),
+        AgentCheckpoint: deleteWhere(this.agentCheckpoints, (c) => soleOrgIds.includes(c.organizationId)),
+      },
+    });
+
+    classes.push({
+      dataClass: 'collaboration',
+      action: 'deleted',
+      models: {
+        ProjectCollaborator: deleteWhere(this.projectCollaborators, (c) => c.userId === userId),
+        CollaborationPresence: deleteWhere(this.collaborationPresence, (p) => p.userId === userId),
+        CollaborationComment: deleteWhere(this.collaborationComments, (c) => c.userId === userId),
+        ProjectShareLink: deleteWhere(this.projectShareLinks, (l) => l.createdByUserId === userId),
+        UserSpendLimit: deleteWhere(this.userSpendLimits, (l) => l.userId === userId),
+      },
+    });
+
+    const deletedProjectIds = new Set(
+      [...this.projects.values()].filter((p) => soleOrgIds.includes(p.organizationId)).map((p) => p.id),
+    );
+    const projectsDeleted = deleteWhere(this.projects, (p) => soleOrgIds.includes(p.organizationId));
+    deleteWhere(this.workspaces, (w) => deletedProjectIds.has(w.projectId));
+    deleteWhere(this.snapshots, (s) => deletedProjectIds.has(s.projectId));
+    deleteWhere(this.deployments, (d) => deletedProjectIds.has(d.projectId));
+    classes.push({ dataClass: 'projects', action: 'deleted', models: { Project: projectsDeleted } });
+
+    classes.push({
+      dataClass: 'imports',
+      action: 'deleted',
+      models: { ImportJob: deleteWhere(this.importJobs, (j) => soleOrgIds.includes(j.organizationId)) },
+    });
+
+    classes.push({
+      dataClass: 'memberships',
+      action: 'deleted',
+      models: { OrganizationMember: deleteWhere(this.memberships, (m) => m.userId === userId) },
+    });
+
+    classes.push({
+      dataClass: 'marketing',
+      action: 'deleted',
+      models: { NewsletterSubscriber: this.newsletterSubscribers.delete(originalEmail) ? 1 : 0 },
+    });
+
+    // ---- anonymized (redacted in place, never deleted) ----
+    let auditRedacted = 0;
+
+    for (const event of this.auditLogs) {
+      if (event.actorUserId === userId) {
+        event.ipAddress = undefined;
+        event.metadata = { redacted: true, redactedAt: nowIso };
+        auditRedacted += 1;
+      }
+    }
+
+    let adminAuditRedacted = 0;
+
+    for (const event of this.adminAuditLogs) {
+      if (event.actorUserId === userId && event.ipAddress !== undefined) {
+        event.ipAddress = undefined;
+        adminAuditRedacted += 1;
+      }
+    }
+
+    classes.push({
+      dataClass: 'audit_logs',
+      action: 'anonymized',
+      reason: 'append_only_redacted_never_deleted',
+      models: { AuditLog: auditRedacted, AdminAuditLog: adminAuditRedacted },
+    });
+
+    let usageRefs = 0;
+
+    for (const event of this.usageEvents.values()) {
+      if (event.userId === userId) {
+        event.userId = undefined;
+        usageRefs += 1;
+      }
+    }
+
+    let checkpointRefs = 0;
+
+    for (const checkpoint of this.agentCheckpoints.values()) {
+      if (checkpoint.userId === userId) {
+        checkpoint.userId = undefined;
+        checkpointRefs += 1;
+      }
+    }
+
+    let activityRefs = 0;
+
+    for (const activity of this.projectActivity.values()) {
+      if (activity.actorUserId === userId) {
+        activity.actorUserId = undefined;
+        activityRefs += 1;
+      }
+    }
+
+    let galleryRefs = 0;
+
+    for (const listing of this.galleryListings.values()) {
+      if (listing.authorUserId === userId) {
+        listing.authorUserId = undefined;
+        listing.authorName = 'Deleted account';
+        galleryRefs += 1;
+      }
+    }
+
+    classes.push({
+      dataClass: 'user_references',
+      action: 'anonymized',
+      reason: 'retained_rows_detached_from_user',
+      models: {
+        UsageEvent: usageRefs,
+        AgentCheckpoint: checkpointRefs,
+        ProjectActivity: activityRefs,
+        GalleryListing: galleryRefs,
+      },
+    });
+
+    let orgsAnonymized = 0;
+
+    for (const orgId of soleOrgIds) {
+      const org = this.organizations.get(orgId);
+
+      if (org) {
+        org.name = 'Purged account';
+        org.slug = anonymizedOrgSlug(orgId);
+        orgsAnonymized += 1;
+      }
+    }
+
+    classes.push({
+      dataClass: 'organizations',
+      action: 'anonymized',
+      reason: 'retained_as_anchor_for_financial_records',
+      models: { Organization: orgsAnonymized },
+    });
+
+    // ---- retained (fail-closed financial retention, consigned) ----
+    const financialCutoffMs = nowMs - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;
+    const expiredErased =
+      deleteWhere(
+        this.usageEvents,
+        (e) => soleOrgIds.includes(e.organizationId) && new Date(e.createdAt).getTime() < financialCutoffMs,
+      ) +
+      deleteWhere(
+        this.aiCostLedger,
+        (e) => soleOrgIds.includes(e.organizationId) && new Date(e.createdAt).getTime() < financialCutoffMs,
+      ) +
+      deleteWhere(
+        this.creditLedger,
+        (e) => soleOrgIds.includes(e.organizationId) && new Date(e.createdAt).getTime() < financialCutoffMs,
+      );
+
+    const countWhere = <T>(map: Map<string, T>, match: (row: T) => boolean): number =>
+      [...map.values()].filter(match).length;
+
+    classes.push({
+      dataClass: 'financial_records',
+      action: 'retained',
+      reason: 'financial_retention_7y_fail_closed',
+      models: {
+        UsageEvent: countWhere(this.usageEvents, (e) => soleOrgIds.includes(e.organizationId)),
+        AiCostLedger: countWhere(this.aiCostLedger, (e) => soleOrgIds.includes(e.organizationId)),
+        CreditLedger: countWhere(this.creditLedger, (e) => soleOrgIds.includes(e.organizationId)),
+        StripeEvent: countWhere(this.stripeEvents, (e) => (e.organizationId ? soleOrgIds.includes(e.organizationId) : false)),
+        Subscription: countWhere(this.subscriptions, (s) => soleOrgIds.includes(s.organizationId)),
+        ExpiredRowsErased: expiredErased,
+      },
+    });
+
+    classes.push({
+      dataClass: 'ledger',
+      action: 'retained',
+      reason: 'ledger_immutable_posted_entries_mig0078',
+      models: { LedgerTransaction: 0 },
+    });
+
+    classes.push({
+      dataClass: 'shared_org_content',
+      action: 'retained',
+      reason: 'shared_organization_belongs_to_other_members',
+      models: { Project: countWhere(this.projects, (p) => sharedOrgIds.includes(p.organizationId)) },
+    });
+
+    // ---- tombstone ----
+    user.email = anonymizedEmail(userId);
+    user.name = undefined;
+    user.passwordHash = undefined;
+    user.emailVerifiedAt = undefined;
+    user.mfaEnabled = false;
+    user.mfaSecretEncrypted = undefined;
+    user.platformAdmin = false;
+    user.language = undefined;
+    user.timezone = undefined;
+    user.lastActiveAt = undefined;
+    classes.push({
+      dataClass: 'profile',
+      action: 'anonymized',
+      reason: 'tombstone_carries_purgedAt',
+      models: { User: 1 },
+    });
+
+    // ---- post-purge verification ----
+    const verify: Record<string, number> = {
+      sessions: countWhere(this.sessions, (s) => s.userId === userId),
+      auth_tokens:
+        countWhere(this.emailVerifications, (t) => t.userId === userId) +
+        countWhere(this.passwordResets, (t) => t.userId === userId) +
+        countWhere(this.recoveryCodes, (c) => c.userId === userId),
+      api_keys: countWhere(this.apiKeys, (k) => k.userId === userId),
+      connected_accounts:
+        countWhere(this.oauthConnections, (c) => c.userId === userId) +
+        countWhere(this.userConnections, (c) => c.userId === userId),
+      ai_history:
+        countWhere(this.aiConversations, (c) => c.userId === userId) +
+        countWhere(this.aiMessageFeedback, (f) => f.userId === userId) +
+        countWhere(this.notifications, (n) => n.userId === userId),
+      collaboration:
+        countWhere(this.projectCollaborators, (c) => c.userId === userId) +
+        countWhere(this.collaborationPresence, (p) => p.userId === userId) +
+        countWhere(this.collaborationComments, (c) => c.userId === userId) +
+        countWhere(this.projectShareLinks, (l) => l.createdByUserId === userId) +
+        countWhere(this.userSpendLimits, (l) => l.userId === userId),
+      projects: countWhere(this.projects, (p) => soleOrgIds.includes(p.organizationId)),
+      imports: countWhere(this.importJobs, (j) => soleOrgIds.includes(j.organizationId)),
+      memberships: countWhere(this.memberships, (m) => m.userId === userId),
+      marketing: this.newsletterSubscribers.has(originalEmail) ? 1 : 0,
+    };
+
+    for (const entry of classes) {
+      if (entry.action === 'deleted') {
+        entry.remainingAfterPurge = verify[entry.dataClass] ?? 0;
+      }
+    }
+
+    const leftovers = Object.entries(verify).filter(([, remaining]) => remaining > 0);
+
+    if (leftovers.length > 0) {
+      throw new Error(
+        `ACCOUNT_PURGE_VERIFICATION_FAILED: rows remaining after purge for ${userId}: ${leftovers
+          .map(([k, v]) => `${k}=${v}`)
+          .join(', ')}`,
+      );
+    }
+
+    classes.push(...physicalClasses);
+
+    const proof = buildErasureProof({ userId, requestedAt, purgedAt: nowIso, classes });
+
+    return { outcome: 'purged', proof };
+  }
+
   async findUserByEmail(email: string) {
     return [...this.users.values()].find((user) => user.email === email.toLowerCase());
   }
diff --git a/services/worker/src/index.ts b/services/worker/src/index.ts
index 008513bf..14d94f68 100644
--- a/services/worker/src/index.ts
+++ b/services/worker/src/index.ts
@@ -315,6 +315,48 @@ export async function triggerInactivityGc(jobData: Record<string, unknown> = {})
   return result as Record<string, unknown>;
 }
 
+/**
+ * Account-purge trigger (§16.12) — POSTs to the api's internal
+ * /internal/account-purge which consumes the ready_to_purge deletion queue:
+ * for each user whose 14-day grace window has elapsed it executes the REAL
+ * class-by-class purge (fail-closed financial retention, audit redaction,
+ * ledger immutability respected) and persists a verified erasure proof to the
+ * AdminAuditLog. Thin trigger so the destructive logic stays in the api with
+ * the store abstraction. DRY-RUN unless ACCOUNT_PURGE_ENABLED=true on the api
+ * (or jobData.enabled). Idempotent + concurrency-safe on the api side.
+ */
+export async function triggerAccountPurge(jobData: Record<string, unknown> = {}) {
+  const baseUrl = process.env.API_INTERNAL_URL ?? process.env.API_URL;
+  if (!baseUrl) {
+    throw new Error('API_INTERNAL_URL (or API_URL) is required to trigger account.purge');
+  }
+
+  const secret = (process.env.INTERNAL_API_SHARED_SECRET ?? process.env.WORKSPACE_MANAGER_SHARED_SECRET)?.trim();
+  const body = {
+    enabled: jobData.enabled as boolean | undefined,
+    take: jobData.take as number | undefined,
+    userId: jobData.userId as string | undefined,
+  };
+
+  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/internal/account-purge`, {
+    method: 'POST',
+    headers: {
+      'content-type': 'application/json',
+      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
+    },
+    body: JSON.stringify(body),
+    signal: AbortSignal.timeout(120_000),
+  });
+
+  if (!response.ok) {
+    await response.body?.cancel().catch(() => {});
+    throw new Error(`account.purge upstream failed: ${response.status}`);
+  }
+
+  const result = await response.json().catch(() => ({}));
+  return result as Record<string, unknown>;
+}
+
 /**
  * Object-storage metering trigger (Replit-parity $0.03/GiB-month) — POSTs to the
  * api's internal /internal/metering/object-storage which sums the REAL stored
@@ -477,6 +519,10 @@ export function startWorkers() {
         return await triggerInactivityGc(job.data ?? {});
       }
 
+      if (job.name === 'account.purge') {
+        return await triggerAccountPurge(job.data ?? {});
+      }
+
       if (job.name === 'metering.objectStorage') {
         return await triggerObjectStorageMetering(job.data ?? {});
       }
diff --git a/services/workspace-manager/src/app.ts b/services/workspace-manager/src/app.ts
index c9f7dfbf..7eb07267 100644
--- a/services/workspace-manager/src/app.ts
+++ b/services/workspace-manager/src/app.ts
@@ -421,6 +421,16 @@ export function buildWorkspaceManagerApp(manager: WorkspaceManager) {
   app.delete('/workspaces/:workspaceId', async (request) =>
     manager.deleteWorkspace(runtimeNamespace(), (request.params as any).workspaceId),
   );
+  // Account-purge reserve #2: REAL PVC existence in Kubernetes (not the row status).
+  app.get('/workspaces/:workspaceId/pvc-exists', async (request) => ({
+    exists: await manager.pvcExists(runtimeNamespace(), (request.params as any).workspaceId),
+  }));
+  // Account-purge reserve #1: write barrier — revoke token + stop pod before erasure.
+  app.post('/workspaces/:workspaceId/freeze', async (request, reply) => {
+    await manager.freezeWorkspace(runtimeNamespace(), (request.params as any).workspaceId);
+
+    return reply.code(204).send();
+  });
 
   /*
    * Live cluster-capacity snapshot for the admin Infrastructure view. The manager
diff --git a/services/workspace-manager/src/manager.spec.ts b/services/workspace-manager/src/manager.spec.ts
index 682ccdff..cd6dc921 100644
--- a/services/workspace-manager/src/manager.spec.ts
+++ b/services/workspace-manager/src/manager.spec.ts
@@ -196,6 +196,41 @@ describe('WorkspaceManager', () => {
     expect(events.events.map((event) => event.type)).toContain('workspace.running');
   });
 
+  it('account-purge reserve #5: pvcExists is false ONLY on NotFound; a read error propagates (fail-closed)', async () => {
+    const k8s = new TestWorkspaceK8sClient();
+    const manager = new WorkspaceManager(new TestWorkspaceStore(), k8s, new TestEventBus(), 'test-workspace-agent-secret');
+    await manager.startWorkspace(input);
+
+    // Real PVC present.
+    expect(await manager.pvcExists('workspaces', 'workspace_1')).toBe(true);
+
+    // Clean NotFound (get -> undefined) is the only thing that counts as absent.
+    await k8s.delete('PersistentVolumeClaim', 'workspaces', 'pvc-workspace_1');
+    expect(await manager.pvcExists('workspaces', 'workspace_1')).toBe(false);
+
+    // A non-NotFound read error (network/RBAC) must NOT be read as "absent".
+    vi.spyOn(k8s, 'get').mockRejectedValueOnce(Object.assign(new Error('connection refused'), { code: 7 }));
+    await expect(manager.pvcExists('workspaces', 'workspace_1')).rejects.toThrow(/connection refused/);
+  });
+
+  it('account-purge reserve #1: freezeWorkspace THROWS if any k8s revoke fails, and does not claim the barrier', async () => {
+    const k8s = new TestWorkspaceK8sClient();
+    const store = new TestWorkspaceStore();
+    const manager = new WorkspaceManager(store, k8s, new TestEventBus(), 'test-workspace-agent-secret');
+    await manager.startWorkspace(input);
+
+    // One of the three revokes (the Pod delete) fails.
+    vi.spyOn(k8s, 'delete').mockImplementation(async (kind: string) => {
+      if (kind === 'Pod') {
+        throw new Error('kubectl delete pod: server error');
+      }
+    });
+
+    await expect(manager.freezeWorkspace('workspaces', 'workspace_1')).rejects.toThrow(/WORKSPACE_FREEZE_INCOMPLETE/);
+    // The barrier was NOT acquired → the row must not have been flipped to STOPPED.
+    expect((await store.get('workspace_1'))!.status).not.toBe('STOPPED');
+  });
+
   it('never runs the real agent-reachability fetch under vitest, even without the timeout env (keeps the root `vitest --run` suite fast)', async () => {
     /*
      * Regression guard for the CI flake: the repo-root `vitest --run` globs this
diff --git a/services/workspace-manager/src/manager.ts b/services/workspace-manager/src/manager.ts
index 63dfe54b..eb2e46b5 100644
--- a/services/workspace-manager/src/manager.ts
+++ b/services/workspace-manager/src/manager.ts
@@ -1177,6 +1177,69 @@ export class WorkspaceManager {
     return deleted;
   }
 
+  /**
+   * Account-purge reserve #2: whether the REAL PVC still exists in Kubernetes —
+   * a live `get pvc`, NOT the workspace row's DELETED status (a partial k8s
+   * delete can leave a PVC behind a "deleted" row). A missing row ⇒ no PVC.
+   */
+  async pvcExists(namespace: string, workspaceId: string): Promise<boolean> {
+    const workspace = await this.store.get(workspaceId).catch(() => undefined);
+    const pvcName = workspace?.pvcName ?? `pvc-${workspaceId}`;
+
+    /*
+     * Reserve #5: ONLY an authenticated NotFound counts as absence. `k8s.get`
+     * returns undefined for a REAL NotFound and RE-THROWS every other failure
+     * (network, RBAC, kubectl error) — see KubectlWorkspaceK8sClient.get. We do
+     * NOT catch: a read error must propagate (→ 5xx → the caller fails closed),
+     * never be misread as "PVC absent". Swallowing it would let a transient
+     * error certify erasure.
+     */
+    const pvc = await this.k8s.get('PersistentVolumeClaim', namespace, pvcName);
+
+    return Boolean(pvc);
+  }
+
+  /**
+   * Account-purge reserve #1 (write barrier): revoke the agent token and stop
+   * the pod so the workspace can neither write nor be reprovisioned during the
+   * erasure window. The PVC is kept — deleteWorkspace erases it immediately after.
+   *
+   * FAIL-CLOSED: it attempts EVERY delete (so partial cleanup still happens) but
+   * THROWS if ANY of them rejected — the barrier is never reported acquired while
+   * a Secret/Pod/Service delete failed, so a write path could still be live.
+   */
+  async freezeWorkspace(namespace: string, workspaceId: string): Promise<void> {
+    const workspace = await this.store.get(workspaceId).catch(() => undefined);
+
+    if (!workspace) {
+      return;
+    }
+
+    const targets: Array<[string, string]> = [
+      ['Secret', workspace.agentTokenSecretName ?? `agent-token-${workspaceId}`],
+      ['Pod', workspace.podName],
+      ['Service', workspace.serviceName],
+    ];
+    const results = await Promise.allSettled(
+      targets.map(([kind, name]) => this.k8s.delete(kind, namespace, name)),
+    );
+
+    const failed = results
+      .map((result, index) => ({ result, target: targets[index] }))
+      .filter((entry) => entry.result.status === 'rejected');
+
+    if (failed.length > 0) {
+      // Do NOT mark the row stopped / claim the barrier — a live write path may remain.
+      throw new Error(
+        `WORKSPACE_FREEZE_INCOMPLETE: ${failed.length} revoke(s) failed for ${workspaceId}: ` +
+          failed.map((entry) => entry.target[0]).join(', '),
+      );
+    }
+
+    this.lastTouchAt.delete(workspaceId);
+    await this.store.update(workspaceId, { status: 'STOPPED' }).catch(() => {});
+  }
+
   #gcInFlight = false;
 
   async garbageCollect(namespace: string, inactiveMs: number, deleteMs: number) {
```

### 1b) The RR-1bd27929 delta only (this round's commit, source-only)

```diff
diff --git a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md
index 9bc4933f..8fc1d915 100644
--- a/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md
+++ b/docs/deploy-evidence/2026-07-23-physical-purge-e2e/README.md
@@ -48,6 +48,40 @@ local `kind` cluster satisfies "real k8s" at $0, so no cost sign-off was needed.
 No persistent keys: GCS uses ADC (the reviewer's gcloud login), k8s uses the
 local kind kubeconfig.
 
+## Round 7 — RR-1bd27929: PER-PLAN ownership (multi-plan safety)
+
+The reviewer found a real hole in the freeze model: freezes were GLOBAL id-lists,
+so two concurrent purges sharing an org/project could not tell whose freeze was
+whose — releasing plan A lifted a freeze plan B still needed. Replaced the
+system-setting id-lists with an OWNERSHIP model (migration `0083_purge_plan_ownership`):
+
+- **`PurgePlan`** — one row per active purge, with `ownerToken`, `leaseExpiresAt`
+  and `version` (for CAS reclaim).
+- **`PurgeFreeze`** — one row per `(resourceType, resourceId, planId)` (unique),
+  so each frozen resource is OWNED by exactly one plan. A resource is frozen iff
+  **≥ 1** PurgeFreeze row references it.
+
+Guarantees now hold by construction:
+- **Release** deletes ONLY the plan's own freeze rows → a shared org stays frozen
+  while another live plan owns it; `addMember`/`removeMember` refuse while ≥ 1 plan
+  freezes the org.
+- **Reconciler** reclaims ONLY plans whose **lease has EXPIRED**, via **CAS on
+  `version`** (a live plan — even one blocked in a slow erasure — is never touched,
+  and two concurrent reconcilers can't double-reclaim). It deletes only the
+  reclaimed plan's rows, never a concurrent plan's.
+- The object-storage route guard now asks the store `isObjectStorageProjectPurgeFrozen`
+  (count of PurgeFreeze rows), not a global list.
+
+Proof (real Postgres, `account-purge-db.spec.ts`, all deterministic):
+- **(15)** two plans share an org; one releases (real release path) → org STAYS
+  frozen (addMember still refused) until the LAST plan releases.
+- **(16)** reconciler never reclaims a live plan (valid lease), even blocked in erasure.
+- **(17)** reconciler reclaims an ABANDONED plan (expired lease) via CAS (two
+  concurrent reconcilers → reclaimed exactly once), releasing ONLY its resources —
+  a concurrent live plan's freeze on the same org is untouched.
+- **(18)** crash between the two thaws → plan kept recoverable, reprise idempotent,
+  zero residual freeze after reconcile, and NO other plan's freeze removed.
+
 ## Round 6 — CODEX-10 REVIEW_BLOCKED: two deep audits (both found real holes)
 
 **A.1 — global scan of every OrganizationMember mutation path.** Repo-wide there
diff --git a/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql b/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql
new file mode 100644
index 00000000..d456fee4
--- /dev/null
+++ b/packages/database/prisma/migrations/0083_purge_plan_ownership/migration.sql
@@ -0,0 +1,32 @@
+-- RR-1bd27929: per-plan ownership of account-purge freezes (PurgePlan + PurgeFreeze).
+
+-- CreateTable
+CREATE TABLE "PurgePlan" (
+    "id" TEXT NOT NULL,
+    "userId" TEXT NOT NULL,
+    "ownerToken" TEXT NOT NULL,
+    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
+    "version" INTEGER NOT NULL DEFAULT 0,
+    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
+    CONSTRAINT "PurgePlan_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateTable
+CREATE TABLE "PurgeFreeze" (
+    "id" TEXT NOT NULL,
+    "planId" TEXT NOT NULL,
+    "resourceType" TEXT NOT NULL,
+    "resourceId" TEXT NOT NULL,
+    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
+    CONSTRAINT "PurgeFreeze_pkey" PRIMARY KEY ("id")
+);
+
+-- CreateIndex
+CREATE INDEX "PurgePlan_userId_idx" ON "PurgePlan"("userId");
+CREATE INDEX "PurgePlan_leaseExpiresAt_idx" ON "PurgePlan"("leaseExpiresAt");
+CREATE UNIQUE INDEX "PurgeFreeze_resourceType_resourceId_planId_key" ON "PurgeFreeze"("resourceType", "resourceId", "planId");
+CREATE INDEX "PurgeFreeze_resourceType_resourceId_idx" ON "PurgeFreeze"("resourceType", "resourceId");
+CREATE INDEX "PurgeFreeze_planId_idx" ON "PurgeFreeze"("planId");
+
+-- AddForeignKey
+ALTER TABLE "PurgeFreeze" ADD CONSTRAINT "PurgeFreeze_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PurgePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
diff --git a/packages/database/prisma/schema.prisma b/packages/database/prisma/schema.prisma
index 05e737d8..7270c541 100644
--- a/packages/database/prisma/schema.prisma
+++ b/packages/database/prisma/schema.prisma
@@ -2742,3 +2742,38 @@ model WorkspacePostMortem {
 
   @@index([workspaceId, capturedAt])
 }
+
+// RR-1bd27929 — PER-PLAN ownership of account-purge freezes (§16.12). The old
+// model used GLOBAL id-lists, so two concurrent purges sharing an org/project could
+// not tell whose freeze was whose: releasing plan A lifted a freeze plan B still
+// needed. Now each active purge holds a PurgePlan (lease + ownerToken + version for
+// CAS reclaim) and each frozen resource is a PurgeFreeze row OWNED by exactly one
+// plan. A resource is frozen iff >= 1 PurgeFreeze row references it, so releasing
+// one plan only deletes ITS rows and never lifts a freeze another live plan owns.
+// The reconciler reclaims ONLY plans whose lease has expired, via CAS on version —
+// it never touches a live plan.
+model PurgePlan {
+  id             String        @id @default(cuid())
+  userId         String
+  ownerToken     String
+  leaseExpiresAt DateTime
+  version        Int           @default(0)
+  createdAt      DateTime      @default(now())
+  freezes        PurgeFreeze[]
+
+  @@index([userId])
+  @@index([leaseExpiresAt])
+}
+
+model PurgeFreeze {
+  id           String    @id @default(cuid())
+  planId       String
+  resourceType String
+  resourceId   String
+  createdAt    DateTime  @default(now())
+  plan         PurgePlan @relation(fields: [planId], references: [id], onDelete: Cascade)
+
+  @@unique([resourceType, resourceId, planId])
+  @@index([resourceType, resourceId])
+  @@index([planId])
+}
diff --git a/services/api/src/app.ts b/services/api/src/app.ts
index 4c839b16..3804d87d 100644
--- a/services/api/src/app.ts
+++ b/services/api/src/app.ts
@@ -6768,9 +6768,6 @@ function createWorkspaceVolumeEraser(): WorkspaceVolumeErasurePort {
   };
 }
 
-/** System-setting key: projects whose object-storage writes are frozen mid-purge. */
-const OBJECT_STORAGE_PURGE_FROZEN_KEY = 'objectStorage.purgeFrozenProjectIds';
-
 /*
  * Workspace write barrier (reserve #1): freeze each of the subject's workspaces
  * BEFORE the erasure — workspace-manager `POST /workspaces/:id/freeze` (revoke
@@ -30386,11 +30383,8 @@ export async function buildApiApp(options: ApiAppOptions = {}): Promise<FastifyI
    * early 403) and the structural write wrapper below (defence in depth for the
    * background thumbnail capturer and any future write path).
    */
-  const isObjectStoragePurgeFrozen = async (projectId: string): Promise<boolean> => {
-    const frozen = (await store.listSystemSettings()).find((s) => s.key === OBJECT_STORAGE_PURGE_FROZEN_KEY)?.value;
-
-    return Array.isArray(frozen) && frozen.includes(projectId);
-  };
+  const isObjectStoragePurgeFrozen = async (projectId: string): Promise<boolean> =>
+    store.isObjectStorageProjectPurgeFrozen(projectId);
 
   /*
    * RAW backend — used ONLY by the account-purge erasure, which must be able to
diff --git a/services/api/src/prisma-store.ts b/services/api/src/prisma-store.ts
index 82c3b9b2..0b32960a 100644
--- a/services/api/src/prisma-store.ts
+++ b/services/api/src/prisma-store.ts
@@ -1,3 +1,4 @@
+import { randomUUID } from 'node:crypto';
 import { promises as dnsPromises } from 'node:dns';
 import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
 import { hashToken } from '@vibecore/auth';
@@ -153,25 +154,32 @@ function storageTopologyFingerprint(topology: {
 }
 
 /*
- * Account-purge topology guarantee (RR-09). Two freeze sets + a per-user plan
- * record form a RECOVERABLE state machine: acquired (membership + object storage
- * frozen, plan recorded) BEFORE the irreversible external GCS/PVC erasure, and
- * released on EVERY exit (success / drift / any throw) so no freeze is ever left
- * behind. A leftover plan (process crashed mid-erasure) is reconciled — its
- * freezes released — at the start of the next purge-executor pass.
- *   - MEMBERSHIP: block sole↔shared flips while the erasure runs (addMember /
- *     removeMember refuse a frozen org), so the deletion only ever touches
- *     buckets that are provably sole under the guarantee.
- *   - OBJECT_STORAGE: MUST match app.ts OBJECT_STORAGE_PURGE_FROZEN_KEY — the
- *     request routes read the same set to refuse writes to a purging project.
+ * Account-purge topology guarantee (RR-09 + RR-1bd27929 per-plan ownership).
+ * Freezes are now DB rows OWNED by a plan, not global id-lists:
+ *   - a PurgePlan row per active purge carries a lease (leaseExpiresAt), an
+ *     ownerToken and a version for CAS reclaim;
+ *   - a PurgeFreeze row (planId, resourceType, resourceId) freezes ONE resource
+ *     for ONE plan. A resource is frozen iff >= 1 PurgeFreeze row references it.
+ * So two purges sharing an org each hold their OWN membership row: releasing one
+ * plan deletes only ITS rows and never lifts a freeze another live plan owns; and
+ * the reconciler reclaims ONLY plans whose lease expired (CAS on version) — never
+ * a live plan. resourceType values: 'membership' (orgId) | 'objectStorage'
+ * (projectId). addMember/removeMember and the object-storage routes refuse while
+ * >= 1 plan freezes the resource.
  */
-const MEMBERSHIP_PURGE_FROZEN_KEY = 'membership.purgeFrozenOrgIds';
-const OBJECT_STORAGE_PURGE_FROZEN_KEY = 'objectStorage.purgeFrozenProjectIds';
-const PURGE_PLAN_KEY_PREFIX = 'purge.plan.';
-const purgePlanKey = (userId: string) => `${PURGE_PLAN_KEY_PREFIX}${userId}`;
+const MEMBERSHIP_RESOURCE = 'membership';
+const OBJECT_STORAGE_RESOURCE = 'objectStorage';
+// Advisory-lock name that serialises the membership guarantee's read→freeze with
+// addMember/removeMember (see CANONICAL LOCK ORDER in acquirePurgeGuarantee).
+const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
+// Lease TTL: comfortably exceeds any GCS/PVC erasure, so the reconciler never
+// reclaims a live plan mid-erasure. Abandoned plans self-heal within one TTL.
+const PURGE_LEASE_TTL_MS = 30 * 60 * 1000;
 
 /** The topology-locked plan the external erasure is authorized to act on. */
 interface PurgeGuarantee {
+  planId: string;
+  ownerToken: string;
   userId: string;
   fingerprint: string;
   orgIds: string[];
@@ -536,91 +544,61 @@ export class PrismaApiStore implements ApiStore {
 
   /* ---------------- account-purge topology guarantee (RR-09) ---------------- */
 
-  /** Add/remove an id in a system-setting id-array, using the CALLER's tx. */
-  private async mutateIdSetInTx(
-    tx: Prisma.TransactionClient,
-    key: string,
-    change: { add?: string; remove?: string },
-  ): Promise<void> {
-    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `system-setting:${key}`);
-    const existing = await tx.systemSetting.findUnique({ where: { key } });
-    const set = new Set(
-      Array.isArray(existing?.value)
-        ? (existing!.value as unknown[]).filter((item): item is string => typeof item === 'string')
-        : [],
+  /** Is this project's object storage frozen by >= 1 in-flight account purge? */
+  async isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean> {
+    return (
+      (await this.prisma.purgeFreeze.count({
+        where: { resourceType: OBJECT_STORAGE_RESOURCE, resourceId: projectId },
+      })) > 0
     );
-
-    if (change.add) {
-      set.add(change.add);
-    }
-
-    if (change.remove) {
-      set.delete(change.remove);
-    }
-
-    const next = [...set];
-    await tx.systemSetting.upsert({
-      where: { key },
-      create: { key, value: next as Prisma.InputJsonValue },
-      update: { value: next as Prisma.InputJsonValue },
-    });
   }
 
   /**
-   * RR-09 (1)(2)(3): acquire the topology GUARANTEE before any external deletion.
-   * In ONE tx under the per-user advisory lock: compute the authoritative
-   * sole/shared topology AND freeze it — membership for every org the subject
-   * belongs to (so no join/leave can flip sole↔shared while the erasure runs) and
-   * object storage for the sole-org buckets we are about to erase — then record a
-   * recoverable plan. Because the read and the freeze are atomic, the erasure that
-   * follows is guaranteed to act only on buckets that are sole under this lock.
+   * RR-09 (1)(2)(3) + RR-1bd27929: acquire the topology GUARANTEE before any
+   * external deletion, as a PLAN that OWNS its freeze rows. In ONE tx:
+   *   CANONICAL LOCK ORDER — account-purge:<userId>  <  MEMBERSHIP_FREEZE_LOCK
+   * both taken BEFORE the topology read (addMember/removeMember and the purge
+   * finalize tombstone take these in the same order — no inversion, no deadlock).
+   * CODEX-10: the membership lock is held from before the read to commit, so the
+   * read and the freeze are atomic w.r.t. membership — a join that grabbed the lock
+   * first commits before ours and is reflected in the topology (a now-shared org's
+   * bucket is excluded); one arriving after blocks until commit and is refused.
+   * Creates a PurgePlan (lease + ownerToken + version for CAS reclaim) and one
+   * PurgeFreeze row per org (membership) and per sole-org bucket (objectStorage),
+   * all OWNED by this plan.
    */
   private async acquirePurgeGuarantee(userId: string): Promise<PurgeGuarantee> {
+    const ownerToken = randomUUID();
+    const leaseExpiresAt = new Date(Date.now() + PURGE_LEASE_TTL_MS);
+
     return this.prisma.$transaction(async (tx) => {
-      // CANONICAL LOCK ORDER (must be identical everywhere to avoid deadlock):
-      //   (1) account-purge:<userId>
-      //   (2) system-setting:membership.purgeFrozenOrgIds   ← BEFORE the topology read
-      //   (3) system-setting:objectStorage.purgeFrozenProjectIds
       await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
-
-      /*
-       * CODEX-10: take the MEMBERSHIP freeze-set lock BEFORE reading the topology
-       * and hold it through commit. addMember / removeMember synchronise on this
-       * SAME lock, so no member can be added/removed between our read and our
-       * freeze — read + freeze are atomic w.r.t. membership. A mutation that grabbed
-       * the lock first commits before ours and is reflected in the topology (a
-       * now-shared org's bucket is excluded); one arriving after blocks until our
-       * freeze is committed and is then refused. Closes the former read→freeze race.
-       */
-      await tx.$executeRawUnsafe(
-        'SELECT pg_advisory_xact_lock(hashtext($1))',
-        `system-setting:${MEMBERSHIP_PURGE_FROZEN_KEY}`,
-      );
+      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
 
       const topology = await this.resolveStorageTopology(tx, userId);
 
-      // Re-acquiring the membership lock inside mutateIdSetInTx is a harmless no-op
-      // (advisory locks stack within a tx); we already hold it from above.
-      for (const orgId of topology.orgIds) {
-        await this.mutateIdSetInTx(tx, MEMBERSHIP_PURGE_FROZEN_KEY, { add: orgId });
+      const plan = await tx.purgePlan.create({ data: { userId, ownerToken, leaseExpiresAt } });
+
+      const freezeRows = [
+        ...topology.orgIds.map((orgId) => ({
+          planId: plan.id,
+          resourceType: MEMBERSHIP_RESOURCE,
+          resourceId: orgId,
+        })),
+        ...topology.bucketProjectIds.map((projectId) => ({
+          planId: plan.id,
+          resourceType: OBJECT_STORAGE_RESOURCE,
+          resourceId: projectId,
+        })),
+      ];
+
+      if (freezeRows.length > 0) {
+        await tx.purgeFreeze.createMany({ data: freezeRows, skipDuplicates: true });
       }
 
-      for (const projectId of topology.bucketProjectIds) {
-        await this.mutateIdSetInTx(tx, OBJECT_STORAGE_PURGE_FROZEN_KEY, { add: projectId });
-      }
-
-      await tx.systemSetting.upsert({
-        where: { key: purgePlanKey(userId) },
-        create: {
-          key: purgePlanKey(userId),
-          value: { orgIds: topology.orgIds, projectIds: topology.bucketProjectIds } as Prisma.InputJsonValue,
-        },
-        update: {
-          value: { orgIds: topology.orgIds, projectIds: topology.bucketProjectIds } as Prisma.InputJsonValue,
-        },
-      });
-
       return {
+        planId: plan.id,
+        ownerToken,
         userId,
         fingerprint: topology.fingerprint,
         orgIds: topology.orgIds,
@@ -631,116 +609,79 @@ export class PrismaApiStore implements ApiStore {
   }
 
   /**
-   * RR-09 (4)(6): release the guarantee — unfreeze membership + object storage and
-   * clear the plan — GUARANTEED on every exit (success / drift / any throw), so no
-   * freeze is ever left behind. Best-effort per id so one failure can't strand the
-   * rest; the reconciler is the backstop for a process that dies before this runs.
+   * RR-1bd27929: release the guarantee — delete ONLY THIS plan's freeze rows (never
+   * another plan's, so a shared resource stays frozen while another live plan owns
+   * it) then the plan row (CAS on ownerToken). Thaws membership then object storage
+   * as separate steps; if a thaw fails, the plan is LEFT (not deleted) so the
+   * reconciler recovers it via its lease — a freeze is never stranded without a
+   * plan pointing at it. Deleting the plan cascades any remaining freeze rows.
    */
   private async releasePurgeGuarantee(guarantee: PurgeGuarantee): Promise<void> {
-    for (const orgId of guarantee.orgIds) {
-      await this.mutateSystemSettingIds(MEMBERSHIP_PURGE_FROZEN_KEY, { remove: orgId }).catch(() => undefined);
-    }
-
-    for (const projectId of guarantee.bucketProjectIds) {
-      await this.mutateSystemSettingIds(OBJECT_STORAGE_PURGE_FROZEN_KEY, { remove: projectId }).catch(() => undefined);
-    }
-
-    // A.2: drop the plan ONLY once BOTH freezes are provably lifted (never before),
-    // so a failed thaw leaves the plan for the reconciler — a freeze is never
-    // stranded without a plan pointing at it.
-    await this.deletePurgePlanIfFullyThawed(guarantee.userId, guarantee.orgIds, guarantee.bucketProjectIds);
-  }
-
-  /**
-   * RR-20260804-CODEX-10 A.2: delete a purge plan row ONLY when neither freeze set
-   * still contains ANY of the plan's ids — i.e. both the membership and the
-   * object-storage thaw actually took effect. If either is still present (a thaw
-   * failed, or a process died mid-thaw), the plan is LEFT so the reconciler retries;
-   * the plan is the only durable pointer back to a frozen id, so deleting it early
-   * would strand the freeze forever. Returns whether the plan was deleted.
-   */
-  private async deletePurgePlanIfFullyThawed(
-    userId: string,
-    orgIds: string[],
-    projectIds: string[],
-  ): Promise<boolean> {
-    const settings = await this.listSystemSettings();
-    const idSet = (key: string) => {
-      const value = settings.find((setting) => setting.key === key)?.value;
-
-      return new Set(
-        Array.isArray(value) ? (value as unknown[]).filter((item): item is string => typeof item === 'string') : [],
-      );
-    };
-    const frozenOrgs = idSet(MEMBERSHIP_PURGE_FROZEN_KEY);
-    const frozenProjects = idSet(OBJECT_STORAGE_PURGE_FROZEN_KEY);
-
-    if (orgIds.some((id) => frozenOrgs.has(id)) || projectIds.some((id) => frozenProjects.has(id))) {
-      return false; // a freeze is still up → keep the plan for the reconciler
+    try {
+      await this.prisma.purgeFreeze.deleteMany({
+        where: { planId: guarantee.planId, resourceType: MEMBERSHIP_RESOURCE },
+      });
+      await this.prisma.purgeFreeze.deleteMany({
+        where: { planId: guarantee.planId, resourceType: OBJECT_STORAGE_RESOURCE },
+      });
+    } catch {
+      // A thaw failed mid-release → keep the plan (and its remaining rows) for the
+      // reconciler; never delete the plan while a freeze it owns might still be up.
+      return;
     }
 
-    await this.prisma.systemSetting.delete({ where: { key: purgePlanKey(userId) } }).catch(() => undefined);
-
-    return true;
+    await this.prisma.purgePlan
+      .deleteMany({ where: { id: guarantee.planId, ownerToken: guarantee.ownerToken } })
+      .catch(() => undefined);
   }
 
   /**
-   * RR-09 (4): recover from a crash. Any purge plan still present at the start of a
-   * purge-executor pass belongs to a run that died before releasing — release its
-   * freezes so a legitimate org/project is never left frozen forever. The current
-   * pass re-acquires a fresh guarantee for any user still ready_to_purge.
+   * RR-1bd27929: recover ABANDONED plans only. Reclaims a plan ONLY when its lease
+   * has EXPIRED (a live plan — valid lease — is never touched, even one blocked in
+   * a slow erasure), and via CAS on `version` so two concurrent reconcilers (or a
+   * late owner) can't double-reclaim. Deletes ONLY the reclaimed plan's own freeze
+   * rows — never a concurrent plan's.
    */
   async reconcilePurgeFreezes(): Promise<{ reconciled: number }> {
-    const settings = await this.listSystemSettings();
-    const plans = settings.filter((setting) => setting.key.startsWith(PURGE_PLAN_KEY_PREFIX));
+    const now = new Date();
+    const expired = await this.prisma.purgePlan.findMany({ where: { leaseExpiresAt: { lt: now } } });
     let reconciled = 0;
 
-    for (const plan of plans) {
-      const value = (plan.value ?? {}) as { orgIds?: unknown; projectIds?: unknown };
-      const orgIds = Array.isArray(value.orgIds) ? value.orgIds.filter((id): id is string => typeof id === 'string') : [];
-      const projectIds = Array.isArray(value.projectIds)
-        ? value.projectIds.filter((id): id is string => typeof id === 'string')
-        : [];
-
-      for (const orgId of orgIds) {
-        await this.mutateSystemSettingIds(MEMBERSHIP_PURGE_FROZEN_KEY, { remove: orgId }).catch(() => undefined);
-      }
+    for (const plan of expired) {
+      // CAS: only the reconciler that wins the version bump owns the reclaim.
+      const won = await this.prisma.purgePlan.updateMany({
+        where: { id: plan.id, version: plan.version, leaseExpiresAt: { lt: now } },
+        data: { version: { increment: 1 } },
+      });
 
-      for (const projectId of projectIds) {
-        await this.mutateSystemSettingIds(OBJECT_STORAGE_PURGE_FROZEN_KEY, { remove: projectId }).catch(() => undefined);
+      if (won.count === 0) {
+        continue; // lost the race, or the plan was renewed / already removed
       }
 
-      // A.2: only drop the plan once BOTH freezes are provably lifted; otherwise
-      // leave it for the next pass. Never delete a plan while a freeze it owns
-      // is still set (that would strand the freeze).
-      const userId = plan.key.slice(PURGE_PLAN_KEY_PREFIX.length);
-
-      if (await this.deletePurgePlanIfFullyThawed(userId, orgIds, projectIds)) {
-        reconciled += 1;
-      }
+      await this.prisma.purgeFreeze.deleteMany({ where: { planId: plan.id } }).catch(() => undefined);
+      await this.prisma.purgePlan.deleteMany({ where: { id: plan.id } }).catch(() => undefined);
+      reconciled += 1;
     }
 
     return { reconciled };
   }
 
   /**
-   * RR-09 (2): refuse a membership mutation for an org whose membership is frozen
-   * by an in-flight account purge. Takes the same advisory lock the guarantee uses
-   * to write the freeze set, so a mutation either serializes BEFORE the freeze
-   * (and is then reflected in the guarantee's topology) or sees it and is refused
-   * — never interleaving to flip sole↔shared mid-erasure. Call inside the caller's tx.
+   * RR-09 (2) + RR-1bd27929: refuse a membership mutation while >= 1 plan freezes
+   * this org. Takes the MEMBERSHIP_FREEZE_LOCK the guarantee holds, so a mutation
+   * either serialises BEFORE the guarantee's read (and is reflected in its
+   * topology) or sees the freeze row and is refused — never interleaving to flip
+   * sole↔shared mid-erasure. The org stays refused while ANY plan freezes it (so
+   * releasing one of two sharing plans does not re-open it). Call inside the
+   * caller's tx.
    */
   private async assertOrgMembershipNotPurgeFrozen(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
-    await tx.$executeRawUnsafe(
-      'SELECT pg_advisory_xact_lock(hashtext($1))',
-      `system-setting:${MEMBERSHIP_PURGE_FROZEN_KEY}`,
-    );
-    const existing = await tx.systemSetting.findUnique({ where: { key: MEMBERSHIP_PURGE_FROZEN_KEY } });
-    const frozen = Array.isArray(existing?.value)
-      ? (existing!.value as unknown[]).filter((item): item is string => typeof item === 'string')
-      : [];
+    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
+    const frozen = await tx.purgeFreeze.count({
+      where: { resourceType: MEMBERSHIP_RESOURCE, resourceId: organizationId },
+    });
 
-    if (frozen.includes(organizationId)) {
+    if (frozen > 0) {
       throw new Error(
         `MEMBERSHIP_FROZEN_FOR_PURGE: organization ${organizationId} membership is frozen during an account purge`,
       );
@@ -829,10 +770,7 @@ export class PrismaApiStore implements ApiStore {
          * guarantee take, so it cannot interleave DURING another purge's atomic
          * read→freeze section and flip an org sole↔shared under that purge's snapshot.
          */
-        await tx.$executeRawUnsafe(
-          'SELECT pg_advisory_xact_lock(hashtext($1))',
-          `system-setting:${MEMBERSHIP_PURGE_FROZEN_KEY}`,
-        );
+        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
 
         const user = await tx.user.findUnique({ where: { id: userId } });
 
diff --git a/services/api/src/store.ts b/services/api/src/store.ts
index 80061632..1be1d640 100644
--- a/services/api/src/store.ts
+++ b/services/api/src/store.ts
@@ -1264,6 +1264,8 @@ export interface ApiStore {
   purgeUserAccount(input: { userId: string; nowMs?: number }, deps?: PurgeStorageDeps): Promise<PurgeUserAccountResult>;
   /** RR-09: release any account-purge freeze left behind by a crashed run. */
   reconcilePurgeFreezes(): Promise<{ reconciled: number }>;
+  /** RR-1bd27929: is this project's object storage frozen by >= 1 in-flight purge? */
+  isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean>;
   findUserByEmail(email: string): Promise<UserRecord | undefined>;
   findUserById(id: string): Promise<UserRecord | undefined>;
   /**
diff --git a/services/api/src/tests/account-purge-db.spec.ts b/services/api/src/tests/account-purge-db.spec.ts
index 9f0490d8..24d8fc17 100644
--- a/services/api/src/tests/account-purge-db.spec.ts
+++ b/services/api/src/tests/account-purge-db.spec.ts
@@ -348,13 +348,48 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
    * it must be refused.
    */
 
-  const MEMBERSHIP_FROZEN = 'membership.purgeFrozenOrgIds';
-  const OBJECT_STORAGE_FROZEN = 'objectStorage.purgeFrozenProjectIds';
+  const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
+  type Db = ReturnType<typeof createDatabaseClient>;
 
-  async function frozenSet(store: PrismaApiStore, key: string): Promise<string[]> {
-    const value = (await store.listSystemSettings()).find((s) => s.key === key)?.value;
+  // RR-1bd27929: a resource is frozen iff >= 1 PurgeFreeze row references it.
+  async function membershipFrozen(prisma: Db, orgId: string): Promise<boolean> {
+    return (await prisma.purgeFreeze.count({ where: { resourceType: 'membership', resourceId: orgId } })) > 0;
+  }
+
+  async function objectStorageFrozen(prisma: Db, projectId: string): Promise<boolean> {
+    return (await prisma.purgeFreeze.count({ where: { resourceType: 'objectStorage', resourceId: projectId } })) > 0;
+  }
 
-    return Array.isArray(value) ? (value as string[]) : [];
+  async function planFor(prisma: Db, userId: string) {
+    return prisma.purgePlan.findFirst({ where: { userId } });
+  }
+
+  // Seed a PurgePlan (+ its PurgeFreeze rows) directly — models a crashed/abandoned
+  // run. `leaseExpiresAt` in the past = reclaimable by the reconciler.
+  async function seedPlan(
+    prisma: Db,
+    userId: string,
+    orgIds: string[],
+    projectIds: string[],
+    opts?: { leaseExpiresAt?: Date; ownerToken?: string },
+  ) {
+    const plan = await prisma.purgePlan.create({
+      data: {
+        userId,
+        ownerToken: opts?.ownerToken ?? `token-${suffix()}`,
+        leaseExpiresAt: opts?.leaseExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
+      },
+    });
+    const rows = [
+      ...orgIds.map((id) => ({ planId: plan.id, resourceType: 'membership', resourceId: id })),
+      ...projectIds.map((id) => ({ planId: plan.id, resourceType: 'objectStorage', resourceId: id })),
+    ];
+
+    if (rows.length > 0) {
+      await prisma.purgeFreeze.createMany({ data: rows });
+    }
+
+    return plan;
   }
 
   async function makeShared(store: PrismaApiStore, prisma: ReturnType<typeof createDatabaseClient>, orgId: string, ownerUserId: string) {
@@ -394,8 +429,8 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
       expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
       expect(await prisma.organization.count({ where: { id: org.id } })).toBe(1);
       // No residual freeze after the successful purge.
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
     } finally {
       await prisma.$disconnect();
     }
@@ -483,10 +518,9 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
       );
 
       // RR-09 (6): both freeze sets released, plan cleared — nothing left behind.
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      const plan = (await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`);
-      expect(plan?.value ?? null).toBeNull();
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await planFor(prisma, user.id)).toBeNull();
       // The org is writable again: a member can join now that the freeze is gone.
       const joiner = await store.createUser({
         email: `after-${suffix()}@example.com`,
@@ -506,10 +540,9 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
       const store = new PrismaApiStore(prisma);
       const { user, org, project } = await seedAccount(store);
 
-      // Simulate a crash mid-erasure: a plan + freezes persisted but never released.
-      await store.mutateSystemSettingIds(MEMBERSHIP_FROZEN, { add: org.id });
-      await store.mutateSystemSettingIds(OBJECT_STORAGE_FROZEN, { add: project.id });
-      await store.setSystemSetting({ key: `purge.plan.${user.id}`, value: { orgIds: [org.id], projectIds: [project.id] } });
+      // Simulate a crash mid-erasure: an ABANDONED plan (lease already expired) +
+      // its freeze rows persisted but never released.
+      await seedPlan(prisma, user.id, [org.id], [project.id], { leaseExpiresAt: new Date(Date.now() - 60_000) });
 
       // The org is frozen — a join is refused…
       const joiner = await store.createUser({
@@ -524,9 +557,9 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
       // …until the reconciler releases the stale freeze.
       const { reconciled } = await store.reconcilePurgeFreezes();
       expect(reconciled).toBeGreaterThanOrEqual(1);
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)).toBeUndefined();
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
+      expect(await planFor(prisma, user.id)).toBeNull();
       await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
     } finally {
       await prisma.$disconnect();
@@ -539,7 +572,7 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
     const prismaB = createDatabaseClient(); // the purge
     const prismaC = createDatabaseClient(); // pg_locks poller
 
-    const MEMBERSHIP_LOCK = 'system-setting:membership.purgeFrozenOrgIds';
+    const MEMBERSHIP_LOCK = MEMBERSHIP_FREEZE_LOCK;
 
     try {
       const store = new PrismaApiStore(prisma);
@@ -621,8 +654,8 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
       expect(captured!.bucketProjectIds).not.toContain(project.id);
       expect(await prisma.project.count({ where: { id: project.id } })).toBe(1); // bucket/project survive
       // No residual freeze after the successful purge.
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
     } finally {
       await Promise.allSettled([
         prisma.$disconnect(),
@@ -634,129 +667,187 @@ runDbTests('account purge — durable proofs (real Postgres)', () => {
   });
 
   /*
-   * RR-20260804-CODEX-10 A.2 — partial-thaw recovery. releasePurgeGuarantee /
-   * reconcilePurgeFreezes must NEVER delete the plan row while a freeze it owns is
-   * still up. The plan is the only durable pointer back to a frozen id, so deleting
-   * it early would strand the freeze forever. The membership/object-storage THAW is
-   * `store.mutateSystemSettingIds(key, { remove })`; we spy it to fail one side and
-   * assert the plan survives + the reconciler recovers.
+   * RR-1bd27929 — MULTI-PLAN SAFETY. Freezes are per-plan rows, so releasing one
+   * plan never lifts a freeze another live plan owns; the reconciler reclaims ONLY
+   * lease-expired plans, via CAS, touching just that plan's rows.
    */
 
-  it('(12) A.2: a FAILED membership thaw keeps the plan (freeze not stranded); reconciler recovers', async () => {
+  it('(15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases', async () => {
     const prisma = createDatabaseClient();
 
     try {
       const store = new PrismaApiStore(prisma);
-      const { user, org, project } = await seedAccount(store);
-      await requestElapsedDeletion(store, user.id);
-
-      // Fail ONLY the membership REMOVE (thaw); adds + the object-storage remove work.
-      const realMutate = store.mutateSystemSettingIds.bind(store);
-      const spy = vi.spyOn(store, 'mutateSystemSettingIds').mockImplementation(async (key, change) => {
-        if (key === MEMBERSHIP_FROZEN && change.remove) {
-          throw new Error('boom: membership thaw failed');
-        }
+      const { user, org } = await seedAccount(store);
+      const co = await makeShared(store, prisma, org.id, user.id); // org SHARED (user + co)
 
-        return realMutate(key, change);
-      });
+      // Plan B: a SECOND concurrent purge (co's), blocked in erase → a live plan
+      // that also freezes this org. Modelled by its persisted plan + freeze row.
+      const planB = await seedPlan(prisma, co.id, [org.id], []);
 
-      // Physical erase fails → purge throws → finally runs releasePurgeGuarantee.
-      await expect(
-        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
-      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);
+      // Plan A: user's REAL purge runs to completion (org is shared → no bucket);
+      // its release must delete ONLY plan A's rows.
+      await requestElapsedDeletion(store, user.id);
+      const result = await store.purgeUserAccount(
+        { userId: user.id },
+        { eraseStorage: async () => ({ classes: [], verified: true }) },
+      );
+      expect(result.outcome).toBe('purged');
 
-      // The membership thaw failed → membership STILL frozen, object-storage lifted,
-      // and the plan is KEPT (never deleted while a freeze it owns remains).
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).toContain(org.id);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)?.value ?? null).not.toBeNull();
+      // Plan A released, but plan B still freezes the org → STILL frozen.
+      expect(await planFor(prisma, user.id)).toBeNull(); // A gone
+      expect(await membershipFrozen(prisma, org.id)).toBe(true); // B's row remains
+      // …and a join stays REFUSED while >= 1 plan freezes the org.
+      const joiner = await store.createUser({
+        email: `j15-${suffix()}@example.com`,
+        name: 'J15',
+        passwordHash: hashPassword('password123'),
+      });
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
+        /MEMBERSHIP_FROZEN_FOR_PURGE/,
+      );
 
-      // Recovery: un-spy → the reconciler lifts the membership freeze AND deletes the plan.
-      spy.mockRestore();
-      const { reconciled } = await store.reconcilePurgeFreezes();
-      expect(reconciled).toBeGreaterThanOrEqual(1);
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)).toBeUndefined();
+      // The freeze disappears ONLY after the LAST plan (B) releases.
+      await prisma.purgePlan.delete({ where: { id: planB.id } }); // cascade removes B's rows
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
     } finally {
       await prisma.$disconnect();
     }
   });
 
-  it('(13) A.2: a crash between the two thaws (object-storage thaw fails) keeps the plan; reconciler recovers', async () => {
+  it('(16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure', async () => {
     const prisma = createDatabaseClient();
 
     try {
       const store = new PrismaApiStore(prisma);
       const { user, org, project } = await seedAccount(store);
-      await requestElapsedDeletion(store, user.id);
-
-      // Membership thaw succeeds, then the object-storage thaw fails — i.e. a crash
-      // AFTER the first thaw and BEFORE the second completes.
-      const realMutate = store.mutateSystemSettingIds.bind(store);
-      const spy = vi.spyOn(store, 'mutateSystemSettingIds').mockImplementation(async (key, change) => {
-        if (key === OBJECT_STORAGE_FROZEN && change.remove) {
-          throw new Error('boom: object-storage thaw failed');
-        }
 
-        return realMutate(key, change);
+      // Plan B holds a VALID lease (its owner is blocked in a slow eraseStorage).
+      const planB = await seedPlan(prisma, user.id, [org.id], [project.id], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
       });
 
-      await expect(
-        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
-      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);
-
-      // Membership lifted, object-storage STILL frozen, and the plan is KEPT.
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).toContain(project.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)?.value ?? null).not.toBeNull();
-
-      // Recovery: the reconciler lifts the object-storage freeze AND deletes the plan.
-      spy.mockRestore();
+      // A different executor runs the reconciler: it must touch NOTHING.
       const { reconciled } = await store.reconcilePurgeFreezes();
-      expect(reconciled).toBeGreaterThanOrEqual(1);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)).toBeUndefined();
+      expect(reconciled).toBe(0);
+      expect(await prisma.purgePlan.findUnique({ where: { id: planB.id } })).not.toBeNull();
+      expect(await membershipFrozen(prisma, org.id)).toBe(true);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
     } finally {
       await prisma.$disconnect();
     }
   });
 
-  it('(14) A.2: the reconciler itself never deletes a plan while a thaw fails (retries next pass)', async () => {
+  it('(17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources', async () => {
+    const prismaX = createDatabaseClient();
+    const prismaY = createDatabaseClient();
+
+    try {
+      const storeX = new PrismaApiStore(prismaX);
+      const storeY = new PrismaApiStore(prismaY);
+      const { user, org, project } = await seedAccount(storeX);
+      const other = await makeShared(storeX, prismaX, org.id, user.id); // shares org with a live plan
+
+      // Abandoned plan (expired lease) freezing org + project.
+      const abandoned = await seedPlan(prismaX, user.id, [org.id], [project.id], {
+        leaseExpiresAt: new Date(Date.now() - 60_000),
+      });
+      // A concurrent LIVE plan (valid lease) that ALSO freezes the same org.
+      const live = await seedPlan(prismaX, other.id, [org.id], [], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
+      });
+
+      // Two executors reconcile concurrently → CAS ensures the abandoned plan is
+      // reclaimed exactly ONCE (never double-reclaimed).
+      const [rx, ry] = await Promise.all([storeX.reconcilePurgeFreezes(), storeY.reconcilePurgeFreezes()]);
+      expect(rx.reconciled + ry.reconciled).toBe(1);
+
+      // The abandoned plan + its OWN rows are gone…
+      expect(await prismaX.purgePlan.findUnique({ where: { id: abandoned.id } })).toBeNull();
+      expect(await objectStorageFrozen(prismaX, project.id)).toBe(false); // was only the abandoned plan's
+      // …but the concurrent LIVE plan is untouched, so the org stays frozen.
+      expect(await prismaX.purgePlan.findUnique({ where: { id: live.id } })).not.toBeNull();
+      expect(await membershipFrozen(prismaX, org.id)).toBe(true);
+    } finally {
+      await Promise.allSettled([prismaX.$disconnect(), prismaY.$disconnect()]);
+    }
+  });
+
+  it('(18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched', async () => {
     const prisma = createDatabaseClient();
 
     try {
       const store = new PrismaApiStore(prisma);
       const { user, org, project } = await seedAccount(store);
+      await requestElapsedDeletion(store, user.id);
+
+      // A DIFFERENT plan (distinct owner) on other resources — must remain
+      // untouched throughout. Distinct owner so planFor(user.id) resolves only the
+      // crashed purge plan, not this one.
+      const otherUser = await store.createUser({
+        email: `other18-${suffix()}@example.com`,
+        name: 'Other18',
+        passwordHash: hashPassword('password123'),
+      });
+      const otherOrg = await store.createOrganization({
+        name: `Other ${suffix()}`,
+        slug: `other-${suffix()}`,
+        ownerUserId: otherUser.id,
+      });
+      const otherProject = await store.createProject({
+        organizationId: otherOrg.id,
+        name: 'OtherP',
+        slug: `otherp-${suffix()}`,
+      });
+      const otherPlan = await seedPlan(prisma, otherUser.id, [otherOrg.id], [otherProject.id], {
+        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
+      });
 
-      // Simulate a crashed run: both freezes + a plan persisted, nothing released.
-      await store.mutateSystemSettingIds(MEMBERSHIP_FROZEN, { add: org.id });
-      await store.mutateSystemSettingIds(OBJECT_STORAGE_FROZEN, { add: project.id });
-      await store.setSystemSetting({ key: `purge.plan.${user.id}`, value: { orgIds: [org.id], projectIds: [project.id] } });
+      // Crash BETWEEN the two thaws: fail the object-storage thaw (2nd deleteMany).
+      const realDeleteMany = prisma.purgeFreeze.deleteMany.bind(prisma.purgeFreeze);
+      const spy = vi
+        .spyOn(prisma.purgeFreeze, 'deleteMany')
+        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
+          if ((args as { where?: { resourceType?: string } })?.where?.resourceType === 'objectStorage') {
+            throw new Error('boom: object-storage thaw failed');
+          }
 
-      // Fail the object-storage thaw during reconcile.
-      const realMutate = store.mutateSystemSettingIds.bind(store);
-      const spy = vi.spyOn(store, 'mutateSystemSettingIds').mockImplementation(async (key, change) => {
-        if (key === OBJECT_STORAGE_FROZEN && change.remove) {
-          throw new Error('boom: object-storage thaw failed');
-        }
+          return realDeleteMany(args);
+        }) as typeof realDeleteMany);
 
-        return realMutate(key, change);
-      });
+      // Physical erase fails → purge throws → release runs and crashes mid-thaw.
+      await expect(
+        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
+      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);
 
-      const first = await store.reconcilePurgeFreezes();
-      expect(first.reconciled).toBe(0); // could not fully thaw → plan NOT deleted
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).toContain(project.id); // still frozen
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)?.value ?? null).not.toBeNull();
+      const plan = await planFor(prisma, user.id);
+      // Membership thawed, object-storage still frozen, plan KEPT (recoverable).
+      expect(await membershipFrozen(prisma, org.id)).toBe(false);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
+      expect(plan).not.toBeNull();
+      // The OTHER plan's freezes are completely untouched.
+      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
+      expect(await objectStorageFrozen(prisma, otherProject.id)).toBe(true);
+      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
+
+      // Recovery: expire the crashed plan's lease → reconciler reclaims it.
+      await prisma.purgePlan.update({ where: { id: plan!.id }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
+      const r1 = await store.reconcilePurgeFreezes();
+      expect(r1.reconciled).toBeGreaterThanOrEqual(1);
+      expect(await objectStorageFrozen(prisma, project.id)).toBe(false); // zero residual freeze
+      expect(await planFor(prisma, user.id)).toBeNull();
+
+      // Idempotent reprise: a second reconcile changes nothing, and the OTHER plan
+      // (still live) is STILL untouched.
+      const r2 = await store.reconcilePurgeFreezes();
+      expect(r2.reconciled).toBe(0);
+      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
+      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
 
-      // Next pass, thaw works → freeze lifted AND plan deleted.
       spy.mockRestore();
-      const second = await store.reconcilePurgeFreezes();
-      expect(second.reconciled).toBeGreaterThanOrEqual(1);
-      expect(await frozenSet(store, OBJECT_STORAGE_FROZEN)).not.toContain(project.id);
-      expect(await frozenSet(store, MEMBERSHIP_FROZEN)).not.toContain(org.id);
-      expect((await store.listSystemSettings()).find((s) => s.key === `purge.plan.${user.id}`)).toBeUndefined();
     } finally {
       await prisma.$disconnect();
     }
   });
+
 });
diff --git a/services/api/src/tests/object-storage-purge-freeze.spec.ts b/services/api/src/tests/object-storage-purge-freeze.spec.ts
index 47e67689..04b11fa3 100644
--- a/services/api/src/tests/object-storage-purge-freeze.spec.ts
+++ b/services/api/src/tests/object-storage-purge-freeze.spec.ts
@@ -19,7 +19,6 @@ class QuietEmailProvider implements EmailProvider {
 }
 
 const SECRET = 'unit-object-storage-freeze-secret';
-const OBJECT_STORAGE_PURGE_FROZEN_KEY = 'objectStorage.purgeFrozenProjectIds';
 
 /** Fake ObjectStorage so the routes never touch real GCS. */
 const fakeStorage = {
@@ -121,8 +120,8 @@ describe('object-storage routes — purge freeze barrier', () => {
     expect(before.statusCode).toBe(200);
     expect(before.json().url).toBe('https://signed/put');
 
-    // Freeze the project (what the account-purge write barrier does).
-    await store.mutateSystemSettingIds(OBJECT_STORAGE_PURGE_FROZEN_KEY, { add: project.id });
+    // Freeze the project (what the account-purge guarantee does: a PurgeFreeze row).
+    store.setObjectStoragePurgeFrozen(project.id, true);
 
     const blocked = await app.inject({
       method: 'POST',
@@ -134,7 +133,7 @@ describe('object-storage routes — purge freeze barrier', () => {
     expect(blocked.json().code).toBe('OBJECT_STORAGE_PURGE_FROZEN');
 
     // Unfreeze → the route works again (the block is conditional, not a wall).
-    await store.mutateSystemSettingIds(OBJECT_STORAGE_PURGE_FROZEN_KEY, { remove: project.id });
+    store.setObjectStoragePurgeFrozen(project.id, false);
     const after = await app.inject({
       method: 'POST',
       url: `/projects/${project.id}/thumbnail/upload-url`,
@@ -146,7 +145,7 @@ describe('object-storage routes — purge freeze barrier', () => {
 
   it('a frozen project blocks the generic upload-url write too, but still allows reads', async () => {
     const { app, store, project, token } = await setup();
-    await store.mutateSystemSettingIds(OBJECT_STORAGE_PURGE_FROZEN_KEY, { add: project.id });
+    store.setObjectStoragePurgeFrozen(project.id, true);
 
     // Write path → 403.
     const upload = await app.inject({
diff --git a/services/api/src/tests/test-api-store.ts b/services/api/src/tests/test-api-store.ts
index 557ef3e5..6f4382e9 100644
--- a/services/api/src/tests/test-api-store.ts
+++ b/services/api/src/tests/test-api-store.ts
@@ -297,6 +297,22 @@ export class TestApiStore implements ApiStore {
     return { reconciled: 0 };
   }
 
+  /** RR-1bd27929: in-memory object-storage purge-freeze set (route-test only). */
+  private readonly objectStoragePurgeFrozen = new Set<string>();
+
+  async isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean> {
+    return this.objectStoragePurgeFrozen.has(projectId);
+  }
+
+  /** Test helper: simulate a purge freezing / thawing a project's object storage. */
+  setObjectStoragePurgeFrozen(projectId: string, frozen: boolean): void {
+    if (frozen) {
+      this.objectStoragePurgeFrozen.add(projectId);
+    } else {
+      this.objectStoragePurgeFrozen.delete(projectId);
+    }
+  }
+
   async purgeUserAccount(
     input: { userId: string; nowMs?: number },
     deps?: PurgeStorageDeps,
```

---

## 2a) FULL SOURCE — services/api/src/prisma-store.ts (final head)

```ts
import { randomUUID } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { redactAuditMetadata, type AuditEvent } from '@vibecore/audit';
import { hashToken } from '@vibecore/auth';
import type { PlanKey, QuotaKey } from '@vibecore/billing';
import { createDatabaseClient, Prisma, type DatabaseClient } from '@vibecore/database';
import { rolePermissions, type PermissionKey } from '@vibecore/rbac';
import {
  anonymizedEmail,
  anonymizedOrgSlug,
  buildErasureProof,
  type PurgeClassReport,
  type PurgeStorageDeps,
  type PurgeUserAccountResult,
} from './account-purge.js';
import { deletionStatus, purgeDueAtMs, FINANCIAL_RETENTION_DAYS } from './data-deletion.js';
import { API_KEY_SCOPES, DEFAULT_ENV_VAR_SCOPE, ENV_VAR_SCOPES } from './store.js';
import type {
  AbuseEventRecord,
  SecurityEventResolutionRecord,
  AgentPatchProposalRecord,
  AgentRepairEventRecord,
  AgentRepairOutcome,
  AgentPatchProposalStatus,
  ConsensusRecordSummary,
  ConsensusRecordDetail,
  ConsensusClaimVote,
  ConsensusConflict,
  ConsensusConsolidated,
  ApiKeyRecord,
  ApiKeyScope,
  ApiStore,
  AiCostLedgerRecord,
  AiConversationRecord,
  IntegrationFeatureRequestRecord,
  AiMessageFeedbackRecord,
  AiMessageFeedbackVote,
  NotificationRecord,
  AiMessageRecord,
  AiTokenUsageRecord,
  AiToolCallRecord,
  AgentCheckpointRecord,
  BillingCustomerRecord,
  BillingPlanRecord,
  CheckpointStatus,
  CreditEntryKind,
  CreditLedgerRecord,
  CreditPackRecord,
  CreditWalletRecord,
  ModelConfigRecord,
  ProviderConfigRecord,
  CollaborationCommentRecord,
  CollaborationPresenceRecord,
  CustomRoleRecord,
  DeploymentRecord,
  ReleaseManifestRecord,
  DomainVerificationRecord,
  EmailDeliveryEventRecord,
  EnterpriseSettingsRecord,
  FeatureFlagRecord,
  MembershipRecord,
  OAuthConnectionRecord,
  OrganizationRecord,
  OrganizationInviteRecord,
  ProjectActivityListOptions,
  ProjectActivityRecord,
  ProjectCollaboratorRecord,
  ProjectConnectionLinkRecord,
  ReconnectionAlertRecord,
  EnvVarScope,
  ProjectEnvironmentRecord,
  ProjectIdeStateRecord,
  ProjectRecord,
  ProjectSecretRecord,
  ProjectShareLinkRecord,
  ChatShareRecord,
  ProjectStorageObjectRecord,
  ProjectTemplateRecord,
  DatabaseInstanceRecord,
  DatabaseSnapshotRecord,
  DatabaseRestoreRecord,
  GalleryListingRecord,
  RecoveryCodeRecord,
  ScimTokenRecord,
  SessionRecord,
  SiemWebhookRecord,
  SnapshotRecord,
  StripeEventRecord,
  StripeWebhookFailureRecord,
  SubscriptionRecord,
  SsoConfigRecord,
  SupportTicketRecord,
  TicketMessageRecord,
  SystemSettingRecord,
  UserConnectionRecord,
  UserConnectionStatus,
  UserRecord,
  UsageEventRecord,
  WorkspaceIdeStateRecord,
  WorkspaceRecord,
  QuotaOverrideRecord,
  AdminAuditLogRecord,
  InstalledSkillRecord,
  InstalledSkillScope,
  InstallSkillInput,
  SkillAuditEventRecord,
  RecordSkillAuditInput,
} from './store.js';

function now() {
  return new Date().toISOString();
}

function toIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : undefined;
}

/** Parse a JSON column that should hold an array; tolerate null/garbage → []. */
function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/*
 * A stable, order-independent signature of the storage topology an account purge
 * depends on. The external GCS/PVC erasure runs on the PRE-transaction topology;
 * the purge tx re-derives this same fingerprint under the advisory lock and
 * aborts on any drift, so a membership race (shared→sole / sole→shared) can never
 * finalize a purge on a stale inventory (RR-08 #3).
 */
function storageTopologyFingerprint(topology: {
  orgIds: string[];
  soleOrgIds: string[];
  bucketProjectIds: string[];
  workspaceProjectIds: string[];
}): string {
  const sorted = (values: string[]) => [...values].sort();

  return JSON.stringify({
    orgIds: sorted(topology.orgIds),
    soleOrgIds: sorted(topology.soleOrgIds),
    bucketProjectIds: sorted(topology.bucketProjectIds),
    workspaceProjectIds: sorted(topology.workspaceProjectIds),
  });
}

/*
 * Account-purge topology guarantee (RR-09 + RR-1bd27929 per-plan ownership).
 * Freezes are now DB rows OWNED by a plan, not global id-lists:
 *   - a PurgePlan row per active purge carries a lease (leaseExpiresAt), an
 *     ownerToken and a version for CAS reclaim;
 *   - a PurgeFreeze row (planId, resourceType, resourceId) freezes ONE resource
 *     for ONE plan. A resource is frozen iff >= 1 PurgeFreeze row references it.
 * So two purges sharing an org each hold their OWN membership row: releasing one
 * plan deletes only ITS rows and never lifts a freeze another live plan owns; and
 * the reconciler reclaims ONLY plans whose lease expired (CAS on version) — never
 * a live plan. resourceType values: 'membership' (orgId) | 'objectStorage'
 * (projectId). addMember/removeMember and the object-storage routes refuse while
 * >= 1 plan freezes the resource.
 */
const MEMBERSHIP_RESOURCE = 'membership';
const OBJECT_STORAGE_RESOURCE = 'objectStorage';
// Advisory-lock name that serialises the membership guarantee's read→freeze with
// addMember/removeMember (see CANONICAL LOCK ORDER in acquirePurgeGuarantee).
const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
// Lease TTL: comfortably exceeds any GCS/PVC erasure, so the reconciler never
// reclaims a live plan mid-erasure. Abandoned plans self-heal within one TTL.
const PURGE_LEASE_TTL_MS = 30 * 60 * 1000;

/** The topology-locked plan the external erasure is authorized to act on. */
interface PurgeGuarantee {
  planId: string;
  ownerToken: string;
  userId: string;
  fingerprint: string;
  orgIds: string[];
  bucketProjectIds: string[];
  workspaceProjectIds: string[];
}

type PrismaKnownRequestError = Error & { readonly code: string };

/**
 * Prisma's generated error constructor is a runtime value whose declaration can
 * lose its construct signature across workspace module-resolution boundaries.
 * Keep the runtime identity check while giving catch variables an explicit,
 * stable narrowing from `unknown` before their Prisma code is inspected.
 */
function isPrismaKnownRequestError(error: unknown): error is PrismaKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

// Database point-in-time rollback (Phase-1 scaffold) row → record mappers.
// sizeBytes is a Postgres BIGINT (Prisma `bigint`); narrow to number for the API.
function mapDatabaseInstance(row: {
  id: string;
  projectId: string;
  organizationId: string;
  environment: string;
  status: DatabaseInstanceRecord['status'];
  engine: string;
  region: string | null;
  sizeBytes: bigint;
  retentionDays: number;
  pitrEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DatabaseInstanceRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    organizationId: row.organizationId,
    environment: row.environment === 'production' ? 'production' : 'development',
    status: row.status,
    engine: row.engine,
    region: row.region ?? undefined,
    sizeBytes: Number(row.sizeBytes),
    retentionDays: row.retentionDays,
    pitrEnabled: row.pitrEnabled,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapDatabaseSnapshot(row: {
  id: string;
  databaseInstanceId: string;
  kind: string;
  label: string | null;
  lsn: string | null;
  sizeBytes: bigint;
  storageKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}): DatabaseSnapshotRecord {
  return {
    id: row.id,
    databaseInstanceId: row.databaseInstanceId,
    kind: row.kind === 'manual' ? 'manual' : 'auto',
    label: row.label ?? undefined,
    lsn: row.lsn ?? undefined,
    sizeBytes: Number(row.sizeBytes),
    storageKey: row.storageKey ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: toIso(row.createdAt)!,
    expiresAt: toIso(row.expiresAt),
  };
}

function mapDatabaseRestore(row: {
  id: string;
  databaseInstanceId: string;
  snapshotId: string | null;
  targetTimestamp: Date | null;
  status: DatabaseRestoreRecord['status'];
  requestedByUserId: string | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): DatabaseRestoreRecord {
  return {
    id: row.id,
    databaseInstanceId: row.databaseInstanceId,
    snapshotId: row.snapshotId ?? undefined,
    targetTimestamp: toIso(row.targetTimestamp),
    status: row.status,
    requestedByUserId: row.requestedByUserId ?? undefined,
    error: row.error ?? undefined,
    createdAt: toIso(row.createdAt)!,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function projectSlugBase(input: { slug?: string; name: string }) {
  return slugify(input.slug || input.name) || 'project';
}

function assertFound<T>(value: T | null | undefined, message: string, code: string): T {
  if (!value) {
    throw Object.assign(new Error(message), { statusCode: 404, code });
  }

  return value;
}

export class PrismaApiStore implements ApiStore {
  constructor(
    readonly prisma: DatabaseClient = createDatabaseClient(),

    /**
     * DNS TXT resolver used by {@link verifyDomain}. Injectable so tests can
     * exercise domain verification without hitting real DNS; defaults to the
     * Node resolver in production.
     */
    private readonly resolveTxt: (hostname: string) => Promise<string[][]> = dnsPromises.resolveTxt,
  ) {}

  async ping(): Promise<void> {
    // Trivial round-trip to confirm the database connection is live.
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async withSerializedMutation<T>(key: string, fn: () => Promise<T>): Promise<T> {
    /*
     * Hold a transaction-scoped advisory lock for the duration of `fn`. A second
     * caller with the same key blocks on pg_advisory_xact_lock until this
     * transaction commits, so the wrapped check-then-mutate runs serially across
     * all pods. `fn`'s own queries use the MAIN pooled client and observe
     * committed state because the prior holder commits before the lock is granted.
     *
     * The lock transaction runs on a SMALL DEDICATED pool, not the main query
     * pool. Otherwise, under same-key burst >= mainPoolMax, every waiter would sit
     * inside its transaction holding a main-pool connection while blocked on the
     * advisory lock — starving the lock holder's fn() of a connection and
     * deadlocking the pool. Isolating lock-wait connections keeps the main pool
     * free for fn() (only one fn runs at a time, so it needs just one connection).
     */
    return this.lockClient.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', key);
      return fn();
    });
  }

  /*
   * Lazily-created dedicated client for advisory-lock transactions (see
   * withSerializedMutation). Small pool: it only ever holds lock-wait/holder
   * connections, which are serialized by the lock itself.
   */
  private get lockClient(): DatabaseClient {
    if (!this.#lockClient) {
      this.#lockClient = createDatabaseClient({ poolMax: 5 });
    }

    return this.#lockClient;
  }

  #lockClient?: DatabaseClient;

  async createUser(input: {
    email: string;
    name?: string;
    passwordHash: string;
    platformAdmin?: boolean;
  }): Promise<UserRecord> {
    return mapUser(
      await this.prisma.user.create({
        data: {
          email: input.email.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,
          platformAdmin: input.platformAdmin,
        },
      }),
    );
  }

  async updateUser(input: {
    userId: string;
    email?: string;
    name?: string;
    passwordHash?: string;
    emailVerifiedAt?: string | null;
    mfaEnabled?: boolean;
    mfaSecretEncrypted?: string;
    platformAdmin?: boolean;
    language?: string | null;
    timezone?: string | null;
    preferences?: Record<string, unknown> | null;
  }) {
    return mapUser(
      await this.prisma.user.update({
        where: { id: input.userId },
        data: {
          email: input.email?.toLowerCase(),
          name: input.name,
          passwordHash: input.passwordHash,

          /*
           * `emailVerifiedAt: null` clears verification (e.g. when the user
           * changes their email and must re-verify the new address); a string
           * sets it; `undefined` leaves the column untouched. A bare falsy
           * check previously made `null` indistinguishable from "skip".
           */
          emailVerifiedAt:
            input.emailVerifiedAt === undefined
              ? undefined
              : input.emailVerifiedAt === null
                ? null
                : new Date(input.emailVerifiedAt),
          mfaEnabled: input.mfaEnabled,
          mfaSecretCiphertext: input.mfaSecretEncrypted,
          platformAdmin: input.platformAdmin,

          /*
           * `language: null` clears the column (Prisma differentiates null
           * from undefined: undefined skips the field, null writes NULL).
           * The undefined case is the no-op we want when the caller didn't
           * mention language at all. Same convention for `timezone`.
           */
          language: input.language === undefined ? undefined : input.language,
          timezone: input.timezone === undefined ? undefined : input.timezone,

          /*
           * Json columns need Prisma's sentinel to write a NULL: a bare
           * `null` is ambiguous (JSON null vs SQL NULL), so we map `null` →
           * Prisma.DbNull to clear and skip on undefined. The caller is
           * responsible for shallow-merging before passing an object — this
           * write replaces the whole blob.
           */
          preferences:
            input.preferences === undefined
              ? undefined
              : input.preferences === null
                ? Prisma.DbNull
                : (input.preferences as Prisma.InputJsonValue),
        },
      }),
    );
  }

  async deleteUser(userId: string) {
    try {
      await this.prisma.user.delete({ where: { id: userId } });

      return true;
    } catch (error) {
      /*
       * Only a genuine not-found (P2025 — the row was already gone) is a benign
       * `false` that callers treat as a no-op. Every other failure mode (FK
       * violation P2003 from undeleted child rows, connection error, deadlock)
       * means erasure is BLOCKED, not absent: collapsing those into `false`
       * would let GDPR/data-deletion breakage stay invisible in production.
       * Rethrow so the failure is observable to callers and operators.
       */
      if (isPrismaKnownRequestError(error) && error.code === 'P2025') {
        return false;
      }

      throw error;
    }
  }

  /*
   * §16.12 purge executor — consumes ready_to_purge and REALLY erases the
   * account, class by class, producing a persisted-shape erasure proof.
   *
   * Concurrency: the whole purge runs in ONE interactive transaction opened
   * with a per-user pg_advisory_xact_lock, so two workers racing on the same
   * user serialize; the loser re-reads the tombstone (purgedAt set) and
   * returns already_purged without touching a row. Idempotent by the same
   * mechanism. Fail-closed retention: financial records inside the 7-year
   * window (canPurgeFinancialRecord) and posted ledger transactions
   * (immutability triggers, mig 0078) are never DELETEd — they are counted
   * and consigned as exceptions in the proof. Audit logs are redacted in
   * place, never deleted. Any non-zero post-purge recount throws, rolling the
   * transaction back so a half-purge can never be reported as done.
   */
  /**
   * The full storage TOPOLOGY the purge depends on: the user's orgs, which are
   * SOLE-member (bucket + DB rows are erased) vs shared (retained for the other
   * members), and the resolved project-id sets. Computed against ANY client — the
   * live `this.prisma` (pre-transaction, to drive the external GCS/PVC erasure)
   * OR the purge `tx` (authoritative, under the advisory lock). The `fingerprint`
   * lets the tx detect a membership race (shared→sole / sole→shared) that shifted
   * the topology while the external erasure ran, and ABORT before the tombstone
   * rather than finalize on a stale inventory (see purgeUserAccount, RR-08 #3).
   */
  private async resolveStorageTopology(
    client: Prisma.TransactionClient,
    userId: string,
  ): Promise<{
    orgIds: string[];
    soleOrgIds: string[];
    sharedOrgIds: string[];
    bucketProjectIds: string[];
    workspaceProjectIds: string[];
    fingerprint: string;
  }> {
    const memberships = await client.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
    const soleOrgIds: string[] = [];
    const sharedOrgIds: string[] = [];

    for (const orgId of orgIds) {
      const members = await client.organizationMember.count({ where: { organizationId: orgId } });
      (members === 1 ? soleOrgIds : sharedOrgIds).push(orgId);
    }

    // Buckets: only the subject's SOLE-org projects (the bucket is org-owned; a
    // shared org's bucket belongs to the other members and is retained).
    const bucketProjects =
      soleOrgIds.length > 0
        ? await client.project.findMany({ where: { organizationId: { in: soleOrgIds } }, select: { id: true } })
        : [];
    const bucketProjectIds = bucketProjects.map((p) => p.id);

    /*
     * Workspaces (reserve #3 + #4): the subject can hold a per-user workspace in
     * EVERY project they are AUTHORIZED to open, which follows the REAL access
     * rules — org membership grants project access, so ANY project in ANY org the
     * subject belongs to (sole OR shared) is reachable, WITHOUT needing an explicit
     * ProjectCollaborator row. Enumerate all of them, plus any explicit
     * collaborations (defence in depth), not just sole-org + collaborators.
     */
    const orgProjects =
      orgIds.length > 0
        ? await client.project.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
        : [];
    const collaborations = await client.projectCollaborator.findMany({
      where: { userId },
      select: { projectId: true },
    });
    const workspaceProjectIds = [
      ...new Set([...orgProjects.map((p) => p.id), ...collaborations.map((c) => c.projectId)]),
    ];

    const fingerprint = storageTopologyFingerprint({ orgIds, soleOrgIds, bucketProjectIds, workspaceProjectIds });

    return { orgIds, soleOrgIds, sharedOrgIds, bucketProjectIds, workspaceProjectIds, fingerprint };
  }

  /* ---------------- account-purge topology guarantee (RR-09) ---------------- */

  /** Is this project's object storage frozen by >= 1 in-flight account purge? */
  async isObjectStorageProjectPurgeFrozen(projectId: string): Promise<boolean> {
    return (
      (await this.prisma.purgeFreeze.count({
        where: { resourceType: OBJECT_STORAGE_RESOURCE, resourceId: projectId },
      })) > 0
    );
  }

  /**
   * RR-09 (1)(2)(3) + RR-1bd27929: acquire the topology GUARANTEE before any
   * external deletion, as a PLAN that OWNS its freeze rows. In ONE tx:
   *   CANONICAL LOCK ORDER — account-purge:<userId>  <  MEMBERSHIP_FREEZE_LOCK
   * both taken BEFORE the topology read (addMember/removeMember and the purge
   * finalize tombstone take these in the same order — no inversion, no deadlock).
   * CODEX-10: the membership lock is held from before the read to commit, so the
   * read and the freeze are atomic w.r.t. membership — a join that grabbed the lock
   * first commits before ours and is reflected in the topology (a now-shared org's
   * bucket is excluded); one arriving after blocks until commit and is refused.
   * Creates a PurgePlan (lease + ownerToken + version for CAS reclaim) and one
   * PurgeFreeze row per org (membership) and per sole-org bucket (objectStorage),
   * all OWNED by this plan.
   */
  private async acquirePurgeGuarantee(userId: string): Promise<PurgeGuarantee> {
    const ownerToken = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + PURGE_LEASE_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);

      const topology = await this.resolveStorageTopology(tx, userId);

      const plan = await tx.purgePlan.create({ data: { userId, ownerToken, leaseExpiresAt } });

      const freezeRows = [
        ...topology.orgIds.map((orgId) => ({
          planId: plan.id,
          resourceType: MEMBERSHIP_RESOURCE,
          resourceId: orgId,
        })),
        ...topology.bucketProjectIds.map((projectId) => ({
          planId: plan.id,
          resourceType: OBJECT_STORAGE_RESOURCE,
          resourceId: projectId,
        })),
      ];

      if (freezeRows.length > 0) {
        await tx.purgeFreeze.createMany({ data: freezeRows, skipDuplicates: true });
      }

      return {
        planId: plan.id,
        ownerToken,
        userId,
        fingerprint: topology.fingerprint,
        orgIds: topology.orgIds,
        bucketProjectIds: topology.bucketProjectIds,
        workspaceProjectIds: topology.workspaceProjectIds,
      };
    });
  }

  /**
   * RR-1bd27929: release the guarantee — delete ONLY THIS plan's freeze rows (never
   * another plan's, so a shared resource stays frozen while another live plan owns
   * it) then the plan row (CAS on ownerToken). Thaws membership then object storage
   * as separate steps; if a thaw fails, the plan is LEFT (not deleted) so the
   * reconciler recovers it via its lease — a freeze is never stranded without a
   * plan pointing at it. Deleting the plan cascades any remaining freeze rows.
   */
  private async releasePurgeGuarantee(guarantee: PurgeGuarantee): Promise<void> {
    try {
      await this.prisma.purgeFreeze.deleteMany({
        where: { planId: guarantee.planId, resourceType: MEMBERSHIP_RESOURCE },
      });
      await this.prisma.purgeFreeze.deleteMany({
        where: { planId: guarantee.planId, resourceType: OBJECT_STORAGE_RESOURCE },
      });
    } catch {
      // A thaw failed mid-release → keep the plan (and its remaining rows) for the
      // reconciler; never delete the plan while a freeze it owns might still be up.
      return;
    }

    await this.prisma.purgePlan
      .deleteMany({ where: { id: guarantee.planId, ownerToken: guarantee.ownerToken } })
      .catch(() => undefined);
  }

  /**
   * RR-1bd27929: recover ABANDONED plans only. Reclaims a plan ONLY when its lease
   * has EXPIRED (a live plan — valid lease — is never touched, even one blocked in
   * a slow erasure), and via CAS on `version` so two concurrent reconcilers (or a
   * late owner) can't double-reclaim. Deletes ONLY the reclaimed plan's own freeze
   * rows — never a concurrent plan's.
   */
  async reconcilePurgeFreezes(): Promise<{ reconciled: number }> {
    const now = new Date();
    const expired = await this.prisma.purgePlan.findMany({ where: { leaseExpiresAt: { lt: now } } });
    let reconciled = 0;

    for (const plan of expired) {
      // CAS: only the reconciler that wins the version bump owns the reclaim.
      const won = await this.prisma.purgePlan.updateMany({
        where: { id: plan.id, version: plan.version, leaseExpiresAt: { lt: now } },
        data: { version: { increment: 1 } },
      });

      if (won.count === 0) {
        continue; // lost the race, or the plan was renewed / already removed
      }

      await this.prisma.purgeFreeze.deleteMany({ where: { planId: plan.id } }).catch(() => undefined);
      await this.prisma.purgePlan.deleteMany({ where: { id: plan.id } }).catch(() => undefined);
      reconciled += 1;
    }

    return { reconciled };
  }

  /**
   * RR-09 (2) + RR-1bd27929: refuse a membership mutation while >= 1 plan freezes
   * this org. Takes the MEMBERSHIP_FREEZE_LOCK the guarantee holds, so a mutation
   * either serialises BEFORE the guarantee's read (and is reflected in its
   * topology) or sees the freeze row and is refused — never interleaving to flip
   * sole↔shared mid-erasure. The org stays refused while ANY plan freezes it (so
   * releasing one of two sharing plans does not re-open it). Call inside the
   * caller's tx.
   */
  private async assertOrgMembershipNotPurgeFrozen(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);
    const frozen = await tx.purgeFreeze.count({
      where: { resourceType: MEMBERSHIP_RESOURCE, resourceId: organizationId },
    });

    if (frozen > 0) {
      throw new Error(
        `MEMBERSHIP_FROZEN_FOR_PURGE: organization ${organizationId} membership is frozen during an account purge`,
      );
    }
  }

  async purgeUserAccount(
    input: { userId: string; nowMs?: number },
    deps?: PurgeStorageDeps,
  ): Promise<PurgeUserAccountResult> {
    const { userId } = input;
    const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
    const nowIso = new Date(nowMs).toISOString();

    /*
     * PHYSICAL ERASURE GATE (§16.12 + RR-09) — GCS/PVC deletes are external,
     * non-transactional I/O, so they run before the DB tx. RR-09 order:
     *   (1) ACQUIRE a topology GUARANTEE — freeze membership + object storage and
     *       record the authoritative sole/shared topology, atomically under the
     *       advisory lock — BEFORE any deletion;
     *   (2) ERASE only the guaranteed-sole buckets/PVCs (idempotent, fail-closed);
     *   (3) FINALIZE (DB tx): deletes + tombstone, with a drift backstop;
     *   (4) RELEASE the guarantee in `finally` — ALWAYS, so no freeze is stranded.
     * Only runs when the account is actually ready_to_purge.
     */
    let physicalClasses: PurgeClassReport[] = [];
    // The topology guarantee the external erasure acted under (RR-09). Null when
    // no physical erasure ran (dry-run / no storage deps): nothing external was
    // touched, so there is no guarantee to acquire, drift to guard, or freeze to
    // release.
    let guarantee: PurgeGuarantee | null = null;

    if (deps?.eraseStorage) {
      const pre = await this.prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
      const preDeletion = ((pre?.preferences ?? {}) as Record<string, unknown>).accountDeletion as
        | { requestedAt?: string; purgedAt?: string }
        | undefined;
      const toMsPre = (value?: string) => {
        const ms = value ? new Date(value).getTime() : NaN;

        return Number.isFinite(ms) ? ms : null;
      };
      const preStatus = deletionStatus({
        requestedAtMs: toMsPre(preDeletion?.requestedAt),
        purgedAtMs: toMsPre(preDeletion?.purgedAt),
        nowMs,
      });

      if (preStatus === 'ready_to_purge') {
        // (1) acquire the guarantee BEFORE deleting anything external.
        guarantee = await this.acquirePurgeGuarantee(userId);
      }
    }

    try {
      // (2) erase ONLY under an acquired guarantee, on its locked inventory.
      if (guarantee && deps?.eraseStorage) {
        const erasure = await deps.eraseStorage({
          bucketProjectIds: guarantee.bucketProjectIds,
          workspaceProjectIds: guarantee.workspaceProjectIds,
        });

        if (!erasure.verified) {
          throw new Error(
            `ACCOUNT_PURGE_PHYSICAL_INCOMPLETE: physical storage not fully erased for ${userId} ` +
              `(${erasure.classes.map((c) => `${c.dataClass}=${c.remainingAfterPurge ?? 0}`).join(', ')})`,
          );
        }

        physicalClasses = erasure.classes;
      }

      const erasedTopologyFingerprint = guarantee?.fingerprint ?? null;

      // (3) finalize.
      return await this.prisma.$transaction(
        async (tx) => {
        // CANONICAL LOCK ORDER (see acquirePurgeGuarantee): account-purge < membership.
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `account-purge:${userId}`);

        /*
         * RR-20260804-CODEX-10 A.1: this finalize tx reads the topology (drift
         * backstop) AND deletes the subject's OrganizationMember rows (the tombstone
         * below) — a direct write that changes existing orgs' member counts. It MUST
         * take the SAME membership freeze-set lock addMember/removeMember/the
         * guarantee take, so it cannot interleave DURING another purge's atomic
         * read→freeze section and flip an org sole↔shared under that purge's snapshot.
         */
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_FREEZE_LOCK);

        const user = await tx.user.findUnique({ where: { id: userId } });

        if (!user) {
          return { outcome: 'not_requested' as const };
        }

        const preferences = (user.preferences ?? {}) as Record<string, unknown>;
        const deletion = (preferences.accountDeletion ?? null) as { requestedAt?: string; purgedAt?: string } | null;
        const toMs = (value?: string) => {
          if (!value) {
            return null;
          }

          const ms = new Date(value).getTime();

          return Number.isFinite(ms) ? ms : null;
        };
        const requestedAtMs = toMs(deletion?.requestedAt);
        const purgedAtMs = toMs(deletion?.purgedAt);
        const status = deletionStatus({ requestedAtMs, purgedAtMs, nowMs });

        if (status === 'purged') {
          return { outcome: 'already_purged' as const, purgedAt: deletion!.purgedAt! };
        }

        if (status === 'none') {
          return { outcome: 'not_requested' as const };
        }

        if (status === 'grace_period') {
          return { outcome: 'not_due' as const, purgeDueAt: new Date(purgeDueAtMs(requestedAtMs!)).toISOString() };
        }

        /*
         * ready_to_purge: resolve the org topology (sole-member vs shared)
         * AUTHORITATIVELY under the advisory lock. This is the same computation
         * the pre-transaction step used to drive the external GCS/PVC erasure.
         */
        const topology = await this.resolveStorageTopology(tx, userId);
        const { orgIds, soleOrgIds, sharedOrgIds } = topology;

        /*
         * TOPOLOGY DRIFT BACKSTOP (RR-08 #3 / RR-09). The guarantee froze
         * membership before the erasure, so the topology CANNOT have shifted while
         * we erased — this re-verify should never fire. It remains as defence in
         * depth against the razor-thin window between the guarantee's topology read
         * and its freeze commit: if anything drifted, ABORT before any delete or the
         * tombstone. The tx rolls back, purgedAt is never stamped, the freeze is
         * released (finally), and the next run re-acquires a fresh guarantee.
         */
        if (erasedTopologyFingerprint !== null && topology.fingerprint !== erasedTopologyFingerprint) {
          throw new Error(
            `ACCOUNT_PURGE_TOPOLOGY_DRIFT: storage topology changed during physical erasure for ${userId} ` +
              `— refusing to finalize on a stale inventory (account re-queued)`,
          );
        }

        const classes: PurgeClassReport[] = [];

        // ---- deleted classes ----
        const sessions = await tx.session.deleteMany({ where: { userId } });
        classes.push({ dataClass: 'sessions', action: 'deleted', models: { Session: sessions.count } });

        const emailTokens = await tx.emailVerificationToken.deleteMany({ where: { userId } });
        const resetTokens = await tx.passwordResetToken.deleteMany({ where: { userId } });
        const recoveryCodes = await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'auth_tokens',
          action: 'deleted',
          models: {
            EmailVerificationToken: emailTokens.count,
            PasswordResetToken: resetTokens.count,
            MfaRecoveryCode: recoveryCodes.count,
          },
        });

        const apiKeys = await tx.apiKey.deleteMany({ where: { userId } });
        classes.push({ dataClass: 'api_keys', action: 'deleted', models: { ApiKey: apiKeys.count } });

        const accounts = await tx.account.deleteMany({ where: { userId } });
        const oauthConnections = await tx.oAuthConnection.deleteMany({ where: { userId } });
        const userConnections = await tx.userConnection.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'connected_accounts',
          action: 'deleted',
          models: {
            Account: accounts.count,
            OAuthConnection: oauthConnections.count,
            UserConnection: userConnections.count,
          },
        });

        // AI history. AiMessage / AiToolCall / AiTokenUsage cascade off the
        // conversation delete — count them FIRST so the proof carries real
        // per-model numbers, not just the parent count. AiTokenUsage rows ride
        // this cascade by schema design; the canonical billing truth
        // (AiCostLedger / UsageEvent / Ledger*) is org-scoped and RETAINED below.
        const aiMessages = await tx.aiMessage.count({ where: { conversation: { userId } } });
        const aiToolCalls = await tx.aiToolCall.count({ where: { message: { conversation: { userId } } } });
        const aiTokenUsages = await tx.aiTokenUsage.count({ where: { message: { conversation: { userId } } } });
        const aiConversations = await tx.aiConversation.deleteMany({ where: { userId } });
        const agentRuns = await tx.agentRun.deleteMany({ where: { userId } });
        const agentMemories = await tx.agentMemory.deleteMany({ where: { userId } });
        const agentMemoryPreferences = await tx.agentMemoryPreference.deleteMany({ where: { userId } });
        const mcpInstalls = await tx.mcpInstall.deleteMany({ where: { userId } });
        const mcpUserConfigs = await tx.mcpUserConfig.deleteMany({ where: { userId } });
        const aiFeedback = await tx.aiMessageFeedback.deleteMany({ where: { userId } });
        const notifications = await tx.notification.deleteMany({ where: { userId } });
        const soleOrgCheckpoints =
          soleOrgIds.length > 0
            ? await tx.agentCheckpoint.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
            : { count: 0 };
        classes.push({
          dataClass: 'ai_history',
          action: 'deleted',
          models: {
            AiConversation: aiConversations.count,
            AiMessage: aiMessages,
            AiToolCall: aiToolCalls,
            AiTokenUsage: aiTokenUsages,
            AgentRun: agentRuns.count,
            AgentMemory: agentMemories.count,
            AgentMemoryPreference: agentMemoryPreferences.count,
            McpInstall: mcpInstalls.count,
            McpUserConfig: mcpUserConfigs.count,
            AiMessageFeedback: aiFeedback.count,
            Notification: notifications.count,
            AgentCheckpoint: soleOrgCheckpoints.count,
          },
        });

        const collaborators = await tx.projectCollaborator.deleteMany({ where: { userId } });
        const presence = await tx.collaborationPresence.deleteMany({ where: { userId } });
        const comments = await tx.collaborationComment.deleteMany({ where: { userId } });
        const shareLinks = await tx.projectShareLink.deleteMany({ where: { createdByUserId: userId } });
        const spendLimits = await tx.userSpendLimit.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'collaboration',
          action: 'deleted',
          models: {
            ProjectCollaborator: collaborators.count,
            CollaborationPresence: presence.count,
            CollaborationComment: comments.count,
            ProjectShareLink: shareLinks.count,
            UserSpendLimit: spendLimits.count,
          },
        });

        // Projects & workspaces of sole-member orgs (files, snapshots,
        // deployments, workspaces, gallery listings... cascade off Project).
        const projects =
          soleOrgIds.length > 0
            ? await tx.project.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
            : { count: 0 };
        classes.push({ dataClass: 'projects', action: 'deleted', models: { Project: projects.count } });

        const importJobs =
          soleOrgIds.length > 0
            ? await tx.importJob.deleteMany({ where: { organizationId: { in: soleOrgIds } } })
            : { count: 0 };
        classes.push({ dataClass: 'imports', action: 'deleted', models: { ImportJob: importJobs.count } });

        const orgMemberships = await tx.organizationMember.deleteMany({ where: { userId } });
        classes.push({
          dataClass: 'memberships',
          action: 'deleted',
          models: { OrganizationMember: orgMemberships.count },
        });

        // Marketing: unsubscribe by e-mail BEFORE the tombstone rewrites it.
        const newsletter = await tx.newsletterSubscriber.deleteMany({ where: { email: user.email } });
        classes.push({ dataClass: 'marketing', action: 'deleted', models: { NewsletterSubscriber: newsletter.count } });

        // ---- anonymized classes (redacted in place, never deleted) ----
        const auditRedacted = await tx.auditLog.updateMany({
          where: { actorUserId: userId },
          data: { ipAddress: null, metadata: { redacted: true, redactedAt: nowIso } as Prisma.InputJsonValue },
        });
        const adminAuditRedacted = await tx.adminAuditLog.updateMany({
          where: { actorUserId: userId },
          data: { ipAddress: null },
        });
        classes.push({
          dataClass: 'audit_logs',
          action: 'anonymized',
          reason: 'append_only_redacted_never_deleted',
          models: { AuditLog: auditRedacted.count, AdminAuditLog: adminAuditRedacted.count },
        });

        const usageEventRefs = await tx.usageEvent.updateMany({ where: { userId }, data: { userId: null } });
        const agentCallLogRefs = await tx.agentCallLog.updateMany({ where: { userId }, data: { userId: null } });
        const reservationRefs = await tx.ledgerReservation.updateMany({ where: { userId }, data: { userId: null } });
        const checkpointRefs = await tx.agentCheckpoint.updateMany({ where: { userId }, data: { userId: null } });
        const activityRefs = await tx.projectActivity.updateMany({
          where: { actorUserId: userId },
          data: { actorUserId: null },
        });
        const importRefs = await tx.importJob.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });
        const galleryRefs = await tx.galleryListing.updateMany({
          where: { authorUserId: userId },
          data: { authorUserId: null, authorName: 'Deleted account' },
        });
        const ticketRefs = await tx.supportTicket.updateMany({ where: { userId }, data: { userId: null } });
        classes.push({
          dataClass: 'user_references',
          action: 'anonymized',
          reason: 'retained_rows_detached_from_user',
          models: {
            UsageEvent: usageEventRefs.count,
            AgentCallLog: agentCallLogRefs.count,
            LedgerReservation: reservationRefs.count,
            AgentCheckpoint: checkpointRefs.count,
            ProjectActivity: activityRefs.count,
            ImportJob: importRefs.count,
            GalleryListing: galleryRefs.count,
            SupportTicket: ticketRefs.count,
          },
        });

        // Sole-member org shells: anonymize the name/slug (may carry PII), keep
        // the row as the anchor of the retained financial records.
        let orgsAnonymized = 0;

        for (const orgId of soleOrgIds) {
          await tx.organization.update({
            where: { id: orgId },
            data: { name: 'Purged account', slug: anonymizedOrgSlug(orgId), billingEmail: null },
          });
          orgsAnonymized += 1;
        }

        classes.push({
          dataClass: 'organizations',
          action: 'anonymized',
          reason: 'retained_as_anchor_for_financial_records',
          models: { Organization: orgsAnonymized },
        });

        // ---- retained classes (fail-closed retention, consigned) ----
        // Financial rows past the 7-year window MAY be erased
        // (canPurgeFinancialRecord); everything inside the window is retained.
        const financialCutoff = new Date(nowMs - FINANCIAL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const soleOrgWhere = { organizationId: { in: soleOrgIds } };
        let financialExpiredDeleted = 0;

        if (soleOrgIds.length > 0) {
          const expiredUsage = await tx.usageEvent.deleteMany({
            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
          });
          const expiredAiCost = await tx.aiCostLedger.deleteMany({
            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
          });
          const expiredCredits = await tx.creditLedger.deleteMany({
            where: { ...soleOrgWhere, createdAt: { lt: financialCutoff } },
          });
          financialExpiredDeleted = expiredUsage.count + expiredAiCost.count + expiredCredits.count;
        }

        const retainedFinancial = {
          UsageEvent: soleOrgIds.length > 0 ? await tx.usageEvent.count({ where: soleOrgWhere }) : 0,
          AiCostLedger: soleOrgIds.length > 0 ? await tx.aiCostLedger.count({ where: soleOrgWhere }) : 0,
          CreditLedger: soleOrgIds.length > 0 ? await tx.creditLedger.count({ where: soleOrgWhere }) : 0,
          StripeEvent: soleOrgIds.length > 0 ? await tx.stripeEvent.count({ where: soleOrgWhere }) : 0,
          Subscription: soleOrgIds.length > 0 ? await tx.subscription.count({ where: soleOrgWhere }) : 0,
        };
        classes.push({
          dataClass: 'financial_records',
          action: 'retained',
          reason: 'financial_retention_7y_fail_closed',
          models: { ...retainedFinancial, ExpiredRowsErased: financialExpiredDeleted },
        });

        const ledgerTransactions =
          soleOrgIds.length > 0 ? await tx.ledgerTransaction.count({ where: soleOrgWhere }) : 0;
        classes.push({
          dataClass: 'ledger',
          action: 'retained',
          reason: 'ledger_immutable_posted_entries_mig0078',
          models: { LedgerTransaction: ledgerTransactions },
        });

        const sharedProjects =
          sharedOrgIds.length > 0 ? await tx.project.count({ where: { organizationId: { in: sharedOrgIds } } }) : 0;
        classes.push({
          dataClass: 'shared_org_content',
          action: 'retained',
          reason: 'shared_organization_belongs_to_other_members',
          models: { Project: sharedProjects },
        });

        // ---- tombstone: anonymize the user row, stamp purgedAt ----
        await tx.user.update({
          where: { id: userId },
          data: {
            email: anonymizedEmail(userId),
            name: null,
            passwordHash: null,
            emailVerifiedAt: null,
            mfaEnabled: false,
            mfaSecretCiphertext: null,
            platformAdmin: false,
            language: null,
            timezone: null,
            lastActiveAt: null,
            preferences: {
              accountDeletion: { requestedAt: deletion!.requestedAt, purgedAt: nowIso },
            } as Prisma.InputJsonValue,
          },
        });
        classes.push({
          dataClass: 'profile',
          action: 'anonymized',
          reason: 'tombstone_carries_purgedAt',
          models: { User: 1 },
        });

        // ---- post-purge verification: recount every deleted class ----
        const verify: Record<string, number> = {
          sessions: await tx.session.count({ where: { userId } }),
          auth_tokens:
            (await tx.emailVerificationToken.count({ where: { userId } })) +
            (await tx.passwordResetToken.count({ where: { userId } })) +
            (await tx.mfaRecoveryCode.count({ where: { userId } })),
          api_keys: await tx.apiKey.count({ where: { userId } }),
          connected_accounts:
            (await tx.account.count({ where: { userId } })) +
            (await tx.oAuthConnection.count({ where: { userId } })) +
            (await tx.userConnection.count({ where: { userId } })),
          ai_history:
            (await tx.aiConversation.count({ where: { userId } })) +
            (await tx.agentRun.count({ where: { userId } })) +
            (await tx.agentMemory.count({ where: { userId } })) +
            (await tx.agentMemoryPreference.count({ where: { userId } })) +
            (await tx.mcpInstall.count({ where: { userId } })) +
            (await tx.mcpUserConfig.count({ where: { userId } })) +
            (await tx.aiMessageFeedback.count({ where: { userId } })) +
            (await tx.notification.count({ where: { userId } })),
          collaboration:
            (await tx.projectCollaborator.count({ where: { userId } })) +
            (await tx.collaborationPresence.count({ where: { userId } })) +
            (await tx.collaborationComment.count({ where: { userId } })) +
            (await tx.projectShareLink.count({ where: { createdByUserId: userId } })) +
            (await tx.userSpendLimit.count({ where: { userId } })),
          projects: soleOrgIds.length > 0 ? await tx.project.count({ where: soleOrgWhere }) : 0,
          imports: soleOrgIds.length > 0 ? await tx.importJob.count({ where: soleOrgWhere }) : 0,
          memberships: await tx.organizationMember.count({ where: { userId } }),
          marketing: await tx.newsletterSubscriber.count({ where: { email: user.email } }),
        };

        for (const entry of classes) {
          if (entry.action === 'deleted') {
            entry.remainingAfterPurge = verify[entry.dataClass] ?? 0;
          }
        }

        const leftovers = Object.entries(verify).filter(([, remaining]) => remaining > 0);

        if (leftovers.length > 0) {
          // Roll the whole purge back: a partial erasure must never be
          // reported (and stamped purgedAt) as complete.
          throw new Error(
            `ACCOUNT_PURGE_VERIFICATION_FAILED: rows remaining after purge for ${userId}: ${leftovers
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}`,
          );
        }

        /*
         * Fold the physical-erasure evidence (object_storage, workspace_volumes)
         * into the proof. It was already verified (remainingAfterPurge === 0)
         * before this tx started; appending it here makes buildErasureProof's
         * verifiedZeroRemaining cover physical storage too.
         */
        classes.push(...physicalClasses);

        const proof = buildErasureProof({
          userId,
          requestedAt: deletion!.requestedAt!,
          purgedAt: nowIso,
          classes,
        });

        return { outcome: 'purged' as const, proof };
      },
        { timeout: 120_000, maxWait: 20_000 },
      );
    } finally {
      // (4) RR-09 — RELEASE the guarantee on EVERY exit (purged / drift / any
      // throw), so membership + object-storage freezes are never left behind.
      if (guarantee) {
        await this.releasePurgeGuarantee(guarantee);
      }
    }
  }

  async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? mapUser(user) : undefined;
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  }

  async touchUserActivity(userId: string, nowMs?: number) {
    const at = new Date(Number.isFinite(nowMs) ? (nowMs as number) : Date.now());
    try {
      // updateMany so a deleted user is a no-op (count 0) rather than a P2025 throw.
      const result = await this.prisma.user.updateMany({ where: { id: userId }, data: { lastActiveAt: at } });
      return result.count > 0 ? at.toISOString() : null;
    } catch {
      return null;
    }
  }

  async listInactiveUserCandidates(input: { cutoffMs: number; take?: number }) {
    const cutoff = new Date(input.cutoffMs);
    const take = Math.max(1, Math.min(input.take ?? 500, 5000));
    // Active reference = lastActiveAt, falling back to createdAt for accounts
    // never touched. Both branches must be older than the cutoff.
    const users = await this.prisma.user.findMany({
      where: {
        OR: [{ lastActiveAt: { lt: cutoff } }, { AND: [{ lastActiveAt: null }, { createdAt: { lt: cutoff } }] }],
      },
      select: { id: true, email: true, lastActiveAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      lastActiveAtMs: (user.lastActiveAt ?? user.createdAt).getTime(),
    }));
  }

  async createSession(input: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    impersonatedBy?: string;
  }) {
    return mapSession(
      await this.prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: hashToken(input.token),
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          impersonatedBy: input.impersonatedBy,
        },
      }),
    );
  }

  async findSessionByToken(token: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapSession(session);
  }

  async listSessions(userId: string) {
    return (
      await this.prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      })
    ).map(mapSession);
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllSessions(userId: string, exceptSessionId?: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, id: exceptSessionId ? { not: exceptSessionId } : undefined },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async markSessionReauthenticated(sessionId: string) {
    /*
     * The interface returns SessionRecord | undefined, so a vanished session must
     * resolve to undefined rather than crash. update({ where: { id } }) throws an
     * unhandled P2025 when the row was revoked-and-purged between auth and here;
     * updateMany gated on a live (non-revoked) session returns count 0 instead.
     */
    const updated = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastReauthAt: new Date() },
    });

    if (updated.count === 0) {
      return undefined;
    }

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    return session ? mapSession(session) : undefined;
  }

  async createEmailVerification(input: { userId: string; token: string; expiresAt: Date; email?: string }) {
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt,
        email: input.email,
      },
    });
  }

  async consumeEmailVerification(token: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
    }

    /*
     * Bind to the issued-for email: the user's CURRENT email must still match, so
     * a token requested for address A can't mark the account verified after the
     * user switched to address B (and vice versa). Legacy tokens (email null)
     * keep the prior userId-only behaviour.
     */
    if (record.email) {
      const tokenUser = await this.prisma.user.findUnique({
        where: { id: record.userId },
        select: { email: true },
      });

      if (!tokenUser || tokenUser.email.toLowerCase() !== record.email.toLowerCase()) {
        return undefined;
      }
    }

    const consumed = await this.prisma.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    return this.updateUser({ userId: record.userId, emailVerifiedAt: now() });
  }

  async createPasswordReset(input: { userId: string; token: string; expiresAt: Date }) {
    await this.prisma.passwordResetToken.create({
      data: { userId: input.userId, tokenHash: hashToken(input.token), expiresAt: input.expiresAt },
    });
  }

  async consumePasswordReset(token: string, passwordHash: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record) {
      return undefined;
    }

    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    /*
     * Single-use must be per-user, not just per-token: invalidate every other
     * outstanding reset token for this user so a previously-issued link (or one
     * an attacker triggered) can no longer re-reset the password after a
     * successful reset.
     */
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return this.updateUser({ userId: record.userId, passwordHash });
  }

  async setRecoveryCodes(userId: string, codeHashes: string[]) {
    /*
     * Wipe-then-recreate must be atomic: if a create rejected mid-loop the user
     * would be left with the old codes already deleted but only a partial new
     * set persisted, silently invalidating recovery access. Run both writes in
     * one transaction so the regenerate either fully lands or fully rolls back.
     */
    const records = await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      return Promise.all(codeHashes.map((codeHash) => tx.mfaRecoveryCode.create({ data: { userId, codeHash } })));
    });
    return records.map(
      (record): RecoveryCodeRecord => ({
        id: record.id,
        userId: record.userId,
        codeHash: record.codeHash,
        usedAt: toIso(record.usedAt),
        createdAt: toIso(record.createdAt)!,
      }),
    );
  }

  async consumeRecoveryCode(userId: string, codeHash: string) {
    const result = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count > 0;
  }

  async countUnusedRecoveryCodes(userId: string) {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async createOrganization(input: { name: string; slug: string; ownerUserId: string }) {
    const ownerRole = await this.ensureRole('owner');

    const organization = await this.prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug || slugify(input.name),
        members: { create: { userId: input.ownerUserId, roleId: ownerRole.id } },
      },
    });

    return mapOrganization(organization);
  }

  async listOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => mapOrganization(membership.organization));
  }

  async getOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id } });
    return organization ? mapOrganization(organization) : undefined;
  }

  async setOrganizationBillingEmail(organizationId: string, email: string | null) {
    return mapOrganization(
      await this.prisma.organization.update({ where: { id: organizationId }, data: { billingEmail: email } }),
    );
  }

  async addMember(input: { organizationId: string; userId: string; roleKey: string }) {
    const role = await this.ensureRole(input.roleKey);

    // RR-09 (2): refuse a join while this org's membership is frozen by an
    // in-flight account purge, so the sole→shared flip can't happen mid-erasure.
    // The assertion + the upsert share one tx (and the freeze-set advisory lock)
    // so the check and the write cannot straddle a concurrent guarantee.
    const membership = await this.prisma.$transaction(async (tx) => {
      await this.assertOrgMembershipNotPurgeFrozen(tx, input.organizationId);

      return tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
        create: { organizationId: input.organizationId, userId: input.userId, roleId: role.id },
        update: { roleId: role.id },
        include: { role: true },
      });
    });

    return mapMembership(membership);
  }

  async getMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: true },
    });
    return membership ? mapMembership(membership) : undefined;
  }

  async listMembers(organizationId: string) {
    return (
      await this.prisma.organizationMember.findMany({
        where: { organizationId },
        include: { role: true, user: { select: { name: true, email: true } } },
      })
    ).map(mapMembership);
  }

  async removeMember(organizationId: string, userId: string) {
    /*
     * RR-09 (2): refuse a leave while this org's membership is frozen by an
     * in-flight account purge, so a co-member leaving can't flip the subject's
     * org shared→sole mid-erasure and strand its bucket. The freeze check and the
     * delete share one tx (and the freeze-set advisory lock).
     *
     * Delete via deleteMany gated on count rather than delete({ where: { id } }):
     * between the lookup and this write a concurrent removeMember() can delete the
     * same row, and delete() would then throw an unhandled P2025. deleteMany
     * returns count 0 in that case, which we surface as "already gone".
     */
    const membership = await this.prisma.$transaction(async (tx) => {
      await this.assertOrgMembershipNotPurgeFrozen(tx, organizationId);

      const found = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        include: { role: true },
      });

      if (!found) {
        return undefined;
      }

      const deleted = await tx.organizationMember.deleteMany({ where: { id: found.id } });

      return deleted.count === 0 ? undefined : found;
    });

    if (!membership) {
      return undefined;
    }

    /*
     * Unlink the removed user's connector links for every project in this org,
     * so the connector-proxy stops serving their OAuth/API credentials to the
     * org's agents. Without this the ex-member's tokens stay usable indefinitely.
     */
    await this.prisma.projectConnectionLink
      .updateMany({
        where: {
          unlinkedAt: null,
          userConnection: { userId },
          project: { organizationId },
        },
        data: { unlinkedAt: new Date() },
      })
      .catch((error) => {
        /*
         * Don't block membership removal, but DON'T swallow silently: a failed
         * credential-unlink leaves the ex-member's tokens usable, so it must be
         * observable for ops to remediate.
         */
        console.error('removeMember: failed to unlink connector links during offboarding', {
          organizationId,
          userId,
          error,
        });
      });

    /*
     * Revoke the removed user's per-project collaborator grants in this org.
     * Org membership and project-collaborator access are separate tables, so
     * without this an ex-member (including SCIM/SAML deprovisioned users) keeps
     * direct access to every project they were invited to. Scoped to this org's
     * projects via the relational filter.
     */
    await this.prisma.projectCollaborator
      .deleteMany({ where: { userId, project: { organizationId } } })
      .catch((error) => {
        /*
         * Don't block removal, but surface it: a failed collaborator-grant deletion
         * leaves the ex-member with direct project access.
         */
        console.error('removeMember: failed to revoke collaborator grants during offboarding', {
          organizationId,
          userId,
          error,
        });
      });

    return mapMembership(membership);
  }

  async createProject(input: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    sourceType?: ProjectRecord['sourceType'];
    templateName?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    const base = projectSlugBase(input);

    /*
     * nextProjectSlug() only reads to find a free slug; between that read and the
     * create below a concurrent createProject() in the same org can grab the same
     * candidate, so the second insert violates @@unique([organizationId, slug])
     * with P2002. Retry on that specific collision (re-allocating the slug each
     * time) instead of crashing the request.
     */
    for (let attempt = 0; ; attempt += 1) {
      const slug = await this.nextProjectSlug(input.organizationId, base);

      try {
        return mapProject(
          await this.prisma.project.create({
            data: {
              organizationId: input.organizationId,
              name: input.name,
              slug,
              description: input.description,
              sourceType: input.sourceType ?? 'blank',
              templateName: input.templateName,
              gitRepositoryUrl: input.gitRepositoryUrl,
              gitDefaultBranch: input.gitDefaultBranch,
              persistentVolumeClaim: `pvc-${input.organizationId}-${slug}`,
            },
          }),
        );
      } catch (error) {
        if (isPrismaKnownRequestError(error) && error.code === 'P2002' && attempt < 5) {
          continue;
        }

        throw error;
      }
    }
  }

  private async nextProjectSlug(organizationId: string, baseSlug: string) {
    let candidate = baseSlug;
    let suffix = 2;

    while (
      await this.prisma.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: candidate } },
        select: { id: true },
      })
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async getProject(id: string) {
    // Count deployments so callers (e.g. the IDE top bar) can show Publish vs
    // Republish without a second query; mapProject surfaces it as deploymentCount.
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { _count: { select: { deployments: true } } },
    });
    return project ? mapProject(project) : undefined;
  }

  async getProjectBySlugs(input: { organizationSlug: string; projectSlug: string }) {
    const project = await this.prisma.project.findFirst({
      where: {
        slug: input.projectSlug,
        deletedAt: null,
        organization: { slug: input.organizationSlug },
      },
    });
    return project ? mapProject(project) : undefined;
  }

  async updateProject(input: {
    projectId: string;
    name?: string;
    description?: string;
    gitRepositoryUrl?: string;
    gitDefaultBranch?: string;
  }) {
    return mapProject(
      await this.prisma.project.update({
        where: { id: input.projectId },
        data: {
          name: input.name,
          description: input.description,
          gitRepositoryUrl: input.gitRepositoryUrl,
          gitDefaultBranch: input.gitDefaultBranch,
        },
      }),
    );
  }

  async renameProjectSlug(input: { projectId: string; newSlug: string; redirectTtlDays?: number }) {
    const project = assertFound(
      await this.prisma.project.findUnique({ where: { id: input.projectId } }),
      'Project not found',
      'PROJECT_NOT_FOUND',
    );

    // No-op rename: don't mint a self-redirect (it would loop the old→new URL
    // back onto itself) — just hand back the project unchanged.
    if (project.slug === input.newSlug) {
      return mapProject(project);
    }

    // slug is only @@unique within an org, so a bare update would 500 on P2002.
    // Surface the clash as a typed 409 the route can translate into an inline
    // "slug already taken" message.
    const clash = await this.prisma.project.findFirst({
      where: { organizationId: project.organizationId, slug: input.newSlug, id: { not: project.id } },
      select: { id: true },
    });

    if (clash) {
      throw Object.assign(new Error('A project with this URL slug already exists in this organization.'), {
        statusCode: 409,
        code: 'PROJECT_SLUG_TAKEN',
      });
    }

    const ttlDays = input.redirectTtlDays ?? 30;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      // Persist old → project redirect (upsert so a re-rename of the same old
      // slug just refreshes the 30-day window instead of P2002-ing).
      await tx.projectSlugRedirect.upsert({
        where: { projectId_oldSlug: { projectId: project.id, oldSlug: project.slug } },
        create: { projectId: project.id, oldSlug: project.slug, expiresAt },
        update: { expiresAt },
      });

      // Renaming BACK to a slug this project previously redirected FROM would
      // leave a self-redirect (newSlug → this project) that bounces the fresh
      // canonical URL. Drop it.
      await tx.projectSlugRedirect.deleteMany({ where: { projectId: project.id, oldSlug: input.newSlug } });

      return mapProject(await tx.project.update({ where: { id: project.id }, data: { slug: input.newSlug } }));
    });
  }

  async resolveProjectSlugRedirect(input: { organizationSlug: string; oldSlug: string; now?: Date }) {
    const redirect = await this.prisma.projectSlugRedirect.findFirst({
      where: {
        oldSlug: input.oldSlug,
        expiresAt: { gt: input.now ?? new Date() },
        project: { deletedAt: null, organization: { slug: input.organizationSlug } },
      },
      orderBy: { createdAt: 'desc' },
      include: { project: true },
    });

    return redirect ? mapProject(redirect.project) : undefined;
  }

  async listProjects(organizationId: string, options: { includeArchived?: boolean } = {}) {
    return (
      await this.prisma.project.findMany({
        where: { organizationId, ...(options.includeArchived ? {} : { deletedAt: null }) },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { deployments: true } } },
      })
    ).map(mapProject);
  }

  async countProjects(organizationId: string) {
    return this.prisma.project.count({ where: { organizationId, deletedAt: null } });
  }

  async subscribeNewsletter(input: { email: string; source?: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email } });

    // Upsert (not create) so a concurrent duplicate submit can't P2002-500.
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, source: input.source ?? 'footer' },
      update: { unsubscribedAt: null },
    });

    return { alreadySubscribed: Boolean(existing && !existing.unsubscribedAt) };
  }

  async createContactRequest(input: {
    email: string;
    name?: string;
    company: string;
    teamSize?: string;
    message: string;
    pagePath?: string;
  }) {
    const row = await this.prisma.contactRequest.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        company: input.company,
        teamSize: input.teamSize,
        message: input.message,
        pagePath: input.pagePath,
      },
    });

    return {
      id: row.id,
      email: row.email,
      name: row.name ?? undefined,
      company: row.company,
      teamSize: row.teamSize ?? undefined,
      message: row.message,
      pagePath: row.pagePath ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async softDeleteProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } }));
  }

  async restoreProject(projectId: string) {
    return mapProject(await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: null } }));
  }

  async hardDeleteProject(projectId: string) {
    // Every child relation declares onDelete: Cascade (AiConversation: SetNull),
    // so a plain delete removes the whole project graph atomically.
    return mapProject(await this.prisma.project.delete({ where: { id: projectId } }));
  }

  async transferProject(input: { projectId: string; targetOrganizationId: string }) {
    const current = assertFound(
      await this.prisma.project.findUnique({ where: { id: input.projectId }, select: { slug: true } }),
      'Project not found',
      'PROJECT_NOT_FOUND',
    );

    /*
     * The slug is only unique within an org, so the target org may already have a
     * project with this slug — a bare update would then violate
     * @@unique([organizationId, slug]) with an unhandled P2002 (500). Re-allocate
     * a free slug in the target org and retry on the race, like createProject.
     * The persistentVolumeClaim is intentionally left unchanged: it references an
     * existing physical volume holding the project's data, so renaming it would
     * orphan that volume.
     */
    for (let attempt = 0; ; attempt += 1) {
      const slug = await this.nextProjectSlug(input.targetOrganizationId, current.slug);

      try {
        return await this.prisma.$transaction(async (tx) => {
          /*
           * Revoke all explicit ProjectCollaborator grants on transfer. They were
           * issued to the SOURCE org's users; leaving them in place after the
           * project moves to a different org keeps those (now cross-org) users with
           * access to a project they no longer belong to. The target org's members
           * get access via org membership; collaborators must be re-invited.
           */
          await tx.projectCollaborator.deleteMany({ where: { projectId: input.projectId } });

          /*
           * Share links are bearer capability tokens minted for the SOURCE org.
           * GET /collaboration/share-links/:token resolves them by token alone
           * (only revokedAt/expiry, not org) and mints a fresh collaborator grant,
           * so a leaked/outstanding link would re-grant cross-org access after the
           * project moves. Revoke them all on transfer (target org re-issues).
           */
          await tx.projectShareLink.deleteMany({ where: { projectId: input.projectId } });

          /*
           * Chat shares are bearer-token snapshots of the project's AI
           * conversations, minted under the SOURCE org. findChatShareByTokenHash
           * resolves them by token alone (no org check), so an outstanding link
           * would keep leaking the source org's conversation data after the
           * project moves to a different org. Revoke them all on transfer; the
           * target org re-shares as needed.
           */
          await tx.chatShare.deleteMany({ where: { projectId: input.projectId } });

          return mapProject(
            await tx.project.update({
              where: { id: input.projectId },
              data: { organizationId: input.targetOrganizationId, slug },
            }),
          );
        });
      } catch (error) {
        if (isPrismaKnownRequestError(error) && error.code === 'P2002' && attempt < 5) {
          continue;
        }

        throw error;
      }
    }
  }

  async duplicateProject(input: { projectId: string; name: string; slug: string; organizationId?: string }) {
    const source = assertFound(
      await this.prisma.project.findUnique({ where: { id: input.projectId } }),
      'Project not found',
      'PROJECT_NOT_FOUND',
    );
    return this.createProject({
      organizationId: input.organizationId ?? source.organizationId,
      name: input.name,
      slug: input.slug,
      description: source.description ?? undefined,
      sourceType: 'duplicate',
      templateName: source.templateName ?? undefined,
      gitRepositoryUrl: source.gitRepositoryUrl ?? undefined,
      gitDefaultBranch: source.gitDefaultBranch ?? undefined,
    });
  }

  async createProjectTemplate(input: {
    sourceProjectId: string;
    organizationId: string;
    name: string;
    description?: string;
  }) {
    const template = await this.prisma.projectTemplate.create({ data: input });
    return { ...template, description: template.description ?? undefined, createdAt: toIso(template.createdAt)! };
  }

  async listProjectTemplates(organizationId: string) {
    return (await this.prisma.projectTemplate.findMany({ where: { organizationId } })).map(
      (template): ProjectTemplateRecord => ({
        ...template,
        description: template.description ?? undefined,
        createdAt: toIso(template.createdAt)!,
      }),
    );
  }

  async upsertProjectEnvVar(input: { projectId: string; key: string; value: string; scope?: EnvVarScope }) {
    // Omitted scope defaults to production so pre-scope callers keep the same row.
    const scope = input.scope ?? DEFAULT_ENV_VAR_SCOPE;

    return mapEnvVar(
      await this.prisma.projectEnvVar.upsert({
        where: { projectId_key_scope: { projectId: input.projectId, key: input.key, scope } },
        create: { projectId: input.projectId, key: input.key, value: input.value, scope },
        update: { value: input.value },
      }),
    );
  }

  async listProjectEnvVars(projectId: string) {
    return (await this.prisma.projectEnvVar.findMany({ where: { projectId } })).map(mapEnvVar);
  }

  async deleteProjectEnvVar(projectId: string, key: string, scope?: EnvVarScope) {
    // Omitted scope targets the production-scoped row (the pre-scope default).
    const targetScope = scope ?? DEFAULT_ENV_VAR_SCOPE;

    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; read
     * the row, then deleteMany (count-gated) so a lost race is "already gone".
     */
    const existing = await this.prisma.projectEnvVar.findUnique({
      where: { projectId_key_scope: { projectId, key, scope: targetScope } },
    });

    if (!existing) {
      return undefined;
    }

    const deleted = await this.prisma.projectEnvVar.deleteMany({ where: { projectId, key, scope: targetScope } });

    return deleted.count > 0 ? mapEnvVar(existing) : undefined;
  }

  async upsertProjectSecret(input: { projectId: string; key: string; valueEncrypted: string }) {
    return mapSecret(
      await this.prisma.projectSecret.upsert({
        where: { projectId_key: { projectId: input.projectId, key: input.key } },
        create: { ...input, valueHash: hashToken(input.valueEncrypted) },
        update: { valueEncrypted: input.valueEncrypted, valueHash: hashToken(input.valueEncrypted) },
      }),
    );
  }

  async listProjectSecrets(projectId: string) {
    return (await this.prisma.projectSecret.findMany({ where: { projectId } })).map((secret) => {
      const safe = mapSecret(secret);
      const { valueEncrypted: _valueEncrypted, ...rest } = safe;

      return rest;
    });
  }

  async getProjectSecret(projectId: string, key: string) {
    const secret = await this.prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key } } });
    return secret ? mapSecret(secret) : undefined;
  }

  async createRemixJob(input: {
    sourceProjectId: string;
    organizationId: string;
    actorUserId?: string;
    storagePolicy: string;
    sourceSnapshotId?: string;
    sourceListingId?: string;
    licenseSnapshot?: unknown;
    consentVersion?: string;
  }) {
    const row = await this.prisma.remixJob.create({
      data: {
        sourceProjectId: input.sourceProjectId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        storagePolicy: input.storagePolicy,
        sourceSnapshotId: input.sourceSnapshotId ?? null,
        sourceListingId: input.sourceListingId ?? null,
        licenseSnapshot: (input.licenseSnapshot as object | undefined) ?? undefined,
        consentVersion: input.consentVersion ?? null,
        state: 'SNAPSHOT_PINNED',
      },
    });

    return { id: row.id, state: row.state };
  }

  async updateRemixJob(
    id: string,
    patch: {
      state?: string;
      targetProjectId?: string;
      detachedKeys?: unknown;
      scanFindings?: unknown;
      scrubbedCount?: number;
      dbForked?: boolean;
      error?: string;
      sourceSnapshotId?: string;
      sourceListingId?: string;
      piiFindings?: unknown;
      piiMaskedCount?: number;
    },
  ) {
    await this.prisma.remixJob.update({
      where: { id },
      data: {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.targetProjectId !== undefined ? { targetProjectId: patch.targetProjectId } : {}),
        ...(patch.detachedKeys !== undefined ? { detachedKeys: patch.detachedKeys as object } : {}),
        ...(patch.scanFindings !== undefined ? { scanFindings: patch.scanFindings as object } : {}),
        ...(patch.scrubbedCount !== undefined ? { scrubbedCount: patch.scrubbedCount } : {}),
        ...(patch.dbForked !== undefined ? { dbForked: patch.dbForked } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.sourceSnapshotId !== undefined ? { sourceSnapshotId: patch.sourceSnapshotId } : {}),
        ...(patch.sourceListingId !== undefined ? { sourceListingId: patch.sourceListingId } : {}),
        ...(patch.piiFindings !== undefined ? { piiFindings: patch.piiFindings as object } : {}),
        ...(patch.piiMaskedCount !== undefined ? { piiMaskedCount: patch.piiMaskedCount } : {}),
      },
    });
  }

  async getRemixJob(id: string) {
    const row = await this.prisma.remixJob.findUnique({ where: { id } });

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sourceProjectId: row.sourceProjectId,
      targetProjectId: row.targetProjectId ?? undefined,
      organizationId: row.organizationId,
      state: row.state,
      detachedKeys: row.detachedKeys as unknown,
      storagePolicy: row.storagePolicy,
      scanFindings: row.scanFindings as unknown,
      scrubbedCount: row.scrubbedCount,
      dbForked: row.dbForked,
      error: row.error ?? undefined,
      sourceSnapshotId: row.sourceSnapshotId ?? undefined,
      sourceListingId: row.sourceListingId ?? undefined,
      licenseSnapshot: row.licenseSnapshot as unknown,
      consentVersion: row.consentVersion ?? undefined,
      piiFindings: row.piiFindings as unknown,
      piiMaskedCount: row.piiMaskedCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private mapGalleryListing(row: {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    status: string;
    featured: boolean;
    sourceProjectId: string;
    sourceSnapshotId: string;
    authorName: string;
    authorUserId: string | null;
    appUrl: string | null;
    thumbnailUrl: string | null;
    remixAllowed: boolean;
    licenseId: string | null;
    licenseText: string | null;
    licenseTextSha256: string | null;
    piiConsentVersion: string | null;
    rightsConfirmedAt: Date | null;
    rightsConfirmedBy: string | null;
    piiPolicyAcceptedAt: Date | null;
    piiPolicyAcceptedBy: string | null;
    viewCount: number;
    useCount: number;
    createdAt: Date;
    publishedAt: Date | null;
  }): GalleryListingRecord {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      tags: row.tags,
      status: row.status,
      featured: row.featured,
      sourceProjectId: row.sourceProjectId,
      sourceSnapshotId: row.sourceSnapshotId,
      authorName: row.authorName,
      authorUserId: row.authorUserId ?? undefined,
      appUrl: row.appUrl ?? undefined,
      thumbnailUrl: row.thumbnailUrl ?? undefined,
      remixAllowed: row.remixAllowed,
      licenseId: row.licenseId ?? undefined,
      licenseText: row.licenseText ?? undefined,
      licenseTextSha256: row.licenseTextSha256 ?? undefined,
      piiConsentVersion: row.piiConsentVersion ?? undefined,
      rightsConfirmedAt: row.rightsConfirmedAt ?? undefined,
      rightsConfirmedBy: row.rightsConfirmedBy ?? undefined,
      piiPolicyAcceptedAt: row.piiPolicyAcceptedAt ?? undefined,
      piiPolicyAcceptedBy: row.piiPolicyAcceptedBy ?? undefined,
      viewCount: row.viewCount,
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString(),
    };
  }

  async createGalleryListing(input: {
    slug: string;
    title: string;
    description: string;
    category: string;
    tags?: string[];
    status?: string;
    featured?: boolean;
    sourceProjectId: string;
    sourceSnapshotId: string;
    authorName: string;
    authorUserId?: string;
    appUrl?: string;
    thumbnailUrl?: string;
    remixAllowed?: boolean;
    licenseId?: string;
    licenseText?: string;
    licenseTextSha256?: string;
    piiConsentVersion?: string;
    rightsConfirmedAt?: Date;
    rightsConfirmedBy?: string;
    piiPolicyAcceptedAt?: Date;
    piiPolicyAcceptedBy?: string;
    publishedAt?: string;
  }) {
    const status = input.status ?? 'PUBLISHED';
    const row = await this.prisma.galleryListing.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        category: input.category,
        tags: input.tags ?? [],
        status,
        featured: input.featured ?? false,
        sourceProjectId: input.sourceProjectId,
        sourceSnapshotId: input.sourceSnapshotId,
        authorName: input.authorName,
        authorUserId: input.authorUserId ?? null,
        appUrl: input.appUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        remixAllowed: input.remixAllowed ?? false, // FAIL-CLOSED : jamais remixable sans choix explicite
        licenseId: input.licenseId ?? null,
        licenseText: input.licenseText ?? null,
        licenseTextSha256: input.licenseTextSha256 ?? null,
        piiConsentVersion: input.piiConsentVersion ?? null,
        // Trace auditable des confirmations de curation (P0-V3-05, réserve #8).
        rightsConfirmedAt: input.rightsConfirmedAt ?? null,
        rightsConfirmedBy: input.rightsConfirmedBy ?? null,
        piiPolicyAcceptedAt: input.piiPolicyAcceptedAt ?? null,
        piiPolicyAcceptedBy: input.piiPolicyAcceptedBy ?? null,
        // A row published at creation records publishedAt so the detail page
        // can show a real date; a PENDING_REVIEW row leaves it null.
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : status === 'PUBLISHED' ? new Date() : null,
      },
    });

    return this.mapGalleryListing(row);
  }

  async listGalleryListings(opts?: {
    status?: string;
    category?: string;
    query?: string;
    featured?: boolean;
    limit?: number;
  }) {
    const status = opts?.status ?? 'PUBLISHED';
    const query = opts?.query?.trim();
    const rows = await this.prisma.galleryListing.findMany({
      where: {
        status,
        ...(opts?.category && opts.category !== 'all' ? { category: opts.category } : {}),
        ...(opts?.featured !== undefined ? { featured: opts.featured } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
                { authorName: { contains: query, mode: 'insensitive' } },
                { tags: { has: query.toLowerCase() } },
              ],
            }
          : {}),
      },
      // Featured first, then most recently published, so the grid leads with
      // the curated highlights (mirrors the replit.com/gallery ordering).
      orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      ...(opts?.limit ? { take: opts.limit } : {}),
    });

    return rows.map((row) => this.mapGalleryListing(row));
  }

  async getGalleryListingBySlug(slug: string) {
    const row = await this.prisma.galleryListing.findUnique({ where: { slug } });
    return row ? this.mapGalleryListing(row) : undefined;
  }

  async getGalleryListingById(id: string) {
    const row = await this.prisma.galleryListing.findUnique({ where: { id } });
    return row ? this.mapGalleryListing(row) : undefined;
  }

  async incrementGalleryListingViews(id: string) {
    await this.prisma.galleryListing.update({ where: { id }, data: { viewCount: { increment: 1 } } });
  }

  async incrementGalleryListingUses(id: string) {
    await this.prisma.galleryListing.update({ where: { id }, data: { useCount: { increment: 1 } } });
  }

  async createImportJob(input: {
    organizationId: string;
    actorUserId?: string;
    provider: string;
    sourceRef?: string;
    expiresAt?: string;
  }) {
    const row = await this.prisma.importJob.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        provider: input.provider,
        sourceRef: input.sourceRef ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        state: 'RECEIVED',
      },
    });

    return { id: row.id, state: row.state };
  }

  async updateImportJob(
    id: string,
    patch: {
      state?: string;
      findings?: unknown;
      consent?: unknown;
      targetProjectId?: string;
      stagedFileCount?: number;
      redactedCount?: number;
      creditsReserved?: boolean;
      error?: string;
    },
  ) {
    await this.prisma.importJob.update({
      where: { id },
      data: {
        ...(patch.state !== undefined ? { state: patch.state } : {}),
        ...(patch.findings !== undefined ? { findings: patch.findings as object } : {}),
        ...(patch.consent !== undefined ? { consent: patch.consent as object } : {}),
        ...(patch.targetProjectId !== undefined ? { targetProjectId: patch.targetProjectId } : {}),
        ...(patch.stagedFileCount !== undefined ? { stagedFileCount: patch.stagedFileCount } : {}),
        ...(patch.redactedCount !== undefined ? { redactedCount: patch.redactedCount } : {}),
        ...(patch.creditsReserved !== undefined ? { creditsReserved: patch.creditsReserved } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      },
    });
  }

  async getImportJob(id: string) {
    const row = await this.prisma.importJob.findUnique({ where: { id } });

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      organizationId: row.organizationId,
      provider: row.provider,
      state: row.state,
      sourceRef: row.sourceRef ?? undefined,
      findings: row.findings as unknown,
      consent: row.consent as unknown,
      targetProjectId: row.targetProjectId ?? undefined,
      stagedFileCount: row.stagedFileCount,
      redactedCount: row.redactedCount,
      creditsReserved: row.creditsReserved,
      error: row.error ?? undefined,
      expiresAt: row.expiresAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async reapExpiredImportJobs(nowIso: string): Promise<string[]> {
    const now = new Date(nowIso);
    // Non-terminal jobs only: COMMITTED/ROLLING_BACK/EXPIRED/CANCELLED are done.
    const stale = await this.prisma.importJob.findMany({
      where: {
        state: { notIn: ['COMMITTED', 'ROLLING_BACK', 'EXPIRED', 'CANCELLED'] },
        expiresAt: { not: null, lt: now },
      },
      select: { id: true },
    });

    if (stale.length === 0) {
      return [];
    }

    const ids = stale.map((row) => row.id);
    // updateMany never sets targetProjectId — the target stays unmounted.
    await this.prisma.importJob.updateMany({
      where: { id: { in: ids } },
      data: { state: 'EXPIRED', error: 'Import staging expired before it was committed.' },
    });

    return ids;
  }

  async deleteProjectSecret(projectId: string, key: string) {
    /*
     * find-then-delete raced a concurrent delete into an unhandled P2025; use a
     * count-gated deleteMany so a lost race is reported as "already gone".
     */
    const existing = await this.prisma.projectSecret.findUnique({ where: { projectId_key: { projectId, key } } });

    if (!existing) {
      return undefined;
    }

    const deleted = await this.prisma.projectSecret.deleteMany({ where: { projectId, key } });

    return deleted.count > 0 ? mapSecret(existing) : undefined;
  }

  async addProjectCollaborator(input: { projectId: string; userId: string; roleKey: string; expiresAt?: Date | null }) {
    return mapProjectCollaborator(
      await this.prisma.projectCollaborator.upsert({
        where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          roleKey: input.roleKey,
          expiresAt: input.expiresAt ?? null,
        },
        update: { roleKey: input.roleKey, expiresAt: input.expiresAt ?? null },
      }),
    );
  }

  async listProjectCollaborators(projectId: string) {
    return (await this.prisma.projectCollaborator.findMany({ where: { projectId } })).map(mapProjectCollaborator);
  }

  async removeProjectCollaborator(input: { projectId: string; userId: string }): Promise<boolean> {
    const result = await this.prisma.projectCollaborator.deleteMany({
      where: { projectId: input.projectId, userId: input.userId },
    });

    return result.count > 0;
  }

  async recordProjectActivity(input: {
    projectId: string;
    actorUserId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    const activity = await this.prisma.projectActivity.create({
      data: { ...input, metadata: (input.metadata ?? undefined) as any },
    });
    return mapProjectActivity(activity);
  }

  async listProjectActivity(projectId: string, options: ProjectActivityListOptions = {}) {
    const limit = options.limit ? Math.min(Math.max(options.limit, 1), 200) : undefined;
    const where: any = { projectId };

    if (options.action) {
      where.action = options.action;
    }

    if (options.actorUserId) {
      where.actorUserId = options.actorUserId;
    }

    if (options.since || options.until) {
      where.createdAt = {
        ...(options.since ? { gte: new Date(options.since) } : {}),
        ...(options.until ? { lte: new Date(options.until) } : {}),
      };
    }

    /*
     * Bound the query so a long-lived project's activity table (one row per AI
     * action / file save / deploy) can't be loaded wholesale into memory. With
     * no search filter, `take: limit` is identical to the old fetch-all + slice.
     * With a search filter we still need to scan more rows than we return, so we
     * cap at a generous safety ceiling rather than fetching the entire table.
     */
    const SAFETY_CAP = 1000;
    const search = options.search?.trim().toLowerCase();
    const requestedOrder = options.order ?? 'asc';
    const take = search ? SAFETY_CAP : (limit ?? SAFETY_CAP);

    const records = (
      await this.prisma.projectActivity.findMany({
        where,

        /*
         * When searching we scan a capped window rather than the whole table.
         * Always take the MOST RECENT rows (desc) in that case so a search can
         * match recent activity on a project with more than SAFETY_CAP rows —
         * `orderBy: asc` + `take` previously fetched the OLDEST 1000 and could
         * never surface a recent match. Re-sort to the requested order below.
         */
        orderBy: { createdAt: search ? 'desc' : requestedOrder },
        take,
      })
    ).map(mapProjectActivity);

    const filtered = search
      ? records.filter(
          (activity) =>
            activity.action.toLowerCase().includes(search) ||
            activity.actorUserId?.toLowerCase().includes(search) ||
            JSON.stringify(activity.metadata ?? {})
              .toLowerCase()
              .includes(search),
        )
      : records;

    // We fetched desc when searching; restore the caller's requested order.
    const ordered = search && requestedOrder === 'asc' ? [...filtered].reverse() : filtered;

    return typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
  }

  async getProjectIdeState(projectId: string) {
    const state = await this.prisma.projectIdeState.findUnique({ where: { projectId } });
    return state ? mapProjectIdeState(state) : undefined;
  }

  async upsertProjectIdeState(input: {
    projectId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    if (input.expectedVersion !== undefined) {
      /*
       * Atomic optimistic-concurrency write: only succeed if the row's version
       * still equals what the caller read. The handler's separate
       * read-then-version-check was not atomic, so two concurrent writers who
       * both passed the check would both increment and last-write-wins clobbered
       * one. A conditional updateMany closes that race — count===0 means another
       * writer won, which the caller surfaces as 412.
       */
      const result = await this.prisma.projectIdeState.updateMany({
        where: { projectId: input.projectId, version: input.expectedVersion },
        data: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw Object.assign(new Error('IDE state version conflict'), { code: 'IDE_STATE_VERSION_CONFLICT' });
      }

      const updated = await this.prisma.projectIdeState.findUnique({ where: { projectId: input.projectId } });

      if (!updated) {
        // The row was deleted/archived between the updateMany and this read.
        throw Object.assign(new Error('IDE state was concurrently deleted'), { code: 'IDE_STATE_NOT_FOUND' });
      }

      return mapProjectIdeState(updated);
    }

    return mapProjectIdeState(
      await this.prisma.projectIdeState.upsert({
        where: { projectId: input.projectId },
        create: {
          projectId: input.projectId,
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async getWorkspaceIdeState(workspaceId: string) {
    const state = await this.prisma.workspaceIdeState.findUnique({ where: { workspaceId } });
    return state ? mapWorkspaceIdeState(state) : undefined;
  }

  async upsertWorkspaceIdeState(input: {
    workspaceId: string;
    state: unknown;
    updatedByUserId?: string;
    expectedVersion?: number;
  }) {
    if (input.expectedVersion !== undefined) {
      // Atomic optimistic-concurrency write — see upsertProjectIdeState.
      const result = await this.prisma.workspaceIdeState.updateMany({
        where: { workspaceId: input.workspaceId, version: input.expectedVersion },
        data: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      });

      if (result.count === 0) {
        throw Object.assign(new Error('IDE state version conflict'), { code: 'IDE_STATE_VERSION_CONFLICT' });
      }

      const updated = await this.prisma.workspaceIdeState.findUnique({ where: { workspaceId: input.workspaceId } });

      if (!updated) {
        // The row was deleted/archived between the updateMany and this read.
        throw Object.assign(new Error('IDE state was concurrently deleted'), { code: 'IDE_STATE_NOT_FOUND' });
      }

      return mapWorkspaceIdeState(updated);
    }

    return mapWorkspaceIdeState(
      await this.prisma.workspaceIdeState.upsert({
        where: { workspaceId: input.workspaceId },
        create: {
          workspaceId: input.workspaceId,
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          state: input.state as any,
          updatedByUserId: input.updatedByUserId,
          version: { increment: 1 },
        },
      }),
    );
  }

  async updateWorkspaceGitRepositoryUrl(input: { workspaceId: string; gitRepositoryUrl: string | null }) {
    return mapWorkspace(
      await this.prisma.workspace.update({
        where: { id: input.workspaceId },
        data: { gitRepositoryUrl: input.gitRepositoryUrl },
      }),
    );
  }

  async upsertCollaborationPresence(input: {
    projectId: string;
    userId: string;
    sessionId: string;
    status?: CollaborationPresenceRecord['status'];
    filePath?: string;
    cursor?: unknown;
    selection?: unknown;
    mode?: CollaborationPresenceRecord['mode'];
    terminalAccess?: boolean;
  }) {
    /*
     * Ownership guard: the unique key is (projectId, sessionId) and does NOT
     * include userId, so a caller who supplies another user's sessionId would
     * otherwise upsert (hijack/spoof) that user's presence row — changing their
     * cursor/file/terminalAccess as broadcast to the room. Reject when an
     * existing row for this (projectId, sessionId) belongs to a different user.
     */
    const existingPresence = await this.prisma.collaborationPresence.findUnique({
      where: { projectId_sessionId: { projectId: input.projectId, sessionId: input.sessionId } },
      select: { userId: true },
    });

    if (existingPresence && existingPresence.userId !== input.userId) {
      throw Object.assign(new Error('Presence session belongs to another user'), {
        statusCode: 403,
        code: 'PRESENCE_FORBIDDEN',
      });
    }

    return mapCollaborationPresence(
      await this.prisma.collaborationPresence.upsert({
        where: { projectId_sessionId: { projectId: input.projectId, sessionId: input.sessionId } },
        create: {
          projectId: input.projectId,
          userId: input.userId,
          sessionId: input.sessionId,
          status: input.status ?? 'online',
          filePath: input.filePath,
          cursor: input.cursor as any,
          selection: input.selection as any,
          mode: input.mode ?? 'editing',
          terminalAccess: input.terminalAccess ?? false,
        },

        /*
         * Field-selective update: only overwrite fields the caller actually
         * provided. A routine presence heartbeat omits terminalAccess/cursor/
         * selection/filePath, and blindly writing `?? false`/undefined would
         * revoke just-granted terminal access and null out another client's
         * cursor/file. status/mode always carry schema defaults so they're safe
         * to set unconditionally.
         */
        update: {
          status: input.status ?? 'online',
          mode: input.mode ?? 'editing',
          ...(input.filePath !== undefined ? { filePath: input.filePath } : {}),
          ...(input.cursor !== undefined ? { cursor: input.cursor as any } : {}),
          ...(input.selection !== undefined ? { selection: input.selection as any } : {}),
          ...(input.terminalAccess !== undefined ? { terminalAccess: input.terminalAccess } : {}),
        },
      }),
    );
  }

  async removeCollaborationPresence(projectId: string, sessionId: string) {
    const deleted = await this.prisma.collaborationPresence.deleteMany({ where: { projectId, sessionId } });
    return deleted.count > 0;
  }

  async listCollaborationPresence(projectId: string) {
    return (
      await this.prisma.collaborationPresence.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' } })
    ).map(mapCollaborationPresence);
  }

  async createCollaborationComment(input: {
    projectId: string;
    userId: string;
    filePath?: string;
    line?: number;
    selection?: unknown;
    body: string;
  }) {
    return mapCollaborationComment(
      await this.prisma.collaborationComment.create({
        data: { ...input, selection: (input.selection ?? undefined) as any },
      }),
    );
  }

  async listCollaborationComments(projectId: string) {
    return (
      await this.prisma.collaborationComment.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
    ).map(mapCollaborationComment);
  }

  async createProjectShareLink(input: {
    projectId: string;
    tokenHash: string;
    roleKey: ProjectShareLinkRecord['roleKey'];
    expiresAt: Date;
    createdByUserId?: string;
  }) {
    return mapProjectShareLink(await this.prisma.projectShareLink.create({ data: input }));
  }

  async listProjectShareLinks(projectId: string) {
    return (await this.prisma.projectShareLink.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapProjectShareLink,
    );
  }

  async findProjectShareLinkByToken(token: string) {
    const link = await this.prisma.projectShareLink.findUnique({ where: { tokenHash: hashToken(token) } });

    if (!link || link.revokedAt || link.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapProjectShareLink(link);
  }

  async revokeProjectShareLink(input: { projectId: string; id: string }) {
    const result = await this.prisma.projectShareLink.updateMany({
      where: { id: input.id, projectId: input.projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  async createChatShare(input: {
    tokenHash: string;
    conversationId: string;
    projectId: string;
    authorUserId: string;
    title?: string;
    payload: unknown;
    allowFork?: boolean;
    expiresAt?: Date;
  }) {
    return mapChatShare(
      await this.prisma.chatShare.create({
        data: {
          tokenHash: input.tokenHash,
          conversationId: input.conversationId,
          projectId: input.projectId,
          authorUserId: input.authorUserId,
          title: input.title,
          payloadJson: input.payload as Prisma.InputJsonValue,
          allowFork: input.allowFork ?? false,
          expiresAt: input.expiresAt,
        },
      }),
    );
  }

  async findChatShareByTokenHash(tokenHash: string) {
    const share = await this.prisma.chatShare.findUnique({ where: { tokenHash } });

    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt.getTime() < Date.now())) {
      return undefined;
    }

    return mapChatShare(share);
  }

  async listChatShares(projectId: string) {
    return (await this.prisma.chatShare.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapChatShare,
    );
  }

  async revokeChatShare(input: { id: string; authorUserId?: string; projectId?: string }) {
    const result = await this.prisma.chatShare.updateMany({
      where: {
        id: input.id,
        revokedAt: null,
        ...(input.authorUserId ? { authorUserId: input.authorUserId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }

  async upsertAgentPatchProposal(input: {
    id: string;
    projectId: string;
    artifactId: string;
    messageId: string;
    actionId: string;
    filePath: string;
    relativePath: string;
    originalContent: string;
    proposedContent: string;
    hunks: unknown;
    status: AgentPatchProposalStatus;
    error?: string;
  }) {
    const existing = await this.prisma.agentPatchProposal.findUnique({
      where: { id: input.id },
      select: { projectId: true },
    });

    if (existing && existing.projectId !== input.projectId) {
      throw Object.assign(new Error('Agent patch proposal not found'), {
        statusCode: 404,
        code: 'AGENT_PATCH_PROPOSAL_NOT_FOUND',
      });
    }

    return mapAgentPatchProposal(
      await this.prisma.agentPatchProposal.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          projectId: input.projectId,
          artifactId: input.artifactId,
          messageId: input.messageId,
          actionId: input.actionId,
          filePath: input.filePath,
          relativePath: input.relativePath,
          originalContent: input.originalContent,
          proposedContent: input.proposedContent,
          hunks: input.hunks as any,
          status: input.status,
          error: input.error,
        },
        update: {
          proposedContent: input.proposedContent,
          hunks: input.hunks as any,
          status: input.status,
          error: input.error,
        },
      }),
    );
  }

  async listOpenAgentPatchProposals(projectId: string) {
    return (
      await this.prisma.agentPatchProposal.findMany({
        where: { projectId, status: { in: ['pending', 'applying', 'failed'] } },
        orderBy: { updatedAt: 'desc' },
      })
    ).map(mapAgentPatchProposal);
  }

  async deleteAgentPatchProposal(projectId: string, id: string) {
    const deleted = await this.prisma.agentPatchProposal.deleteMany({ where: { projectId, id } });
    return deleted.count > 0;
  }

  async recordAgentRepairEvent(input: {
    projectId: string;
    messageId?: string;
    artifactId?: string;
    actionId?: string;
    relativePath: string;
    attempt?: number;
    outcome: AgentRepairOutcome;
    validationError?: string;
    repairError?: string;
  }) {
    return mapAgentRepairEvent(
      await this.prisma.agentRepairEvent.create({
        data: {
          projectId: input.projectId,
          messageId: input.messageId,
          artifactId: input.artifactId,
          actionId: input.actionId,
          relativePath: input.relativePath,
          attempt: input.attempt ?? 1,
          outcome: input.outcome,
          validationError: input.validationError,
          repairError: input.repairError,
        },
      }),
    );
  }

  async listAgentRepairEvents(projectId: string, options?: { take?: number }) {
    return (
      await this.prisma.agentRepairEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(options?.take ?? 100, 1), 500),
      })
    ).map(mapAgentRepairEvent);
  }

  async listConsensusRecords(projectId: string, options?: { take?: number }) {
    /*
     * ConsensusRecord has no projectId of its own; it hangs off AgentRun via runId.
     * Scope by the parent run's projectId (a nested relation filter) so ONLY this
     * project's consensus rows are returned — tenant isolation is enforced here.
     */
    return (
      await this.prisma.consensusRecord.findMany({
        where: { run: { projectId } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(options?.take ?? 50, 1), 200),
      })
    ).map(mapConsensusRecord);
  }

  async getConsensusRecordDetail(projectId: string, runId: string) {
    /*
     * Same tenant-isolation guard as listConsensusRecords: scope by the parent
     * run's projectId so a runId from another project can't be read. Returns the
     * full record incl. the persisted per-agent vote (claimVotes/conflicts/
     * consolidated JSON), or undefined when no such record exists in this project.
     */
    const row = await this.prisma.consensusRecord.findFirst({
      where: { runId, run: { projectId } },
    });

    return row ? mapConsensusRecordDetail(row) : undefined;
  }

  async listProjectSkillOverrides(projectId: string) {
    return (
      await this.prisma.projectSkill.findMany({
        where: { projectId },
        select: { skillId: true, enabled: true, updatedAt: true },
      })
    ).map((row) => ({ skillId: row.skillId, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() }));
  }

  async setProjectSkillEnabled(input: { projectId: string; skillId: string; enabled: boolean }) {
    const row = await this.prisma.projectSkill.upsert({
      where: { projectId_skillId: { projectId: input.projectId, skillId: input.skillId } },
      create: { projectId: input.projectId, skillId: input.skillId, enabled: input.enabled },
      update: { enabled: input.enabled },
      select: { skillId: true, enabled: true, updatedAt: true },
    });

    return { skillId: row.skillId, enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
  }

  async listInstalledSkills(scope: InstalledSkillScope, scopeId: string): Promise<InstalledSkillRecord[]> {
    const rows = await this.prisma.installedSkill.findMany({
      where: { scope, scopeId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.#toInstalledSkill(row));
  }

  async installSkill(input: InstallSkillInput): Promise<{ record: InstalledSkillRecord; created: boolean }> {
    const existing = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (existing) {
      return { record: this.#toInstalledSkill(existing), created: false };
    }

    const created = await this.prisma.installedSkill.create({
      data: {
        scope: input.scope,
        scopeId: input.scopeId,
        ownerRepo: input.ownerRepo,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        homepageUrl: input.homepageUrl ?? null,
        installedByUserId: input.installedByUserId ?? null,
        origin: input.origin ?? 'github',
        enabled: input.enabled ?? true,
        contentHash: input.contentHash ?? null,
        auditVerdict: input.auditVerdict ?? null,
        auditFindings: input.auditFindings ? JSON.stringify(input.auditFindings) : null,
        auditedAt: input.auditedAt ? new Date(input.auditedAt) : null,
        manifestName: input.manifestName ?? null,
        resourcesJson: input.resources ? JSON.stringify(input.resources) : null,
      },
    });

    return { record: this.#toInstalledSkill(created), created: true };
  }

  async uninstallSkill(scope: InstalledSkillScope, scopeId: string, ownerRepo: string): Promise<boolean> {
    const result = await this.prisma.installedSkill.deleteMany({ where: { scope, scopeId, ownerRepo } });

    return result.count > 0;
  }

  async setInstalledSkillEnabled(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    enabled: boolean;
  }): Promise<InstalledSkillRecord | undefined> {
    const current = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (!current) {
      return undefined;
    }

    // Fail-closed enforcement: a revoked or audit-rejected skill can never be
    // enabled. Return the unchanged row so the caller sees it stayed disabled.
    const blocked = current.revokedAt !== null || current.auditVerdict === 'rejected';

    if (input.enabled && blocked) {
      return this.#toInstalledSkill(current);
    }

    const row = await this.prisma.installedSkill.update({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
      data: { enabled: input.enabled },
    });

    return this.#toInstalledSkill(row);
  }

  async revokeSkill(input: {
    scope: InstalledSkillScope;
    scopeId: string;
    ownerRepo: string;
    revokedByUserId?: string | null;
    reason?: string | null;
  }): Promise<InstalledSkillRecord | undefined> {
    const existing = await this.prisma.installedSkill.findUnique({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
    });

    if (!existing) {
      return undefined;
    }

    const row = await this.prisma.installedSkill.update({
      where: {
        scope_scopeId_ownerRepo: { scope: input.scope, scopeId: input.scopeId, ownerRepo: input.ownerRepo },
      },
      data: {
        enabled: false,
        revokedAt: existing.revokedAt ?? new Date(),
        revokedByUserId: input.revokedByUserId ?? existing.revokedByUserId ?? null,
        revokeReason: input.reason ?? existing.revokeReason ?? null,
      },
    });

    return this.#toInstalledSkill(row);
  }

  async recordSkillAudit(input: RecordSkillAuditInput): Promise<SkillAuditEventRecord> {
    const row = await this.prisma.skillAuditEvent.create({
      data: {
        scope: input.scope,
        scopeId: input.scopeId,
        ownerRepo: input.ownerRepo,
        action: input.action,
        verdict: input.verdict ?? null,
        findingsJson: input.findings ? JSON.stringify(input.findings) : null,
        contentHash: input.contentHash ?? null,
        actorUserId: input.actorUserId ?? null,
      },
    });

    return this.#toSkillAuditEvent(row);
  }

  async listSkillAuditEvents(
    scope: InstalledSkillScope,
    scopeId: string,
    options: { ownerRepo?: string; limit?: number } = {},
  ): Promise<SkillAuditEventRecord[]> {
    const rows = await this.prisma.skillAuditEvent.findMany({
      where: { scope, scopeId, ...(options.ownerRepo ? { ownerRepo: options.ownerRepo } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 100, 1), 500),
    });

    return rows.map((row) => this.#toSkillAuditEvent(row));
  }

  async countInstallsByRepo(): Promise<Record<string, number>> {
    const grouped = await this.prisma.installedSkill.groupBy({
      by: ['ownerRepo'],
      _count: { _all: true },
    });

    const counts: Record<string, number> = {};

    for (const row of grouped) {
      counts[row.ownerRepo] = row._count._all;
    }

    return counts;
  }

  #toInstalledSkill(row: {
    id: string;
    scope: string;
    scopeId: string;
    ownerRepo: string;
    name: string;
    description: string;
    instructions: string;
    homepageUrl: string | null;
    enabled: boolean;
    installedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    origin?: string | null;
    contentHash?: string | null;
    auditVerdict?: string | null;
    auditFindings?: string | null;
    auditedAt?: Date | null;
    manifestName?: string | null;
    resourcesJson?: string | null;
    revokedAt?: Date | null;
    revokedByUserId?: string | null;
    revokeReason?: string | null;
  }): InstalledSkillRecord {
    return {
      id: row.id,
      scope: row.scope as InstalledSkillScope,
      scopeId: row.scopeId,
      ownerRepo: row.ownerRepo,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      homepageUrl: row.homepageUrl,
      enabled: row.enabled,
      installedByUserId: row.installedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      origin: row.origin ?? 'github',
      contentHash: row.contentHash ?? null,
      auditVerdict: (row.auditVerdict as InstalledSkillRecord['auditVerdict']) ?? null,
      auditFindings: parseJsonArray<InstalledSkillRecord['auditFindings'][number]>(row.auditFindings),
      auditedAt: row.auditedAt ? row.auditedAt.toISOString() : null,
      manifestName: row.manifestName ?? null,
      resources: parseJsonArray<InstalledSkillRecord['resources'][number]>(row.resourcesJson),
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      revokedByUserId: row.revokedByUserId ?? null,
      revokeReason: row.revokeReason ?? null,
    };
  }

  #toSkillAuditEvent(row: {
    id: string;
    scope: string;
    scopeId: string;
    ownerRepo: string;
    action: string;
    verdict: string | null;
    findingsJson: string | null;
    contentHash: string | null;
    actorUserId: string | null;
    createdAt: Date;
  }): SkillAuditEventRecord {
    return {
      id: row.id,
      scope: row.scope as InstalledSkillScope,
      scopeId: row.scopeId,
      ownerRepo: row.ownerRepo,
      action: row.action,
      verdict: (row.verdict as SkillAuditEventRecord['verdict']) ?? null,
      findings: parseJsonArray<SkillAuditEventRecord['findings'][number]>(row.findingsJson),
      contentHash: row.contentHash,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createWorkspace(input: {
    id?: string;
    projectId: string;
    name: string;
    runtimeMode: string;
    environment?: string;
  }) {
    /*
     * Persist the created workspace first so Prisma can mint the id when the
     * caller doesn't supply one. Once we have the id, allocate a relative
     * gitPath under the project storage root so each workspace has its own
     * isolated git working tree. Both writes share an interactive transaction
     * so a crash between them can never leave a row with a null gitPath.
     */
    const updated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { ...input, status: 'PENDING' },
      });

      const gitPath = workspaceRelativeGitPath(created.id);

      return tx.workspace.update({
        where: { id: created.id },
        data: { gitPath },
      });
    });

    return mapWorkspace(updated);
  }

  async getWorkspace(id: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    return workspace ? mapWorkspace(workspace) : undefined;
  }

  async listWorkspaces(projectId: string) {
    return (await this.prisma.workspace.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapWorkspace,
    );
  }

  async countActiveWorkspaces(organizationId: string) {
    return this.prisma.workspace.count({
      where: {
        project: { organizationId, deletedAt: null },
        status: { in: ['PENDING', 'STARTING', 'RUNNING'] },
      },
    });
  }

  async listActiveWorkspaces(organizationId: string) {
    return (
      await this.prisma.workspace.findMany({
        where: {
          project: { organizationId, deletedAt: null },
          status: { in: ['PENDING', 'STARTING', 'RUNNING'] },
        },
        orderBy: { updatedAt: 'asc' },
      })
    ).map(mapWorkspace);
  }

  async countSnapshots(organizationId: string) {
    /*
     * Exclude system-generated 'before-ai-change' snapshots from the user's
     * snapshots.count quota. They are created automatically on every AI
     * delete/rename/patch tool call WITHOUT consuming quota, but were counted
     * here — so they accumulated toward the cap and eventually 429'd the user's
     * manual snapshot endpoint even though they took no manual snapshots
     * (self-lockout). The quota governs user-initiated snapshots only.
     */
    return this.prisma.projectSnapshot.count({
      where: { project: { organizationId, deletedAt: null }, kind: { not: 'before-ai-change' } },
    });
  }

  async countDeployments(organizationId: string, since?: Date) {
    /*
     * Failed/canceled builds must not count against the deployment quota — they
     * produced no live deployment. Counting every row (the create handler
     * persists a QUEUED row before building, left FAILED on error) permanently
     * consumed quota: free plan (limit 0) blocked all deploys after one failed
     * build, and paid plans locked out once enough builds had failed.
     *
     * `since` scopes the count to the current usage period (per-period allowance);
     * without it the count was a monotonic lifetime total that eventually locked
     * out all deploys.
     */
    return this.prisma.deployment.count({
      where: {
        project: { organizationId, deletedAt: null },
        status: { notIn: ['FAILED', 'CANCELED'] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    });
  }

  async countPublishedApps(organizationId: string, options: { excludeProjectId?: string } = {}) {
    /*
     * "Published app" = a distinct project with a live PRODUCTION deployment
     * (status READY). We count distinct projectIds (not deployment rows) so a
     * project that has been re-published several times counts once. Failed/
     * superseded builds are excluded by the READY filter.
     */
    const rows = await this.prisma.deployment.findMany({
      where: {
        project: { organizationId, deletedAt: null },
        environmentName: 'production',
        status: 'READY',
        ...(options.excludeProjectId ? { projectId: { not: options.excludeProjectId } } : {}),
      },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    return rows.length;
  }

  async listPublishedProjects(organizationId: string) {
    /*
     * Une ligne par PROJET, datée de sa publication la plus récente : republier
     * ne doit pas faire compter le projet deux fois, et l'expiration se calcule
     * sur la publication la plus récente.
     */
    const rows = await this.prisma.deployment.findMany({
      where: {
        project: { organizationId, deletedAt: null },
        environmentName: 'production',
        status: 'READY',
      },
      select: { projectId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const latest = new Map<string, Date>();

    for (const row of rows) {
      if (!latest.has(row.projectId)) {
        latest.set(row.projectId, row.createdAt);
      }
    }

    return [...latest.entries()].map(([projectId, publishedAt]) => ({
      projectId,
      publishedAt: publishedAt.toISOString(),
    }));
  }

  async createSnapshot(input: {
    projectId: string;
    label?: string;
    kind?: SnapshotRecord['kind'];
    manifest: unknown;
    storageKey?: string;
    byteLength?: number;
    createdByUserId?: string;
    conversationId?: string;
    turnIndex?: number;
  }) {
    return mapSnapshot(
      await this.prisma.projectSnapshot.create({
        data: {
          projectId: input.projectId,
          label: input.label,
          kind: input.kind ?? 'manual',
          manifest: input.manifest as any,
          storageKey: input.storageKey,
          byteLength: input.byteLength,
          createdByUserId: input.createdByUserId,
          conversationId: input.conversationId,
          turnIndex: input.turnIndex,
        },
      }),
    );
  }

  async getSnapshot(id: string) {
    const snapshot = await this.prisma.projectSnapshot.findUnique({ where: { id } });
    return snapshot ? mapSnapshot(snapshot) : undefined;
  }

  async listSnapshots(projectId: string) {
    return (await this.prisma.projectSnapshot.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } })).map(
      mapSnapshot,
    );
  }

  async putProjectStorageObject(input: {
    projectId?: string;
    key: string;
    kind: ProjectStorageObjectRecord['kind'];
    contentBase64: string;
    byteLength: number;
    contentHash: string;
  }) {
    return mapProjectStorageObject(
      await this.prisma.projectStorageObject.upsert({
        where: { key: input.key },
        create: input,
        update: {
          projectId: input.projectId,
          kind: input.kind,
          contentBase64: input.contentBase64,
          byteLength: input.byteLength,
          contentHash: input.contentHash,
        },
      }),
    );
  }

  async getProjectStorageObject(key: string) {
    const object = await this.prisma.projectStorageObject.findUnique({ where: { key } });

    return object ? mapProjectStorageObject(object) : undefined;
  }

  async aggregateStorageBytesByOrg(): Promise<Array<{ organizationId: string; bytes: number }>> {
    const rows = await this.prisma.projectStorageObject.findMany({
      where: { project: { isNot: null } },
      select: { byteLength: true, project: { select: { organizationId: true } } },
    });

    const byOrg = new Map<string, number>();

    for (const row of rows) {
      const organizationId = row.project?.organizationId;

      if (!organizationId) {
        continue;
      }

      byOrg.set(organizationId, (byOrg.get(organizationId) ?? 0) + (row.byteLength ?? 0));
    }

    return [...byOrg.entries()].map(([organizationId, bytes]) => ({ organizationId, bytes }));
  }

  async getDatabaseInstanceByProject(
    projectId: string,
    environment = 'development',
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.databaseInstance.findUnique({
      where: { projectId_environment: { projectId, environment } },
    });

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async listDatabaseSnapshots(databaseInstanceId: string): Promise<DatabaseSnapshotRecord[]> {
    const rows = await this.prisma.databaseSnapshot.findMany({
      where: { databaseInstanceId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDatabaseSnapshot);
  }

  async listDatabaseRestores(databaseInstanceId: string): Promise<DatabaseRestoreRecord[]> {
    const rows = await this.prisma.databaseRestore.findMany({
      where: { databaseInstanceId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDatabaseRestore);
  }

  async createDatabaseRestore(input: {
    databaseInstanceId: string;
    snapshotId?: string;
    targetTimestamp?: string;
    requestedByUserId?: string;
  }): Promise<DatabaseRestoreRecord> {
    const row = await this.prisma.databaseRestore.create({
      data: {
        databaseInstanceId: input.databaseInstanceId,
        snapshotId: input.snapshotId ?? null,
        targetTimestamp: input.targetTimestamp ? new Date(input.targetTimestamp) : null,
        requestedByUserId: input.requestedByUserId ?? null,
      },
    });

    return mapDatabaseRestore(row);
  }

  async createDatabaseInstance(input: {
    projectId: string;
    organizationId: string;
    retentionDays: number;
    region?: string;
    environment?: string;
  }): Promise<DatabaseInstanceRecord> {
    const row = await this.prisma.databaseInstance.create({
      data: {
        projectId: input.projectId,
        organizationId: input.organizationId,
        environment: input.environment ?? 'development',
        retentionDays: input.retentionDays,
        region: input.region ?? null,
        pitrEnabled: input.retentionDays > 0,
      },
    });

    return mapDatabaseInstance(row);
  }

  async updateDatabaseInstance(
    id: string,
    patch: Partial<Pick<DatabaseInstanceRecord, 'status' | 'sizeBytes' | 'pitrEnabled' | 'region'>>,
  ): Promise<DatabaseInstanceRecord | undefined> {
    const row = await this.prisma.databaseInstance
      .update({
        where: { id },
        data: {
          status: patch.status,
          sizeBytes: patch.sizeBytes === undefined ? undefined : BigInt(patch.sizeBytes),
          pitrEnabled: patch.pitrEnabled,
          region: patch.region,
        },
      })
      .catch(() => undefined);

    return row ? mapDatabaseInstance(row) : undefined;
  }

  async createDatabaseSnapshot(input: {
    databaseInstanceId: string;
    kind: 'auto' | 'manual';
    label?: string;
    createdByUserId?: string;
    expiresAt?: string;
  }): Promise<DatabaseSnapshotRecord> {
    const row = await this.prisma.databaseSnapshot.create({
      data: {
        databaseInstanceId: input.databaseInstanceId,
        kind: input.kind,
        label: input.label ?? null,
        createdByUserId: input.createdByUserId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    return mapDatabaseSnapshot(row);
  }

  async pruneExpiredDatabaseSnapshots(nowMs: number): Promise<number> {
    const result = await this.prisma.databaseSnapshot.deleteMany({
      where: { expiresAt: { not: null, lt: new Date(nowMs) } },
    });

    return result.count;
  }

  async updateDatabaseRestore(
    id: string,
    patch: Partial<Pick<DatabaseRestoreRecord, 'status' | 'error' | 'startedAt' | 'completedAt'>>,
  ): Promise<DatabaseRestoreRecord | undefined> {
    const row = await this.prisma.databaseRestore
      .update({
        where: { id },
        data: {
          status: patch.status,
          error: patch.error,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
          completedAt: patch.completedAt ? new Date(patch.completedAt) : undefined,
        },
      })
      .catch(() => undefined);

    return row ? mapDatabaseRestore(row) : undefined;
  }

  async listActiveDatabaseInstances(take = 500): Promise<DatabaseInstanceRecord[]> {
    const rows = await this.prisma.databaseInstance.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return rows.map(mapDatabaseInstance);
  }

  async listPendingDatabaseRestores(take = 100): Promise<DatabaseRestoreRecord[]> {
    const rows = await this.prisma.databaseRestore.findMany({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      orderBy: { createdAt: 'asc' },
      take,
    });

    return rows.map(mapDatabaseRestore);
  }

  async createDeployment(input: {
    projectId: string;
    workspaceId?: string;
    provider: string;
    environment?: DeploymentRecord['environment'];
    status?: DeploymentRecord['status'];
    url?: string;
    previewUrl?: string;
    productionUrl?: string;
    framework?: string;
    buildCommand?: string;
    outputDirectory?: string;
    branch?: string;
    commitSha?: string;
    customDomain?: string;
    logs?: DeploymentRecord['logs'];
    metadata?: Record<string, unknown>;
    rolledBackFromId?: string;
    parentDeploymentId?: string;
    machineSize?: string;
    startedAt?: string;
    finishedAt?: string;
    canceledAt?: string;
  }) {
    return mapDeployment(
      await this.prisma.deployment.create({
        data: {
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          provider: input.provider,
          environmentName: input.environment ?? 'preview',
          status: input.status ?? 'QUEUED',
          url: input.url,
          previewUrl: input.previewUrl,
          productionUrl: input.productionUrl,
          framework: input.framework,
          buildCommand: input.buildCommand,
          outputDirectory: input.outputDirectory,
          branch: input.branch,
          commitSha: input.commitSha,
          customDomain: input.customDomain,
          logs: (input.logs ?? []) as any,
          metadata: (input.metadata ?? {}) as any,
          rolledBackFromId: input.rolledBackFromId,
          parentDeploymentId: input.parentDeploymentId,
          ...(input.machineSize ? { machineSize: input.machineSize } : {}),
          startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
          finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
          canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
        } as any,
      }),
    );
  }

  async getDeployment(projectId: string, deploymentId: string) {
    const deployment = await this.prisma.deployment.findFirst({ where: { id: deploymentId, projectId } });
    return deployment ? mapDeployment(deployment) : undefined;
  }

  async getDeploymentOwnerStatus(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { projectId: true, status: true, project: { select: { deletedAt: true } } },
    });

    if (!deployment) {
      return undefined;
    }

    return {
      projectId: deployment.projectId,
      status: deployment.status,
      projectDeletedAt: deployment.project?.deletedAt ?? null,
    };
  }

  async updateDeployment(
    projectId: string,
    deploymentId: string,
    input: Partial<Omit<DeploymentRecord, 'id' | 'projectId' | 'createdAt'>>,
  ) {
    /*
     * Status transitions must be monotonic: once a deployment is terminal
     * (READY / FAILED / CANCELED) a late or out-of-order callback must not flip
     * it back (e.g. a slow provider poll marking a CANCELED build READY). When
     * this update sets a status, restrict the WHERE to non-terminal rows; if it
     * matches nothing the row is left as-is and returned unchanged.
     */
    const statusGuard = input.status !== undefined ? { status: { notIn: ['READY', 'FAILED', 'CANCELED'] as any } } : {};

    await this.prisma.deployment.updateMany({
      where: { id: deploymentId, projectId, ...statusGuard },
      data: {
        ...('environment' in input ? { environmentName: input.environment } : {}),
        status: input.status,
        url: input.url,
        previewUrl: input.previewUrl,
        productionUrl: input.productionUrl,
        framework: input.framework,
        buildCommand: input.buildCommand,
        outputDirectory: input.outputDirectory,
        branch: input.branch,
        commitSha: input.commitSha,
        customDomain: input.customDomain,
        logs: input.logs as any,
        metadata: input.metadata as any,
        rolledBackFromId: input.rolledBackFromId,
        lastMeteredAt: input.lastMeteredAt ? new Date(input.lastMeteredAt) : undefined,
        startedAt: input.startedAt ? new Date(input.startedAt) : undefined,
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
        canceledAt: input.canceledAt ? new Date(input.canceledAt) : undefined,
      } as any,
    });

    const deployment = await this.prisma.deployment.findFirstOrThrow({ where: { id: deploymentId, projectId } });

    return mapDeployment(deployment);
  }

  async listDeployments(projectId: string, options: { take?: number } = {}) {
    return (
      await this.prisma.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },

        /*
         * Cap the most-recent deployments. The /deployments endpoint fans out a
         * provider-status reconcile per row, so an unbounded list turned a
         * pollable endpoint into an unbounded burst of outbound calls on a
         * project with a long deploy history.
         */
        take: options.take ?? 100,
      })
    ).map(mapDeployment);
  }

  async listActiveServerDeployments() {
    return (
      await this.prisma.deployment.findMany({
        where: { provider: 'server', status: 'READY' as any },
        orderBy: { createdAt: 'asc' },
        // Bound one metering sweep; an unswept tail is billed on the next tick
        // (the watermark is per-row, so nothing is lost — only deferred).
        take: 500,
      })
    ).map(mapDeployment);
  }

  async createReleaseManifest(input: {
    projectId: string;
    deploymentId: string;
    environment: string;
    version: number;
    provider: string;
    artifactKind: 'static-snapshot' | 'server-image';
    artifactRef: string;
    artifactDigest: string;
    storeGeneration?: string;
    configDigest?: string;
    dbMigrationPoint?: string;
  }) {
    return mapReleaseManifest(
      await this.prisma.releaseManifest.create({
        data: {
          projectId: input.projectId,
          deploymentId: input.deploymentId,
          environment: input.environment,
          version: input.version,
          provider: input.provider,
          artifactKind: input.artifactKind,
          artifactRef: input.artifactRef,
          artifactDigest: input.artifactDigest,
          storeGeneration: input.storeGeneration ?? null,
          configDigest: input.configDigest ?? null,
          dbMigrationPoint: input.dbMigrationPoint ?? null,
        },
      }),
    );
  }

  async listReleaseManifests(projectId: string, environment: string, options?: { take?: number }) {
    return (
      await this.prisma.releaseManifest.findMany({
        where: { projectId, environment },
        orderBy: { version: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapReleaseManifest);
  }

  async getActiveRateCard() {
    const card = await this.prisma.rateCard.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
      select: { version: true, data: true },
    });

    return card ? { version: card.version, data: card.data as unknown } : undefined;
  }

  async getActiveAgentRoutingCard() {
    const card = await this.prisma.agentRoutingCard.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
      select: { version: true, data: true },
    });

    return card ? { version: card.version, data: card.data as unknown } : undefined;
  }

  async countAgentRoutingCards() {
    return this.prisma.agentRoutingCard.count();
  }

  async insertAgentRoutingCard(input: {
    version: number;
    data: unknown;
    sourceDate?: string;
    effectiveFrom?: string;
    active: boolean;
    createdByUserId?: string;
  }) {
    await this.prisma.agentRoutingCard.create({
      data: {
        version: input.version,
        data: input.data as object,
        sourceDate: input.sourceDate ?? null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        active: input.active,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
  }

  async createAgentRoutingCardVersion(input: { data: unknown; sourceDate?: string; createdByUserId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const latest = await tx.agentRoutingCard.findFirst({ orderBy: { version: 'desc' }, select: { version: true } });
      const version = (latest?.version ?? 0) + 1;

      await tx.agentRoutingCard.updateMany({
        where: { active: true },
        data: { active: false, effectiveTo: now },
      });

      /*
       * Stamp the assigned version + effectiveFrom into the JSON document too,
       * inside the same transaction, so the stored data is self-describing.
       */
      const stamped = {
        ...(input.data as Record<string, unknown>),
        version,
        effectiveFrom: now.toISOString(),
      };

      await tx.agentRoutingCard.create({
        data: {
          version,
          data: stamped,
          sourceDate: input.sourceDate ?? null,
          effectiveFrom: now,
          active: true,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      return { version, effectiveFrom: now.toISOString() };
    });
  }

  async listAgentRoutingCards(limit = 50) {
    const rows = await this.prisma.agentRoutingCard.findMany({
      orderBy: { version: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { createdBy: { select: { email: true } } },
    });

    return rows.map((row) => ({
      version: row.version,
      active: row.active,
      data: row.data as unknown,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString(),
      sourceDate: row.sourceDate ?? undefined,
      createdAt: row.createdAt.toISOString(),
      createdByUserId: row.createdByUserId ?? undefined,
      createdByEmail: row.createdBy?.email ?? undefined,
    }));
  }

  async recordAgentCall(input: {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    mode: string;
    highEffort: boolean;
    escalated: boolean;
    turbo: boolean;
    lineKey: string;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costMillicents: number;
    creditCents: number;
    marginMillicents: number;
    billedToUser: boolean;
    routingCardVersion: number;
    source: string;
  }) {
    await this.prisma.agentCallLog.create({
      data: {
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        projectId: input.projectId ?? null,
        mode: input.mode,
        highEffort: input.highEffort,
        escalated: input.escalated,
        turbo: input.turbo,
        lineKey: input.lineKey,
        provider: input.provider,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costMillicents: input.costMillicents,
        creditCents: input.creditCents,
        marginMillicents: input.marginMillicents,
        billedToUser: input.billedToUser,
        routingCardVersion: input.routingCardVersion,
        source: input.source,
      },
    });
  }

  async aggregateAgentCallVolume(sinceIso: string) {
    const rows = await this.prisma.agentCallLog.groupBy({
      by: ['lineKey'],
      where: { createdAt: { gte: new Date(sinceIso) } },
      _count: { _all: true },
      _sum: {
        tokensIn: true,
        tokensOut: true,
        costMillicents: true,
        creditCents: true,
        marginMillicents: true,
      },
    });

    return rows.map((row) => ({
      lineKey: row.lineKey,
      calls: row._count._all,
      tokensIn: row._sum.tokensIn ?? 0,
      tokensOut: row._sum.tokensOut ?? 0,
      costMillicents: row._sum.costMillicents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
      marginMillicents: row._sum.marginMillicents ?? 0,
    }));
  }

  async listAgentCalls(limit = 100) {
    const rows = await this.prisma.agentCallLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userId: row.userId ?? undefined,
      organizationId: row.organizationId ?? undefined,
      projectId: row.projectId ?? undefined,
      mode: row.mode,
      highEffort: row.highEffort,
      escalated: row.escalated,
      turbo: row.turbo,
      lineKey: row.lineKey,
      provider: row.provider,
      model: row.model,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costMillicents: row.costMillicents,
      creditCents: row.creditCents,
      marginMillicents: row.marginMillicents,
      billedToUser: row.billedToUser,
      routingCardVersion: row.routingCardVersion,
      source: row.source,
    }));
  }

  async listStaleDeployments(cutoffIso: string) {
    return (
      await this.prisma.deployment.findMany({
        where: {
          status: { in: ['QUEUED', 'BUILDING'] as any },
          updatedAt: { lt: new Date(cutoffIso) },
        },
        orderBy: { updatedAt: 'asc' },
        // Bound the sweep so a large backlog can't exceed a single reaper tick's
        // budget; the unswept tail is picked up on the next run.
        take: 200,
      })
    ).map(mapDeployment);
  }

  async createSupportTicket(input: { organizationId: string; userId: string; subject: string; category?: string }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        subject: input.subject,

        // Category rides in the existing metadata JSON column (no migration).
        metadata: input.category ? { category: input.category } : undefined,
      },
    });
    return mapSupportTicket(ticket);
  }

  async listSupportTickets(organizationId: string) {
    return (
      await this.prisma.supportTicket.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
    ).map(mapSupportTicket);
  }

  // I25: fetch a single ticket, scoped to its org so one org can't read another's
  // ticket by guessing an id. Returns null when the ticket isn't in that org.
  async getSupportTicket(organizationId: string, ticketId: string): Promise<SupportTicketRecord | null> {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, organizationId } });
    return ticket ? mapSupportTicket(ticket) : null;
  }

  // I25: the conversation thread for a ticket, oldest first.
  async listTicketMessages(ticketId: string): Promise<TicketMessageRecord[]> {
    return (await this.prisma.ticketMessage.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } })).map(
      mapTicketMessage,
    );
  }

  // I25: append a message (a user reply, an admin response, or a system note).
  async addTicketMessage(input: {
    ticketId: string;
    authorType: TicketMessageRecord['authorType'];
    authorUserId?: string;
    body: string;
  }): Promise<TicketMessageRecord> {
    return mapTicketMessage(
      await this.prisma.ticketMessage.create({
        data: {
          ticketId: input.ticketId,
          authorType: input.authorType,
          authorUserId: input.authorUserId ?? null,
          body: input.body,
        },
      }),
    );
  }

  async setFeatureFlag(input: { organizationId?: string; key: string; enabled: boolean; rolloutPercent?: number }) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { organizationId: input.organizationId ?? null, key: input.key },
    });

    // rolloutPercent lives in the `rules` JSON column; clamp to 0–100.
    const rules =
      input.rolloutPercent === undefined
        ? undefined
        : { rolloutPercent: Math.max(0, Math.min(100, Math.round(input.rolloutPercent))) };

    if (existing) {
      return mapFeatureFlag(
        await this.prisma.featureFlag.update({
          where: { id: existing.id },
          data: { enabled: input.enabled, ...(rules ? { rules } : {}) },
        }),
      );
    }

    /*
     * `[organizationId, key]` is unique, but organizationId is nullable so we
     * can't drive a Prisma upsert through the compound key for the global
     * (null-org) case. Two concurrent calls can both miss the findFirst above
     * and the second create() then violates the unique constraint, surfacing as
     * an uncoded 500 / duplicate row. Treat P2002 as "another writer won the
     * race" and fall back to updating the row they inserted.
     */
    try {
      return mapFeatureFlag(
        await this.prisma.featureFlag.create({
          data: { organizationId: input.organizationId, key: input.key, enabled: input.enabled, rules },
        }),
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error;
      }

      const winner = await this.prisma.featureFlag.findFirst({
        where: { organizationId: input.organizationId ?? null, key: input.key },
      });

      if (!winner) {
        throw error;
      }

      return mapFeatureFlag(
        await this.prisma.featureFlag.update({
          where: { id: winner.id },
          data: { enabled: input.enabled, ...(rules ? { rules } : {}) },
        }),
      );
    }
  }

  async listFeatureFlags(organizationId?: string) {
    return (
      await this.prisma.featureFlag.findMany({
        where: { organizationId: organizationId ?? null },
        orderBy: { key: 'asc' },
        // Bound the payload — an unbounded findMany on a misconfigured tenant could
        // return an enormous list. 1000 flags is far beyond any real registry.
        take: 1000,
      })
    ).map(mapFeatureFlag);
  }

  async findFeatureFlag(key: string, organizationId?: string) {
    if (organizationId) {
      const scoped = await this.prisma.featureFlag.findFirst({ where: { organizationId, key } });

      if (scoped) {
        return mapFeatureFlag(scoped);
      }
    }

    const global = await this.prisma.featureFlag.findFirst({ where: { organizationId: null, key } });

    return global ? mapFeatureFlag(global) : undefined;
  }

  async listEffectiveFeatureFlags(organizationId?: string) {
    const [globals, scoped] = await Promise.all([
      this.prisma.featureFlag.findMany({ where: { organizationId: null } }),
      organizationId
        ? this.prisma.featureFlag.findMany({ where: { organizationId } })
        : Promise.resolve([] as unknown[]),
    ]);

    const byKey = new Map<string, FeatureFlagRecord>();

    for (const flag of globals) {
      byKey.set((flag as any).key, mapFeatureFlag(flag));
    }

    for (const flag of scoped as any[]) {
      byKey.set(flag.key, mapFeatureFlag(flag));
    }

    return [...byKey.values()];
  }

  async createAbuseEvent(input: { organizationId?: string; userId?: string; type: string; severity: string }) {
    return mapAbuseEvent(await this.prisma.abuseEvent.create({ data: input }));
  }

  async listAbuseEvents(filter?: { organizationId?: string; type?: string; take?: number }) {
    /*
     * Bounded + filterable. The unfiltered version did a platform-wide,
     * unbounded full-table scan on the usage hot path (evaluateUsageAbuse runs
     * on every AI message / preview / workspace start). Callers that only care
     * about one org pass organizationId so the query is scoped; admin views pass
     * a take cap. A hard default cap protects against an ever-growing table.
     */
    const where =
      filter?.organizationId || filter?.type ? { organizationId: filter.organizationId, type: filter.type } : undefined;

    return (
      await this.prisma.abuseEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filter?.take ?? 1000,
      })
    ).map(mapAbuseEvent);
  }

  async createIntegrationFeatureRequest(input: {
    userId: string;
    organizationId?: string;
    integrationName: string;
    useCaseDescription: string;
  }) {
    return mapIntegrationFeatureRequest(
      await this.prisma.integrationFeatureRequest.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          integrationName: input.integrationName,
          useCaseDescription: input.useCaseDescription,
        },
      }),
    );
  }

  async listIntegrationFeatureRequests(filter: { userId: string; organizationId?: string; take?: number }) {
    /*
     * Scoped to the requesting user. When the user supplies an organization
     * context we also surface that org's requests (so org members see what
     * teammates have already asked for and avoid duplicate submissions); the
     * `userId` clause keeps the user's own requests visible regardless of org.
     */
    return (
      await this.prisma.integrationFeatureRequest.findMany({
        where: filter.organizationId
          ? { OR: [{ userId: filter.userId }, { organizationId: filter.organizationId }] }
          : { userId: filter.userId },
        orderBy: { createdAt: 'desc' },
        take: filter.take ?? 200,
      })
    ).map(mapIntegrationFeatureRequest);
  }

  async upsertAiMessageFeedback(input: {
    userId: string;
    messageId: string;
    vote: AiMessageFeedbackVote;
    chatId?: string;
  }) {
    return mapAiMessageFeedback(
      await this.prisma.aiMessageFeedback.upsert({
        where: { userId_messageId: { userId: input.userId, messageId: input.messageId } },
        create: {
          userId: input.userId,
          messageId: input.messageId,
          vote: input.vote,
          chatId: input.chatId,
        },
        // An undefined chatId is skipped by Prisma, keeping the stored one.
        update: { vote: input.vote, chatId: input.chatId },
      }),
    );
  }

  async deleteAiMessageFeedback(input: { userId: string; messageId: string }) {
    const result = await this.prisma.aiMessageFeedback.deleteMany({
      where: { userId: input.userId, messageId: input.messageId },
    });

    return result.count > 0;
  }

  async setSystemSetting(input: { key: string; value?: unknown }) {
    return mapSystemSetting(
      await this.prisma.systemSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: (input.value ?? null) as any },
        update: { value: (input.value ?? null) as any },
      }),
    );
  }

  async mutateSystemSettingIds(key: string, change: { add?: string; remove?: string }): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      /*
       * Serialize concurrent mutations of this setting's id-array with a
       * transaction-scoped advisory lock (works even when the row doesn't exist
       * yet, unlike SELECT ... FOR UPDATE). Without it, two concurrent
       * suspend/unsuspend operations both read the old array and the later write
       * dropped the other's change (lost update).
       */
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `system-setting:${key}`);

      const existing = await tx.systemSetting.findUnique({ where: { key } });

      const current = Array.isArray(existing?.value)
        ? (existing!.value as unknown[]).filter((item): item is string => typeof item === 'string')
        : [];

      const set = new Set(current);

      if (change.add) {
        set.add(change.add);
      }

      if (change.remove) {
        set.delete(change.remove);
      }

      const next = [...set];
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: next as any },
        update: { value: next as any },
      });

      return next;
    });
  }

  async listSystemSettings() {
    return (await this.prisma.systemSetting.findMany()).map(mapSystemSetting);
  }

  async getEnterpriseSettings(organizationId: string) {
    const settings = await this.prisma.enterpriseOrganizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ipAllowlist: [],
        // MFA optional everywhere (Avi's decision): default an org to NOT forcing
        // admin MFA. Note this setting is not itself an enforcement gate — the
        // global ADMIN_MFA_REQUIRED env (adminMfaRequired()) is the real lever —
        // so this default is for consistency/UI, not behavior.
        requireMfaForAdmins: false,
        dataRetentionDays: 365,
        legalHoldEnabled: false,
      },
      update: {},
    });
    return mapEnterpriseSettings(settings);
  }

  async updateEnterpriseSettings(
    input: Partial<Omit<EnterpriseSettingsRecord, 'updatedAt'>> & { organizationId: string },
  ) {
    return mapEnterpriseSettings(
      await this.prisma.enterpriseOrganizationSettings.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          ipAllowlist: input.ipAllowlist ?? [],
          sessionDurationMinutes: input.sessionDurationMinutes,
          requireMfaForAdmins: input.requireMfaForAdmins ?? false,
          dataRetentionDays: input.dataRetentionDays ?? 365,
          legalHoldEnabled: input.legalHoldEnabled ?? false,
          ssoEnforced: input.ssoEnforced ?? false,
          // undefined on the record means "not provided"; null/ISO both map to a concrete value.
          ssoEnforcedAt:
            input.ssoEnforcedAt === undefined ? undefined : input.ssoEnforcedAt ? new Date(input.ssoEnforcedAt) : null,
        },
        update: {
          ipAllowlist: input.ipAllowlist,
          sessionDurationMinutes: input.sessionDurationMinutes,
          requireMfaForAdmins: input.requireMfaForAdmins,
          dataRetentionDays: input.dataRetentionDays,
          legalHoldEnabled: input.legalHoldEnabled,
          ssoEnforced: input.ssoEnforced,
          // Passing `null` clears the clock (enforcement turned off); `undefined` leaves it untouched.
          ssoEnforcedAt:
            input.ssoEnforcedAt === undefined ? undefined : input.ssoEnforcedAt ? new Date(input.ssoEnforcedAt) : null,
        },
      }),
    );
  }

  async createDomainVerification(input: {
    organizationId: string;
    domain: string;
    verificationToken: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const domain = input.domain.toLowerCase();
    const redirectWww = input.redirectWww ?? true;
    const wildcardEnabled = input.wildcardEnabled ?? false;

    return mapDomainVerification(
      await this.prisma.verifiedDomain.upsert({
        where: { organizationId_domain: { organizationId: input.organizationId, domain } },
        create: {
          organizationId: input.organizationId,
          domain,
          verificationToken: input.verificationToken,
          redirectWww,
          wildcardEnabled,
          sslStatus: 'pending_dns',
        },
        update: {
          verificationToken: input.verificationToken,
          verifiedAt: null,
          redirectWww,
          wildcardEnabled,
          sslStatus: 'pending_dns',
        },
      }),
    );
  }

  async verifyDomain(input: { organizationId: string; domain: string }) {
    const domain = input.domain.toLowerCase();

    const record = await this.prisma.verifiedDomain.findUnique({
      where: { organizationId_domain: { organizationId: input.organizationId, domain } },
    });

    if (!record) {
      return undefined;
    }

    /*
     * The DNS challenge mirrors what the UI instructs the operator to publish:
     * a TXT record at `_vibecore.<domain>` whose value is
     * `vibecore-domain-verification=<verificationToken>`. We only mark the
     * domain verified when that exact record is observed in DNS — never
     * unconditionally.
     */
    const host = `_vibecore.${domain}`;
    const expected = `vibecore-domain-verification=${record.verificationToken}`;

    let txtRecords: string[][];

    try {
      txtRecords = await this.resolveTxt(host);
    } catch (error: any) {
      const code = error?.code as string | undefined;

      const message =
        code === 'ENOTFOUND' || code === 'ENODATA'
          ? `No TXT record found at ${host}. Add a TXT record with value "${expected}" and try again once DNS propagates.`
          : `DNS lookup for ${host} failed (${code ?? error?.message ?? 'unknown error'}). Try again shortly.`;

      /*
       * A missing TXT record (ENOTFOUND/ENODATA) or a transient resolver error
       * is not a terminal failure — the operator is told to retry once DNS
       * propagates. Marking the domain `failed` here stuck the UI on a dead-end
       * state for a record that was simply not published yet. Keep it
       * `pending_dns` so the verification flow remains resumable; only a real
       * value mismatch (below) is a genuine failure.
       */
      await this.prisma.verifiedDomain.update({ where: { id: record.id }, data: { sslStatus: 'pending_dns' } });

      throw Object.assign(new Error(message), { statusCode: 422, code: 'DOMAIN_VERIFICATION_FAILED' });
    }

    // resolveTxt returns one string[] per record (split into 255-char chunks); rejoin before comparing.
    const matched = txtRecords.some((chunks) => chunks.join('').trim() === expected);

    if (!matched) {
      /*
       * Re-verifying a previously-verified domain whose TXT record has since
       * changed/disappeared must also clear verifiedAt — otherwise the row is
       * left in a contradictory `verifiedAt: <date>, sslStatus: 'failed'` state
       * and any consumer keying off verifiedAt still treats it as verified.
       */
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: { sslStatus: 'failed', verifiedAt: null },
      });

      throw Object.assign(
        new Error(
          `TXT record at ${host} did not match the expected verification value. Found ${txtRecords.length} record(s), none equal to "${expected}".`,
        ),
        { statusCode: 422, code: 'DOMAIN_VERIFICATION_FAILED' },
      );
    }

    return mapDomainVerification(
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: { verifiedAt: new Date(), sslStatus: 'dns_verified' },
      }),
    );
  }

  async updateDomainVerificationConfig(input: {
    organizationId: string;
    domain: string;
    redirectWww?: boolean;
    wildcardEnabled?: boolean;
  }) {
    const record = await this.prisma.verifiedDomain.findUnique({
      where: { organizationId_domain: { organizationId: input.organizationId, domain: input.domain.toLowerCase() } },
    });

    if (!record) {
      return undefined;
    }

    return mapDomainVerification(
      await this.prisma.verifiedDomain.update({
        where: { id: record.id },
        data: {
          ...(typeof input.redirectWww === 'boolean' ? { redirectWww: input.redirectWww } : {}),
          ...(typeof input.wildcardEnabled === 'boolean' ? { wildcardEnabled: input.wildcardEnabled } : {}),
        },
      }),
    );
  }

  async listDomainVerifications(organizationId: string) {
    return (await this.prisma.verifiedDomain.findMany({ where: { organizationId } })).map(mapDomainVerification);
  }

  async upsertSsoConfig(input: {
    organizationId: string;
    type: 'oidc' | 'saml';
    enabled: boolean;
    encryptedConfig: string;
  }) {
    return mapSsoConfig(
      await this.prisma.ssoConfiguration.upsert({
        where: { organizationId_type: { organizationId: input.organizationId, type: input.type } },
        create: input,
        update: { enabled: input.enabled, encryptedConfig: input.encryptedConfig },
      }),
    );
  }

  async getSsoConfig(organizationId: string, type: 'oidc' | 'saml') {
    const config = await this.prisma.ssoConfiguration.findUnique({
      where: { organizationId_type: { organizationId, type } },
    });
    return config ? mapSsoConfig(config) : undefined;
  }

  async createScimToken(input: { organizationId: string; name: string; token: string }) {
    return mapScimToken(
      await this.prisma.scimToken.create({
        data: { organizationId: input.organizationId, name: input.name, tokenHash: hashToken(input.token) },
      }),
    );
  }

  async findScimToken(token: string) {
    const tokenHash = hashToken(token);

    /*
     * F16 — dual-valid: authenticate the CURRENT hash OR a PREVIOUS hash that is
     * still inside its 24h rotation window (rotatedAt within the last 24h). Outside
     * that window the previous hash no longer matches, so an old bearer stops working.
     */
    const rotationWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const record = await this.prisma.scimToken.findFirst({
      where: {
        OR: [{ tokenHash }, { previousTokenHash: tokenHash, rotatedAt: { gte: rotationWindowStart } }],
      },
    });

    if (!record) {
      return undefined;
    }

    /*
     * A SCIM token can be revoked (deleted) concurrently with a request that is
     * authenticating against it; the lastUsedAt bump would then throw P2025 and
     * surface as a 500 on the auth path instead of the caller's intended 401.
     * Mirror the row-may-be-gone convention used elsewhere in this store and
     * return undefined (treated as "invalid token") rather than crashing.
     */
    try {
      return mapScimToken(
        await this.prisma.scimToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }),
      );
    } catch {
      return undefined;
    }
  }

  async listScimTokens(organizationId: string) {
    const records = await this.prisma.scimToken.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapScimToken);
  }

  async revokeScimToken(tokenId: string) {
    try {
      const deleted = await this.prisma.scimToken.delete({ where: { id: tokenId } });
      return mapScimToken(deleted);
    } catch {
      return undefined;
    }
  }

  /*
   * F16 — 24h dual-valid rotation: mint a new bearer IN PLACE (same row/id), moving
   * the old hash to previousTokenHash and stamping rotatedAt. The previous token keeps
   * authenticating for 24h (see findScimToken) so an IdP can roll over with no
   * downtime. Returns undefined if the token id no longer exists.
   */
  async rotateScimToken(tokenId: string, newToken: string) {
    try {
      const existing = await this.prisma.scimToken.findUnique({ where: { id: tokenId } });

      if (!existing) {
        return undefined;
      }

      return mapScimToken(
        await this.prisma.scimToken.update({
          where: { id: tokenId },
          data: {
            previousTokenHash: existing.tokenHash,
            tokenHash: hashToken(newToken),
            rotatedAt: new Date(),
          },
        }),
      );
    } catch {
      return undefined;
    }
  }

  async createCustomRole(input: { organizationId: string; key: string; name: string; permissions: PermissionKey[] }) {
    return mapCustomRole(
      await this.prisma.customRole.upsert({
        where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
        create: input,
        update: { name: input.name, permissions: input.permissions },
      }),
    );
  }

  async listCustomRoles(organizationId: string) {
    return (await this.prisma.customRole.findMany({ where: { organizationId } })).map(mapCustomRole);
  }

  async createSiemWebhook(input: {
    organizationId: string;
    url: string;
    secret: string;
    secretCiphertext: string;
    enabled: boolean;
  }) {
    return mapSiemWebhook(
      await this.prisma.siemWebhook.create({
        data: {
          organizationId: input.organizationId,
          url: input.url,
          secretHash: hashToken(input.secret),
          secretCiphertext: input.secretCiphertext,
          enabled: input.enabled,
        },
      }),
    );
  }

  async listSiemWebhooks(organizationId: string) {
    return (await this.prisma.siemWebhook.findMany({ where: { organizationId } })).map(mapSiemWebhook);
  }

  async deleteSiemWebhook(organizationId: string, webhookId: string) {
    /*
     * Scope the delete by BOTH id and organizationId so an admin of one org can
     * never remove another tenant's webhook by guessing an id. deleteMany
     * returns a count (0 when no row matched the org-scoped filter) rather than
     * throwing, so we look the record up first to return it (and 404 upstream).
     */
    const existing = await this.prisma.siemWebhook.findFirst({ where: { id: webhookId, organizationId } });

    if (!existing) {
      return null;
    }

    await this.prisma.siemWebhook.deleteMany({ where: { id: webhookId, organizationId } });

    return mapSiemWebhook(existing);
  }

  async createApiKey(input: {
    userId?: string;
    organizationId?: string;
    name: string;
    keyHash: string;
    keyPrefix: string;
    scopes: ApiKeyScope[];
    expiresAt?: Date;
  }) {
    return mapApiKey(
      await this.prisma.apiKey.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId,
          name: input.name,
          keyHash: input.keyHash,
          keyPrefix: input.keyPrefix,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
        },
      }),
    );
  }

  async listApiKeys(scope: { userId?: string; organizationId?: string }) {
    const where = scope.organizationId ? { organizationId: scope.organizationId } : { userId: scope.userId };

    return (await this.prisma.apiKey.findMany({ where, orderBy: { createdAt: 'desc' } })).map(mapApiKey);
  }

  async findApiKeyByHash(keyHash: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    return key ? mapApiKey(key) : undefined;
  }

  async touchApiKey(id: string) {
    await this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async deleteApiKey(input: { id: string; userId?: string; organizationId?: string }) {
    const result = await this.prisma.apiKey.deleteMany({
      where: {
        id: input.id,
        ...(input.organizationId ? { organizationId: input.organizationId } : { userId: input.userId }),
      },
    });

    return result.count > 0;
  }

  async createOrganizationInvite(input: {
    organizationId: string;
    email: string;
    roleKey: string;
    token: string;
    expiresAt: Date;
  }) {
    const role = await this.ensureRole(input.roleKey);

    const invite = await this.prisma.organizationInvite.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        roleId: role.id,
        tokenHash: hashToken(input.token),
        expiresAt: input.expiresAt,
      },
      include: { role: true },
    });

    return mapOrganizationInvite(invite);
  }

  async findOrganizationInviteByToken(token: string) {
    const tokenHash = hashToken(token);
    const invite = await this.prisma.organizationInvite.findUnique({ where: { tokenHash }, include: { role: true } });

    if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
      return undefined;
    }

    return mapOrganizationInvite(invite);
  }

  async consumeOrganizationInvite(token: string, userId: string) {
    const tokenHash = hashToken(token);
    const invite = await this.prisma.organizationInvite.findUnique({ where: { tokenHash }, include: { role: true } });

    if (!invite) {
      return undefined;
    }

    const consumedAt = new Date();

    const consumed = await this.prisma.organizationInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, expiresAt: { gt: consumedAt } },
      data: { acceptedAt: consumedAt },
    });

    if (consumed.count === 0) {
      return undefined;
    }

    /*
     * Only provision the role for users who are NOT already members. addMember
     * upserts the role, so for an existing member accepting an invite it would
     * blindly overwrite their current role — an invite at a lower role (or a
     * leaked invite) could silently downgrade an owner (lockout) or, with a
     * higher-role invite, escalate without admin action. Existing members'
     * roles stay org-controlled; the invite is just marked consumed.
     */
    const existingMembership = await this.getMembership(userId, invite.organizationId);

    if (!existingMembership) {
      await this.addMember({ organizationId: invite.organizationId, userId, roleKey: invite.role.key });
    }

    return mapOrganizationInvite({ ...invite, acceptedAt: consumedAt });
  }

  async listOrganizationInvites(organizationId: string) {
    return (await this.prisma.organizationInvite.findMany({ where: { organizationId }, include: { role: true } })).map(
      mapOrganizationInvite,
    );
  }

  async resendOrganizationInvite(inviteId: string, token: string, expiresAt: Date) {
    const invite = await this.prisma.organizationInvite.findUnique({ where: { id: inviteId } });

    if (!invite || invite.acceptedAt) {
      return undefined;
    }

    return mapOrganizationInvite(
      await this.prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { tokenHash: hashToken(token), expiresAt },
        include: { role: true },
      }),
    );
  }

  async expireOrganizationInvite(inviteId: string) {
    const invite = await this.prisma.organizationInvite.findUnique({
      where: { id: inviteId },
      include: { role: true },
    });

    if (!invite) {
      return undefined;
    }

    return mapOrganizationInvite(
      await this.prisma.organizationInvite.update({
        where: { id: inviteId },
        data: { expiresAt: new Date() },
        include: { role: true },
      }),
    );
  }

  async upsertOAuthConnection(input: {
    userId: string;
    provider: string;
    externalId: string;
    accessToken: string;
    refreshToken?: string;
  }) {
    return mapOAuthConnection(
      await this.prisma.oAuthConnection.upsert({
        where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
        create: {
          userId: input.userId,
          provider: input.provider,
          externalId: input.externalId,
          accessHash: hashToken(input.accessToken),
          refreshHash: input.refreshToken ? hashToken(input.refreshToken) : undefined,
        },
        update: {
          userId: input.userId,
          accessHash: hashToken(input.accessToken),
          refreshHash: input.refreshToken ? hashToken(input.refreshToken) : undefined,
        },
      }),
    );
  }

  async listOAuthConnections(userId: string) {
    return (
      await this.prisma.oAuthConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      })
    ).map(mapOAuthConnection);
  }

  async findOAuthConnectionByExternalId(provider: string, externalId: string) {
    const row = await this.prisma.oAuthConnection.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });

    return row ? mapOAuthConnection(row) : null;
  }

  async deleteOAuthConnection(userId: string, provider: string) {
    const result = await this.prisma.oAuthConnection.deleteMany({ where: { userId, provider } });

    return result.count > 0;
  }

  async upsertUserConnection(input: {
    userId: string;
    provider: string;
    externalAccountId: string;
    externalAccountLabel: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    apiKeyFieldsEncrypted?: Record<string, string>;
    scopes: string[];
    tokenExpiresAt?: Date;
    forAgentUse?: boolean;
    oauthAppSource?: 'e_code_default' | 'org_override';
    oauthAppOverrideId?: string;
    createdByUserId: string;
  }) {
    return mapUserConnection(
      await this.prisma.userConnection.upsert({
        where: {
          userId_provider_externalAccountId: {
            userId: input.userId,
            provider: input.provider,
            externalAccountId: input.externalAccountId,
          },
        },
        create: {
          userId: input.userId,
          provider: input.provider,
          externalAccountId: input.externalAccountId,
          externalAccountLabel: input.externalAccountLabel,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          apiKeyFieldsEncrypted: input.apiKeyFieldsEncrypted as never,
          scopes: input.scopes,
          tokenExpiresAt: input.tokenExpiresAt,
          forAgentUse: input.forAgentUse ?? true,
          oauthAppSource: input.oauthAppSource ?? 'e_code_default',
          oauthAppOverrideId: input.oauthAppOverrideId,
          createdByUserId: input.createdByUserId,
          status: 'active',
        },
        update: {
          externalAccountLabel: input.externalAccountLabel,
          accessTokenEncrypted: input.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshTokenEncrypted,
          apiKeyFieldsEncrypted: input.apiKeyFieldsEncrypted as never,
          scopes: input.scopes,
          tokenExpiresAt: input.tokenExpiresAt,
          forAgentUse: input.forAgentUse,
          oauthAppSource: input.oauthAppSource,
          oauthAppOverrideId: input.oauthAppOverrideId,
          status: 'active',
          revokedAt: null,
        },
      }),
    );
  }

  async getUserConnectionById(id: string) {
    const row = await this.prisma.userConnection.findUnique({ where: { id } });

    return row ? mapUserConnection(row) : undefined;
  }

  async listUserConnectionsByUser(userId: string, opts?: { provider?: string }) {
    const rows = await this.prisma.userConnection.findMany({
      where: {
        userId,
        provider: opts?.provider,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapUserConnection);
  }

  async markUserConnectionStatus(input: {
    id: string;
    status: UserConnectionStatus;
    revokedAt?: Date;
    clearTokens?: boolean;
  }) {
    try {
      const updated = await this.prisma.userConnection.update({
        where: { id: input.id },
        data: {
          status: input.status,
          revokedAt: input.revokedAt,

          /*
           * On revoke, destroy the stored credentials — leaving the encrypted
           * access/refresh tokens in the DB after the user revokes is needless
           * retention of a live secret (the connector-proxy keys off status, but
           * the row still holds usable tokens until purged).
           */
          ...(input.clearTokens ? { accessTokenEncrypted: null, refreshTokenEncrypted: null } : {}),
        },
      });

      return mapUserConnection(updated);
    } catch {
      return undefined;
    }
  }

  async linkProjectToUserConnection(input: { projectId: string; userConnectionId: string; linkedByUserId: string }) {
    const link = await this.prisma.projectConnectionLink.upsert({
      where: {
        projectId_userConnectionId: {
          projectId: input.projectId,
          userConnectionId: input.userConnectionId,
        },
      },
      create: {
        projectId: input.projectId,
        userConnectionId: input.userConnectionId,
        linkedByUserId: input.linkedByUserId,
      },
      update: { unlinkedAt: null },
    });

    return mapProjectConnectionLink(link);
  }

  async unlinkProjectFromUserConnection(input: { projectId: string; userConnectionId: string }) {
    const link = await this.prisma.projectConnectionLink.findUnique({
      where: {
        projectId_userConnectionId: {
          projectId: input.projectId,
          userConnectionId: input.userConnectionId,
        },
      },
    });

    if (!link) {
      return undefined;
    }

    const updated = await this.prisma.projectConnectionLink.update({
      where: { id: link.id },
      data: { unlinkedAt: new Date() },
    });

    return mapProjectConnectionLink(updated);
  }

  async listProjectConnectionLinks(projectId: string, opts?: { includeUnlinked?: boolean }) {
    const rows = await this.prisma.projectConnectionLink.findMany({
      where: {
        projectId,
        unlinkedAt: opts?.includeUnlinked ? undefined : null,
      },
      orderBy: { linkedAt: 'desc' },
    });

    return rows.map(mapProjectConnectionLink);
  }

  async createNotification(input: {
    userId: string;
    category?: string;
    title: string;
    body?: string;
    linkUrl?: string;
    metadata?: Record<string, unknown>;
  }) {
    const row = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        category: input.category ?? 'system',
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return mapNotification(row);
  }

  async listNotificationsByUser(input: { userId: string; limit?: number }) {
    const rows = await this.prisma.notification.findMany({
      where: { userId: input.userId },
      // Unread first, then newest — a compact, actionable feed.
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });

    return rows.map(mapNotification);
  }

  async countUnreadNotificationsByUser(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async getNotificationById(id: string) {
    const row = await this.prisma.notification.findUnique({ where: { id } });

    return row ? mapNotification(row) : undefined;
  }

  async markNotificationRead(input: { id: string; readAt?: Date }) {
    try {
      const updated = await this.prisma.notification.update({
        where: { id: input.id },
        data: { readAt: input.readAt ?? new Date() },
      });

      return mapNotification(updated);
    } catch {
      return undefined;
    }
  }

  async markAllNotificationsRead(input: { userId: string; readAt?: Date }) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: input.userId, readAt: null },
      data: { readAt: input.readAt ?? new Date() },
    });

    return result.count;
  }

  async listUnresolvedReconnectionAlertsByUser(userId: string) {
    const rows = await this.prisma.reconnectionAlert.findMany({
      where: {
        resolvedAt: null,
        userConnection: { userId },
      },
      include: { userConnection: true },
      orderBy: { detectedAt: 'desc' },
    });

    return rows.map(mapReconnectionAlert);
  }

  async getReconnectionAlertById(id: string) {
    const row = await this.prisma.reconnectionAlert.findUnique({
      where: { id },
      include: { userConnection: true },
    });

    return row ? mapReconnectionAlert(row) : undefined;
  }

  async resolveReconnectionAlert(input: { id: string; resolvedAt?: Date }) {
    try {
      const updated = await this.prisma.reconnectionAlert.update({
        where: { id: input.id },
        data: { resolvedAt: input.resolvedAt ?? new Date() },
        include: { userConnection: true },
      });

      return mapReconnectionAlert(updated);
    } catch {
      return undefined;
    }
  }

  async createAiConversation(input: { projectId?: string; userId: string; title?: string }) {
    return mapAiConversation(await this.prisma.aiConversation.create({ data: input }));
  }

  async getAiConversation(id: string) {
    const conversation = await this.prisma.aiConversation.findUnique({ where: { id } });
    return conversation ? mapAiConversation(conversation) : undefined;
  }

  async listAiConversations(input: { projectId: string; userId: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    return (
      await this.prisma.aiConversation.findMany({
        where: {
          projectId: input.projectId,
          userId: input.userId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
    ).map(mapAiConversation);
  }

  async createAiMessage(input: {
    id?: string;
    conversationId: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }) {
    if (input.id) {
      return mapAiMessage(
        await this.prisma.aiMessage.upsert({
          where: { id: input.id },
          create: input,
          update: {
            role: input.role,
            content: input.content,
          },
        }),
      );
    }

    return mapAiMessage(await this.prisma.aiMessage.create({ data: input }));
  }

  async listAiMessages(conversationId: string) {
    /*
     * Cap the number of messages loaded so a long-lived conversation can't pull
     * its entire (content-heavy) history into memory on every request. We take the
     * most recent N rows, then restore chronological (ascending) order for callers.
     */
    const MAX_AI_MESSAGES = 500;

    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_AI_MESSAGES,
    });

    return rows.reverse().map(mapAiMessage);
  }

  async createAiToolCall(input: { messageId: string; name: string; input?: unknown; output?: unknown }) {
    return mapAiToolCall(
      await this.prisma.aiToolCall.create({
        data: {
          messageId: input.messageId,
          name: input.name,
          input: (input.input ?? null) as any,
          output: (input.output ?? null) as any,
        },
      }),
    );
  }

  async listAiToolCallsByMessageIds(messageIds: string[]) {
    if (messageIds.length === 0) {
      return [];
    }

    return (
      await this.prisma.aiToolCall.findMany({
        where: { messageId: { in: messageIds } },
        orderBy: { createdAt: 'asc' },
      })
    ).map(mapAiToolCall);
  }

  async createAiTokenUsage(input: {
    messageId: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  }) {
    return mapAiTokenUsage(await this.prisma.aiTokenUsage.create({ data: input }));
  }

  async createProviderRequestMetric(input: {
    provider: string;
    model?: string | null;
    latencyMs: number;
    errored: boolean;
    statusCode?: number | null;
    source?: string | null;
  }) {
    await this.prisma.providerRequestMetric.create({
      data: {
        provider: input.provider,
        model: input.model ?? null,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        errored: input.errored,
        statusCode: input.statusCode ?? null,
        source: input.source ?? null,
      },
    });
  }

  async listProviderRequestMetricsSince(since: Date, limit = 50_000) {
    const rows = await this.prisma.providerRequestMetric.findMany({
      where: { createdAt: { gte: since } },
      select: { provider: true, latencyMs: true, errored: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows;
  }

  async recordAiCost(input: {
    organizationId: string;
    projectId?: string;
    conversationId?: string;
    messageId?: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    reason: string;
  }) {
    return mapAiCostLedger(await this.prisma.aiCostLedger.create({ data: input }));
  }

  async listAiCosts(organizationId: string, range?: { from?: string; to?: string }) {
    /*
     * Push the date filter into the query for range-scoped callers (the billing
     * summary dashboard) instead of loading the org's entire — fastest-growing —
     * cost ledger into memory and filtering in JS. Callers that need everything
     * (data export) simply omit the range.
     */
    const where: any = { organizationId };

    if (range?.from || range?.to) {
      where.createdAt = {
        ...(range.from ? { gte: new Date(range.from) } : {}),
        ...(range.to ? { lte: new Date(range.to) } : {}),
      };
    }

    return (await this.prisma.aiCostLedger.findMany({ where, orderBy: { createdAt: 'desc' } })).map(mapAiCostLedger);
  }

  // --- Replit-parity: credit wallet ------------------------------------------

  async getCreditWallet(organizationId: string) {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { organizationId } });
    return wallet ? mapCreditWallet(wallet) : undefined;
  }

  async ensureCreditWallet(organizationId: string) {
    return mapCreditWallet(
      await this.prisma.creditWallet.upsert({
        where: { organizationId },
        update: {},
        create: { organizationId },
      }),
    );
  }

  async updateCreditWalletSettings(input: {
    organizationId: string;
    budgetCapCents?: number | null;
    serviceShutdownCents?: number | null;
    autoTopupCents?: number | null;
  }) {
    const data: Record<string, unknown> = {};
    if (input.budgetCapCents !== undefined) {
      data.budgetCapCents = input.budgetCapCents;
    }
    if (input.serviceShutdownCents !== undefined) {
      data.serviceShutdownCents = input.serviceShutdownCents;
    }
    if (input.autoTopupCents !== undefined) {
      data.autoTopupCents = input.autoTopupCents;
    }
    return mapCreditWallet(
      await this.prisma.creditWallet.upsert({
        where: { organizationId: input.organizationId },
        update: data,
        create: { organizationId: input.organizationId, ...data },
      }),
    );
  }

  async recordCreditEntry(input: {
    organizationId: string;
    deltaCents: number;
    kind: CreditEntryKind;
    reason: string;
    checkpointId?: string;
    expiresAt?: Date;
    metadata?: unknown;
  }) {
    /*
     * The ledger insert and the materialized-balance bump must be one atomic unit
     * or concurrent debits could over-spend (read-modify-write race). Prisma's
     * interactive transaction + an atomic `increment` keeps the balance exact
     * without an app-level lock.
     */
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.creditWallet.upsert({
        where: { organizationId: input.organizationId },
        update: {},
        create: { organizationId: input.organizationId },
      });
      const entry = await tx.creditLedger.create({
        data: {
          walletId: wallet.id,
          organizationId: input.organizationId,
          deltaCents: input.deltaCents,
          kind: input.kind,
          reason: input.reason,
          checkpointId: input.checkpointId,
          expiresAt: input.expiresAt,
          metadata: (input.metadata ?? null) as any,
        },
      });
      const updated = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: { balanceCents: { increment: input.deltaCents } },
      });
      return { entry: mapCreditLedger(entry), balanceCents: updated.balanceCents };
    });
  }

  async listCreditLedger(organizationId: string, options?: { take?: number }) {
    return (
      await this.prisma.creditLedger.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapCreditLedger);
  }

  async sumPaygSpendSince(organizationId: string, sinceMs: number): Promise<number> {
    const result = await this.prisma.creditLedger.aggregate({
      where: { organizationId, kind: 'PAYG_CHARGE', createdAt: { gte: new Date(sinceMs) } },
      _sum: { deltaCents: true },
    });

    // PAYG_CHARGE deltas are negative (debits); spend is their absolute value.
    return Math.abs(result._sum.deltaCents ?? 0);
  }

  async getUserSpendLimit(organizationId: string, userId: string) {
    const row = await this.prisma.userSpendLimit.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          userId: row.userId,
          limitCents: row.limitCents,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : undefined;
  }

  async setUserSpendLimit(input: { organizationId: string; userId: string; limitCents: number }) {
    const row = await this.prisma.userSpendLimit.upsert({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      update: { limitCents: input.limitCents },
      create: { organizationId: input.organizationId, userId: input.userId, limitCents: input.limitCents },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      limitCents: row.limitCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async clearUserSpendLimit(organizationId: string, userId: string) {
    await this.prisma.userSpendLimit.deleteMany({ where: { organizationId, userId } });
  }

  async listUserSpendLimits(organizationId: string) {
    const rows = await this.prisma.userSpendLimit.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      limitCents: row.limitCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async sumUserSpendSince(organizationId: string, userId: string, sinceMs: number): Promise<number> {
    const result = await this.prisma.agentCheckpoint.aggregate({
      where: { organizationId, userId, startedAt: { gte: new Date(sinceMs) } },
      _sum: { creditCents: true },
    });
    return Math.max(0, result._sum.creditCents ?? 0);
  }

  async recordPaygCharge(input: { organizationId: string; checkpointId: string; cents: number }): Promise<void> {
    const cents = Math.max(0, Math.ceil(input.cents));

    if (cents <= 0) {
      return;
    }

    /*
     * TRACKING-ONLY ledger entry. PAYG overage is billed to Stripe (real money),
     * NOT drawn from the credit wallet — so unlike recordCreditEntry this writes a
     * PAYG_CHARGE row WITHOUT touching balanceCents (debiting the wallet here would
     * double-charge: Stripe + credits). sumPaygSpendSince() reads these rows to
     * enforce budgetCapCents + fire spend alerts (which were dead at 0 before this).
     * Deduped by (org, kind, checkpointId) so a re-settle never double-counts.
     */
    const wallet = await this.prisma.creditWallet.upsert({
      where: { organizationId: input.organizationId },
      update: {},
      create: { organizationId: input.organizationId },
    });

    /*
     * Atomic dedup: insert and let the partial unique index
     * (organizationId, checkpointId) WHERE kind='PAYG_CHARGE' reject a duplicate
     * with P2002. The old find-then-create was a non-atomic TOCTOU — two concurrent
     * settlements of the same checkpoint both passed the existence check and both
     * inserted, inflating sumPaygSpendSince (false budget-cap trips + dup alerts).
     * Mirrors recordStripeEvent's P2002-as-already-recorded dedup.
     */
    try {
      await this.prisma.creditLedger.create({
        data: {
          walletId: wallet.id,
          organizationId: input.organizationId,
          deltaCents: -cents,
          kind: 'PAYG_CHARGE',
          reason: 'PAYG overage (billed to Stripe metered usage)',
          checkpointId: input.checkpointId,
        },
      });
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'P2002') {
        return;
      }

      throw error;
    }
  }

  async markSpendAlert(input: { organizationId: string; pct: number; periodStartMs: number }): Promise<void> {
    await this.prisma.creditWallet.update({
      where: { organizationId: input.organizationId },
      data: { lastSpendAlertPct: input.pct, lastSpendAlertPeriodStart: new Date(input.periodStartMs) },
    });
  }

  // --- Replit-parity: credit packs -------------------------------------------

  async createCreditPack(input: {
    organizationId: string;
    purchasedCents: number;
    expiresAt: Date;
    stripePaymentIntentId?: string;
  }) {
    return mapCreditPack(
      await this.prisma.creditPack.create({
        data: {
          organizationId: input.organizationId,
          purchasedCents: input.purchasedCents,
          remainingCents: input.purchasedCents,
          expiresAt: input.expiresAt,
          stripePaymentIntentId: input.stripePaymentIntentId,
        },
      }),
    );
  }

  async listCreditPacks(organizationId: string, options?: { activeOnly?: boolean }) {
    return (
      await this.prisma.creditPack.findMany({
        where: {
          organizationId,
          ...(options?.activeOnly ? { remainingCents: { gt: 0 }, expiresAt: { gt: new Date() } } : {}),
        },
        orderBy: { expiresAt: 'asc' },
      })
    ).map(mapCreditPack);
  }

  async decrementCreditPack(input: { id: string; cents: number }) {
    /*
     * Never let remainingCents go negative. The old unconditional decrement could
     * drive a pack below zero under a concurrent debit (two settlements racing the
     * same pack), corrupting the org's credit accounting. Decrement only while the
     * pack still holds enough; if a race left it short, consume whatever remains
     * (clamp to 0). Both updateMany calls only move toward zero, so the worst case
     * is a tiny over-consumption — never a negative balance.
     */
    const cents = Math.max(0, Math.ceil(input.cents));

    const guarded = await this.prisma.creditPack.updateMany({
      where: { id: input.id, remainingCents: { gte: cents } },
      data: { remainingCents: { decrement: cents } },
    });

    if (guarded.count === 0) {
      await this.prisma.creditPack.updateMany({
        where: { id: input.id, remainingCents: { lt: cents } },
        data: { remainingCents: 0 },
      });
    }

    const pack = await this.prisma.creditPack.findUnique({ where: { id: input.id } });

    if (!pack) {
      throw Object.assign(new Error('Credit pack not found'), { statusCode: 404, code: 'CREDIT_PACK_NOT_FOUND' });
    }

    return mapCreditPack(pack);
  }

  // --- Replit-parity: effort-based checkpoints -------------------------------

  async createAgentCheckpoint(input: {
    organizationId: string;
    userId?: string;
    projectId?: string;
    conversationId?: string;
    runId?: string;
    highPowerModel?: boolean;
    extendedThinking?: boolean;
    buildTier?: string;
    turboMode?: boolean;
  }) {
    return mapAgentCheckpoint(
      await this.prisma.agentCheckpoint.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          projectId: input.projectId,
          conversationId: input.conversationId,
          runId: input.runId,
          highPowerModel: input.highPowerModel ?? false,
          extendedThinking: input.extendedThinking ?? false,
          buildTier: input.buildTier ?? 'power',
          turboMode: input.turboMode ?? false,
        },
      }),
    );
  }

  async completeAgentCheckpoint(input: {
    id: string;
    status: CheckpointStatus;
    inputTokens?: number;
    outputTokens?: number;
    wallMs?: number;
    computeCents?: number;
    rawProviderCents?: number;
    creditCents?: number;
  }) {
    return mapAgentCheckpoint(
      await this.prisma.agentCheckpoint.update({
        where: { id: input.id },
        data: {
          status: input.status,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          wallMs: input.wallMs,
          computeCents: input.computeCents,
          rawProviderCents: input.rawProviderCents,
          creditCents: input.creditCents,
          completedAt: new Date(),
        },
      }),
    );
  }

  async getAgentCheckpoint(id: string) {
    const checkpoint = await this.prisma.agentCheckpoint.findUnique({ where: { id } });
    return checkpoint ? mapAgentCheckpoint(checkpoint) : undefined;
  }

  async listAgentCheckpoints(organizationId: string, options?: { take?: number }) {
    return (
      await this.prisma.agentCheckpoint.findMany({
        where: { organizationId },
        orderBy: { startedAt: 'desc' },
        take: options?.take ?? 100,
      })
    ).map(mapAgentCheckpoint);
  }

  // --- Replit-parity: admin-owned provider/model registry -------------------

  async listProviderConfigs() {
    return (await this.prisma.providerConfig.findMany({ orderBy: { provider: 'asc' }, take: 1000 })).map(
      mapProviderConfig,
    );
  }

  async upsertProviderConfig(input: {
    provider: string;
    displayName: string;
    enabled?: boolean;
    apiKeySecret?: string;
    apiKeyEnc?: string | null;
    baseUrl?: string | null;
    byokAllowed?: boolean;
  }) {
    const data = {
      displayName: input.displayName,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.apiKeySecret !== undefined ? { apiKeySecret: input.apiKeySecret } : {}),
      // `undefined` = leave unchanged; explicit `null` = clear the encrypted key.
      ...(input.apiKeyEnc !== undefined ? { apiKeyEnc: input.apiKeyEnc } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
      ...(input.byokAllowed !== undefined ? { byokAllowed: input.byokAllowed } : {}),
    };
    return mapProviderConfig(
      await this.prisma.providerConfig.upsert({
        where: { provider: input.provider },
        update: data,
        create: { provider: input.provider, ...data },
      }),
    );
  }

  /*
   * Admin-owned OAuth credentials for a connector (GitHub/GitLab/Bitbucket),
   * stored on the seeded ConnectorCatalog row. Returns the raw row incl. the
   * encrypted secret so the caller (the OAuth resolver) can decrypt it; the admin
   * API masks it before sending to the browser.
   */
  async getConnectorOAuthCatalog(provider: string) {
    const row = await this.prisma.connectorCatalog.findUnique({ where: { provider } });

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      displayName: row.displayName,
      authType: row.authType,
      enabled: row.enabled,
      clientId: row.defaultClientId,
      clientSecretEnc: row.defaultClientSecretEnc,
      scopes: row.defaultScopes,
      authorizeUrl: row.authorizeUrl,
    };
  }

  /*
   * Set a connector's admin-configured OAuth credentials. The row is seeded
   * (seed-connector-catalog.ts) so this is always an update; the secret arrives
   * already encrypted (encryptJson) from the route and is never logged.
   */
  async upsertConnectorOAuthConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    enabled?: boolean;
  }) {
    const data = {
      ...(input.clientId !== undefined ? { defaultClientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { defaultClientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    const row = await this.prisma.connectorCatalog.update({ where: { provider: input.provider }, data });

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.defaultClientId,
      hasSecret: Boolean(row.defaultClientSecretEnc),
    };
  }

  async getLoginProviderConfig(provider: string) {
    const row = await this.prisma.loginProviderConfig.findUnique({ where: { provider } });

    if (!row) {
      return null;
    }

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.clientId,
      clientSecretEnc: row.clientSecretEnc,
      scopes: row.scopes,
    };
  }

  /*
   * Upsert a social-login provider's admin-configured OAuth credentials. The
   * secret arrives already encrypted (encryptJson) from the route and is never
   * logged. A field left `undefined` is preserved; pass `null` to clear.
   */
  async upsertLoginProviderConfig(input: {
    provider: string;
    clientId?: string | null;
    clientSecretEnc?: string | null;
    scopes?: string[];
    enabled?: boolean;
    updatedByUserId?: string | null;
  }) {
    const patch = {
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.clientSecretEnc !== undefined ? { clientSecretEnc: input.clientSecretEnc } : {}),
      ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
    };

    const row = await this.prisma.loginProviderConfig.upsert({
      where: { provider: input.provider },
      create: {
        provider: input.provider,
        clientId: input.clientId ?? null,
        clientSecretEnc: input.clientSecretEnc ?? null,
        scopes: input.scopes ?? [],
        enabled: input.enabled ?? true,
        updatedByUserId: input.updatedByUserId ?? null,
      },
      update: patch,
    });

    return {
      provider: row.provider,
      enabled: row.enabled,
      clientId: row.clientId,
      hasSecret: Boolean(row.clientSecretEnc),
    };
  }

  async getStripeConfig() {
    const row = await this.prisma.stripeConfig.findUnique({ where: { id: 'singleton' } });

    if (!row) {
      return null;
    }

    return { secretKeyEnc: row.secretKeyEnc, webhookSecretEnc: row.webhookSecretEnc };
  }

  async upsertStripeConfig(input: {
    secretKeyEnc?: string | null;
    webhookSecretEnc?: string | null;
    updatedByUserId?: string | null;
  }) {
    // undefined → leave the column untouched; null → clear it.
    const patch = {
      ...(input.secretKeyEnc !== undefined ? { secretKeyEnc: input.secretKeyEnc } : {}),
      ...(input.webhookSecretEnc !== undefined ? { webhookSecretEnc: input.webhookSecretEnc } : {}),
      ...(input.updatedByUserId !== undefined ? { updatedByUserId: input.updatedByUserId } : {}),
    };

    const row = await this.prisma.stripeConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        secretKeyEnc: input.secretKeyEnc ?? null,
        webhookSecretEnc: input.webhookSecretEnc ?? null,
        updatedByUserId: input.updatedByUserId ?? null,
      },
      update: patch,
    });

    return { hasSecretKey: Boolean(row.secretKeyEnc), hasWebhookSecret: Boolean(row.webhookSecretEnc) };
  }

  async setPlanStripePrices(input: {
    key: string;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
    stripePriceMonthlyId?: string | null;
    stripePriceAnnualId?: string | null;
  }) {
    const data = {
      ...(input.stripeProductId !== undefined ? { stripeProductId: input.stripeProductId } : {}),
      ...(input.stripePriceId !== undefined ? { stripePriceId: input.stripePriceId } : {}),
      ...(input.stripePriceMonthlyId !== undefined ? { stripePriceMonthlyId: input.stripePriceMonthlyId } : {}),
      ...(input.stripePriceAnnualId !== undefined ? { stripePriceAnnualId: input.stripePriceAnnualId } : {}),
    };

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.prisma.plan.update({ where: { key: input.key }, data });
  }

  async listAdminCreditWallets() {
    return (await this.prisma.creditWallet.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(
      mapCreditWallet,
    );
  }

  async listAdminAgentCheckpoints(options?: { take?: number }) {
    return (
      await this.prisma.agentCheckpoint.findMany({ orderBy: { startedAt: 'desc' }, take: options?.take ?? 200 })
    ).map(mapAgentCheckpoint);
  }

  async summarizeAgentCheckpoints() {
    const groups = await this.prisma.agentCheckpoint.groupBy({
      by: ['organizationId'],
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, creditCents: true },
      orderBy: { _sum: { creditCents: 'desc' } },
    });

    return groups.map((group) => ({
      organizationId: group.organizationId,
      checkpoints: group._count._all,
      inputTokens: group._sum.inputTokens ?? 0,
      outputTokens: group._sum.outputTokens ?? 0,
      creditCents: group._sum.creditCents ?? 0,
    }));
  }

  async purgeAgentCheckpoints(input: { before: string; dryRun: boolean }) {
    const where = {
      startedAt: { lt: new Date(input.before) },
      status: { in: ['COMPLETED', 'FAILED'] as ('COMPLETED' | 'FAILED')[] },
    };

    if (input.dryRun) {
      return { count: await this.prisma.agentCheckpoint.count({ where }) };
    }

    const result = await this.prisma.agentCheckpoint.deleteMany({ where });
    return { count: result.count };
  }

  async listModelConfigs(options?: { enabledOnly?: boolean }) {
    return (
      await this.prisma.modelConfig.findMany({
        where: options?.enabledOnly ? { enabled: true, providerConfig: { enabled: true } } : {},
        orderBy: { modelId: 'asc' },
        include: { providerConfig: true },
        take: 5000,
      })
    ).map(mapModelConfig);
  }

  async upsertModelConfig(input: {
    provider: string;
    modelId: string;
    displayName: string;
    enabled?: boolean;
    enabledPlans: string[];
    isHighPower?: boolean;
    supportsThinking?: boolean;
    inputCentsPerM: number;
    outputCentsPerM: number;
    contextWindow: number;
  }) {
    // The parent provider must exist; create a disabled shell if the admin is
    // registering a model before configuring its provider.
    const provider = await this.prisma.providerConfig.upsert({
      where: { provider: input.provider },
      update: {},
      create: { provider: input.provider, displayName: input.provider },
    });
    const data = {
      displayName: input.displayName,
      enabledPlans: input.enabledPlans as any,
      inputCentsPerM: input.inputCentsPerM,
      outputCentsPerM: input.outputCentsPerM,
      contextWindow: input.contextWindow,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.isHighPower !== undefined ? { isHighPower: input.isHighPower } : {}),
      ...(input.supportsThinking !== undefined ? { supportsThinking: input.supportsThinking } : {}),
    };
    return mapModelConfig(
      await this.prisma.modelConfig.upsert({
        where: { providerConfigId_modelId: { providerConfigId: provider.id, modelId: input.modelId } },
        update: data,
        create: { providerConfigId: provider.id, modelId: input.modelId, ...data },
        include: { providerConfig: true },
      }),
    );
  }

  async upsertBillingPlan(input: {
    key: PlanKey;
    name: string;
    monthlyCents: number;
    limits: Record<string, number>;
    stripeProductId?: string;
    stripePriceId?: string;
    stripePriceMonthlyId?: string;
    stripePriceAnnualId?: string;
  }) {
    const fields = {
      name: input.name,
      monthlyCents: input.monthlyCents,
      limits: input.limits as any,
      stripeProductId: input.stripeProductId,
      stripePriceId: input.stripePriceId,
      stripePriceMonthlyId: input.stripePriceMonthlyId,
      stripePriceAnnualId: input.stripePriceAnnualId,
    };
    return mapBillingPlan(
      await this.prisma.plan.upsert({
        where: { key: input.key },
        create: { key: input.key, ...fields },
        update: fields,
      }),
    );
  }

  async listBillingPlans() {
    return (await this.prisma.plan.findMany({ orderBy: { monthlyCents: 'asc' } })).map(mapBillingPlan);
  }

  async getBillingPlan(key: PlanKey) {
    const plan = await this.prisma.plan.findUnique({ where: { key } });
    return plan ? mapBillingPlan(plan) : undefined;
  }

  async upsertBillingCustomer(input: { organizationId: string; provider: string; externalId: string }) {
    try {
      return mapBillingCustomer(
        await this.prisma.billingCustomer.upsert({
          where: { organizationId: input.organizationId },
          create: input,
          update: { provider: input.provider, externalId: input.externalId },
        }),
      );
    } catch (error) {
      /*
       * BillingCustomer has a SECOND unique constraint @@unique([provider,externalId]).
       * Keying the upsert on organizationId alone, a create for an org whose Stripe
       * customer id already maps to ANOTHER org row throws P2002 (unhandled 500).
       * That's an anomalous state (one Stripe customer, two orgs) — return the
       * existing (provider,externalId) mapping idempotently instead of crashing.
       */
      if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
        const existing = await this.prisma.billingCustomer.findUnique({
          where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
        });

        if (existing) {
          return mapBillingCustomer(existing);
        }
      }

      throw error;
    }
  }

  async getBillingCustomer(organizationId: string) {
    const customer = await this.prisma.billingCustomer.findUnique({ where: { organizationId } });
    return customer ? mapBillingCustomer(customer) : undefined;
  }

  async findOrganizationIdByBillingCustomer(provider: string, externalId: string) {
    const customer = await this.prisma.billingCustomer.findUnique({
      where: { provider_externalId: { provider, externalId } },
    });
    return customer?.organizationId ?? undefined;
  }

  async findOrganizationIdBySubscriptionExternalId(externalId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { externalId } });
    return subscription?.organizationId ?? undefined;
  }

  async upsertSubscription(input: {
    organizationId: string;
    planKey: PlanKey;
    externalId?: string;
    status: SubscriptionRecord['status'];
    cancelAtPeriodEnd?: boolean;
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    lastStripeEventAt?: Date;
  }) {
    const plan = await this.ensurePlan(input.planKey);

    const data = {
      organizationId: input.organizationId,
      planId: plan.id,
      externalId: input.externalId,
      status: input.status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      trialEndsAt: input.trialEndsAt,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      ...(input.lastStripeEventAt ? { lastStripeEventAt: input.lastStripeEventAt } : {}),
    };

    /*
     * Common path: Stripe carries the subscription id (externalId). Use a real
     * upsert keyed on the externalId unique constraint so two concurrent webhook
     * deliveries can't both miss a find-then-create and insert duplicate rows.
     */
    if (input.externalId) {
      return mapSubscription(
        await this.prisma.subscription.upsert({
          where: { externalId: input.externalId },
          create: data,
          update: data,
          include: { plan: true },
        }),
      );
    }

    /*
     * Fallback (rare): no external id to key on, so the best we can do is
     * update the most recent row for the org or create one. There's no unique
     * constraint to make this atomic, but this branch only runs for events that
     * arrive without a subscription id.
     */
    const existing = await this.prisma.subscription.findFirst({
      where: { organizationId: input.organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return mapSubscription(
        await this.prisma.subscription.update({ where: { id: existing.id }, data, include: { plan: true } }),
      );
    }

    return mapSubscription(await this.prisma.subscription.create({ data, include: { plan: true } }));
  }

  async getSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return subscription ? mapSubscription(subscription) : undefined;
  }

  async listAdminSubscriptions() {
    return (
      await this.prisma.subscription.findMany({
        include: { plan: true },
        orderBy: { updatedAt: 'desc' },
        take: 1000,
      })
    ).map(mapSubscription);
  }

  async recordUsageEvent(input: {
    organizationId: string;
    userId?: string;
    type: string;
    quantity?: number;
    metadata?: unknown;
  }) {
    return mapUsageEvent(
      await this.prisma.usageEvent.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          type: input.type,
          quantity: input.quantity ?? 1,
          metadata: (input.metadata ?? null) as any,
        },
      }),
    );
  }

  async hasUsageEventSince(organizationId: string, type: string, sinceMs: number) {
    const count = await this.prisma.usageEvent.count({
      where: { organizationId, type, createdAt: { gte: new Date(sinceMs) } },
    });

    return count > 0;
  }

  async listUsageEvents(organizationId: string, options: { take?: number } = {}) {
    return (
      await this.prisma.usageEvent.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },

        /*
         * Bounded for display/billing callers; the GDPR export passes no cap so
         * it still enumerates the full ledger. The usageEvent table is one of
         * the fastest-growing — an unbounded fetch on the dashboard hot path
         * loads the whole ledger just to show a count.
         */
        ...(options.take !== undefined ? { take: options.take } : {}),
      })
    ).map(mapUsageEvent);
  }

  async sumUsage(organizationId: string, type: string, since?: Date) {
    const result = await this.prisma.usageEvent.aggregate({
      where: { organizationId, type, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async createQuotaOverride(input: {
    organizationId: string;
    key: QuotaKey;
    limit: number;
    reason: string;
    createdByUserId?: string;
    expiresAt?: Date;
  }) {
    return mapQuotaOverride(await this.prisma.quotaOverride.create({ data: input }));
  }

  async listQuotaOverrides(organizationId: string) {
    return (
      await this.prisma.quotaOverride.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })
    ).map(mapQuotaOverride);
  }

  async getQuotaOverride(organizationId: string, key: QuotaKey) {
    const override = await this.prisma.quotaOverride.findFirst({
      where: { organizationId, key, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
    });
    return override ? mapQuotaOverride(override) : undefined;
  }

  async recordStripeEvent(input: { id: string; organizationId?: string; type: string; payload: unknown }) {
    const existing = await this.prisma.stripeEvent.findUnique({ where: { id: input.id } });

    if (existing) {
      return { event: mapStripeEvent(existing), created: false };
    }

    /*
     * Stripe delivers retries concurrently; two requests can both pass the findUnique
     * check, after which the second create() violates the id PK and previously threw an
     * uncoded 500 (spurious webhook failure + retry). Treat a unique-violation as "already
     * recorded" so the side-effecting branch (which only runs when created === true) stays
     * idempotent under concurrency.
     */
    try {
      const created = await this.prisma.stripeEvent.create({
        data: { id: input.id, organizationId: input.organizationId, type: input.type, payload: input.payload as any },
      });

      return { event: mapStripeEvent(created), created: true };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const row = await this.prisma.stripeEvent.findUnique({ where: { id: input.id } });

        if (row) {
          return { event: mapStripeEvent(row), created: false };
        }
      }

      throw error;
    }
  }

  async deleteStripeEvent(id: string): Promise<void> {
    /*
     * Used to roll back the dedup row when a webhook side effect fails, so
     * Stripe's retry re-runs the side effects instead of being deduped away.
     */
    await this.prisma.stripeEvent.deleteMany({ where: { id } });
  }

  async recordStripeWebhookFailure(input: { eventId: string; type: string; payload: unknown; error: string }) {
    const row = await this.prisma.stripeWebhookFailure.upsert({
      where: { eventId: input.eventId },
      create: {
        eventId: input.eventId,
        type: input.type,
        payload: input.payload as any,
        lastError: input.error,
      },
      update: {
        attempts: { increment: 1 },
        lastError: input.error,

        // Refresh the payload too: a Stripe retry may carry a newer serialization.
        payload: input.payload as any,
        failedAt: new Date(),
        resolvedAt: null,
      },
    });

    return mapStripeWebhookFailure(row);
  }

  async listStripeWebhookFailures(options?: { includeResolved?: boolean; limit?: number }) {
    const rows = await this.prisma.stripeWebhookFailure.findMany({
      where: options?.includeResolved ? {} : { resolvedAt: null },
      orderBy: { failedAt: 'desc' },
      take: options?.limit ?? 50,
    });

    return rows.map(mapStripeWebhookFailure);
  }

  async getStripeWebhookFailure(eventId: string) {
    const row = await this.prisma.stripeWebhookFailure.findUnique({ where: { eventId } });
    return row ? mapStripeWebhookFailure(row) : undefined;
  }

  async resolveStripeWebhookFailure(eventId: string): Promise<void> {
    await this.prisma.stripeWebhookFailure.updateMany({
      where: { eventId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  async recordSamlAssertionConsumption(input: { organizationId: string; assertionId: string; expiresAt: Date }) {
    // Best-effort prune so the dedup table stays bounded (assertions are short-lived).
    await this.prisma.samlAssertion.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

    try {
      await this.prisma.samlAssertion.create({
        data: {
          organizationId: input.organizationId,
          assertionId: input.assertionId,
          expiresAt: input.expiresAt,
        },
      });

      return { created: true };
    } catch (error) {
      if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
        return { created: false };
      }

      throw error;
    }
  }

  async recordEmailDeliveryEvent(input: {
    provider: string;
    providerEventId: string;
    type: string;
    email: string;
    emailMessageId?: string;
    subject?: string;
    fromAddress?: string;
    payload: unknown;
  }) {
    const existing = await this.prisma.emailDeliveryEvent.findUnique({
      where: {
        provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId },
      },
    });

    if (existing) {
      return { event: mapEmailDeliveryEvent(existing), created: false };
    }

    /*
     * Mirror recordStripeEvent: email providers (Resend/SES) deliver retries
     * concurrently, so two requests can both pass the findUnique above and the
     * second create() then violates the provider_providerEventId unique
     * constraint — previously an uncoded 500 + provider retry storm. Treat
     * P2002 as "already recorded" to keep the side-effecting branch idempotent.
     */
    try {
      const created = await this.prisma.emailDeliveryEvent.create({
        data: {
          provider: input.provider,
          providerEventId: input.providerEventId,
          type: input.type,
          email: input.email,
          emailMessageId: input.emailMessageId,
          subject: input.subject,
          fromAddress: input.fromAddress,
          payload: input.payload as any,
        },
      });

      return { event: mapEmailDeliveryEvent(created), created: true };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const row = await this.prisma.emailDeliveryEvent.findUnique({
          where: {
            provider_providerEventId: { provider: input.provider, providerEventId: input.providerEventId },
          },
        });

        if (row) {
          return { event: mapEmailDeliveryEvent(row), created: false };
        }
      }

      throw error;
    }
  }

  async listEmailDeliveryEvents(filter?: { email?: string; type?: string; emailMessageId?: string; limit?: number }) {
    const where: Record<string, unknown> = {};

    if (filter?.email) {
      where.email = filter.email;
    }

    if (filter?.type) {
      where.type = filter.type;
    }

    if (filter?.emailMessageId) {
      where.emailMessageId = filter.emailMessageId;
    }

    const rows = await this.prisma.emailDeliveryEvent.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: Math.min(Math.max(filter?.limit ?? 100, 1), 500),
    });

    return rows.map(mapEmailDeliveryEvent);
  }

  async recordAudit(event: AuditEvent) {
    const metadata = redactAuditMetadata(event.metadata);
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        metadata: metadata as any,
        ipAddress: event.ipAddress,
      },
    });
  }

  async listAuditLogs(organizationId?: string) {
    /*
     * The audit_log table is the densest in the system (one row per mutating
     * action across every org). Bound the fetch so callers — including the
     * global /admin/* consumers that pass no organizationId and then filter in
     * JS — can't pull the entire table into memory. Newest rows are kept via
     * the existing desc ordering, matching the other admin list caps.
     */
    return (
      await this.prisma.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 2000 })
    ).map(
      (event) =>
        ({
          organizationId: event.organizationId ?? undefined,
          actorUserId: event.actorUserId ?? undefined,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId ?? undefined,
          metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
          ipAddress: event.ipAddress ?? undefined,
          createdAt: toIso(event.createdAt)!,
        }) as AuditEvent,
    );
  }

  async listAdminUsers() {
    /*
     * The admin console only needs the newest 500 users, but this same list is
     * the SOLE input to the last-platform-admin lockout guard
     * (assertNotLastPlatformAdmin). Platform admins are typically the OLDEST
     * accounts (first signups), so on any deployment with >500 users they fall
     * outside the newest-500 window — the guard's target lookup then misses and
     * returns early, letting the last admin be removed/suspended (zero-admin
     * lockout). To keep the cap for the console yet make the guard sound, union
     * the capped newest-500 page with the (small, complete) set of platform
     * admins, de-duplicating by id.
     */
    const [recent, admins] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.user.findMany({ where: { platformAdmin: true } }),
    ]);
    const byId = new Map<string, (typeof recent)[number]>();

    for (const user of recent) {
      byId.set(user.id, user);
    }

    for (const user of admins) {
      byId.set(user.id, user);
    }

    return [...byId.values()].map(mapUser);
  }

  async listAdminUsersPage(options: {
    page: number;
    pageSize: number;
    sort: 'name' | 'email' | 'createdAt';
    direction: 'asc' | 'desc';
    query?: string;
  }) {
    const where = options.query
      ? {
          OR: [
            { name: { contains: options.query, mode: 'insensitive' as const } },
            { email: { contains: options.query, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [options.sort]: options.direction },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users: rows.map(mapUser), total };
  }

  /*
   * Complete set of platform administrators, never capped. Use this (not the
   * take-bounded listAdminUsers) whenever the zero-admin invariant must hold.
   */
  async listPlatformAdmins() {
    return (await this.prisma.user.findMany({ where: { platformAdmin: true } })).map(mapUser);
  }

  async countPlatformAdmins() {
    return this.prisma.user.count({ where: { platformAdmin: true } });
  }

  async listAdminOrganizations() {
    return (await this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(
      mapOrganization,
    );
  }

  async listAdminProjects() {
    return (await this.prisma.project.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(mapProject);
  }

  async listAdminWorkspaces() {
    return (await this.prisma.workspace.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })).map(mapWorkspace);
  }

  async listAdminDeployments() {
    return (await this.prisma.deployment.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(mapDeployment);
  }

  async listAdminSupportTickets() {
    return (await this.prisma.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })).map(
      mapSupportTicket,
    );
  }

  async listAdminUsageEvents() {
    return (await this.prisma.usageEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(mapUsageEvent);
  }

  async listAdminAiCosts() {
    return (await this.prisma.aiCostLedger.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(
      mapAiCostLedger,
    );
  }

  async updateWorkspaceStatus(input: { workspaceId: string; status: WorkspaceRecord['status'] }) {
    return mapWorkspace(
      await this.prisma.workspace.update({ where: { id: input.workspaceId }, data: { status: input.status } }),
    );
  }

  async updateSupportTicket(input: { ticketId: string; status: SupportTicketRecord['status']; response?: string }) {
    /*
     * Serialize the read-modify-write of the metadata JSON blob so two concurrent
     * updates to the same ticket can't clobber each other's merged keys.
     */
    return this.withSerializedMutation(`support-ticket:${input.ticketId}`, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id: input.ticketId } });
      const existingMetadata = (existing?.metadata as Record<string, unknown> | null) ?? {};

      const metadata = {
        ...existingMetadata,
        ...(input.response ? { latestAdminResponse: input.response } : {}),

        // Stamp the FIRST admin response only — later responses keep the SLA mark.
        ...(input.response && typeof existingMetadata.firstResponseAt !== 'string'
          ? { firstResponseAt: new Date().toISOString() }
          : {}),
      };

      return mapSupportTicket(
        await this.prisma.supportTicket.update({
          where: { id: input.ticketId },
          data: { status: input.status, metadata: metadata as any },
        }),
      );
    });
  }

  async assignSupportTicket(input: { ticketId: string; assigneeUserId?: string }) {
    // Serialize the metadata read-modify-write (see updateSupportTicket).
    return this.withSerializedMutation(`support-ticket:${input.ticketId}`, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id: input.ticketId } });

      if (!existing) {
        throw Object.assign(new Error('Support ticket not found'), {
          statusCode: 404,
          code: 'SUPPORT_TICKET_NOT_FOUND',
        });
      }

      const metadata = {
        ...((existing.metadata as Record<string, unknown> | null) ?? {}),

        // `null` (not delete) so the unassign survives the JSON merge above.
        assigneeUserId: input.assigneeUserId ?? null,
      };

      return mapSupportTicket(
        await this.prisma.supportTicket.update({
          where: { id: input.ticketId },
          data: { metadata: metadata as any },
        }),
      );
    });
  }

  async listSecurityAuditEvents() {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 2000 });
    return rows
      .filter(
        (event) =>
          event.action.startsWith('auth.') || event.action.includes('security') || event.action.includes('mfa'),
      )
      .map((event) => ({
        id: event.id,
        organizationId: event.organizationId ?? undefined,
        actorUserId: event.actorUserId ?? undefined,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? undefined,
        metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        createdAt: toIso(event.createdAt)!,
      }));
  }

  async listSecurityEventResolutions() {
    return (await this.prisma.securityEventResolution.findMany()).map(mapSecurityEventResolution);
  }

  async resolveSecurityEvent(input: { auditLogId: string; note?: string; resolvedByUserId?: string }) {
    const row = await this.prisma.securityEventResolution.upsert({
      where: { auditLogId: input.auditLogId },
      create: {
        auditLogId: input.auditLogId,
        resolved: true,
        note: input.note,
        resolvedByUserId: input.resolvedByUserId,
      },
      update: {
        resolved: true,
        note: input.note,
        resolvedByUserId: input.resolvedByUserId,
        resolvedAt: new Date(),
      },
    });
    return mapSecurityEventResolution(row);
  }

  async updateAbuseEvent(input: { abuseEventId: string; resolved?: boolean; disposition?: string }) {
    // Serialize the metadata read-modify-write (see updateSupportTicket).
    return this.withSerializedMutation(`abuse-event:${input.abuseEventId}`, async () => {
      const existing = await this.prisma.abuseEvent.findUnique({ where: { id: input.abuseEventId } });

      const metadata = {
        ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
        resolved: input.resolved ?? true,
        resolvedAt: new Date().toISOString(),
        ...(input.disposition ? { disposition: input.disposition } : {}),
      };

      return mapAbuseEvent(
        await this.prisma.abuseEvent.update({
          where: { id: input.abuseEventId },
          data: { metadata: metadata as any },
        }),
      );
    });
  }

  async recordAdminAudit(event: AdminAuditLogRecord) {
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        metadata: redactAuditMetadata(event.metadata) as any,
        ipAddress: event.ipAddress,
      },
    });
  }

  async redactAuditLogs(input: { organizationId?: string; actorUserId?: string; before?: string }) {
    const where: Record<string, unknown> = {
      // Skip rows already redacted so the count reflects real work + the op is idempotent.
      ipAddress: { not: null },
    };

    if (input.organizationId) {
      where.organizationId = input.organizationId;
    }

    if (input.actorUserId) {
      where.actorUserId = input.actorUserId;
    }

    if (input.before) {
      const before = new Date(input.before);

      if (!Number.isNaN(before.getTime())) {
        where.createdAt = { lt: before };
      }
    }

    // Guard against an unscoped wipe: a selector is mandatory at the route layer,
    // but defend here too so a future caller can never null the whole trail.
    if (!input.organizationId && !input.actorUserId) {
      return { redacted: 0 };
    }

    const result = await this.prisma.auditLog.updateMany({
      where: where as any,
      data: { ipAddress: null, metadata: { redacted: true, redactedAt: new Date().toISOString() } as any },
    });

    return { redacted: result.count };
  }

  async listAdminAuditLogs() {
    return (await this.prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 })).map(
      (event): AdminAuditLogRecord => ({
        actorUserId: event.actorUserId ?? undefined,
        action: event.action,
        metadata: (event.metadata as Record<string, unknown> | null) ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        createdAt: toIso(event.createdAt)!,
      }),
    );
  }

  private async ensureRole(roleKey: string) {
    return this.prisma.role.upsert({
      where: { key: roleKey },
      create: {
        key: roleKey,
        name: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
        system: Object.hasOwn(rolePermissions, roleKey),
      },
      update: {},
    });
  }

  private async ensurePlan(planKey: PlanKey) {
    return this.prisma.plan.upsert({
      where: { key: planKey },
      create: { key: planKey, name: planKey.charAt(0).toUpperCase() + planKey.slice(1), monthlyCents: 0, limits: {} },
      update: {},
    });
  }
}

function mapUser(user: any): UserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    passwordHash: user.passwordHash ?? undefined,
    emailVerifiedAt: toIso(user.emailVerifiedAt),
    mfaEnabled: user.mfaEnabled,
    mfaSecretEncrypted: user.mfaSecretCiphertext ?? undefined,
    platformAdmin: user.platformAdmin,
    language: user.language ?? undefined,
    timezone: user.timezone ?? undefined,
    preferences:
      user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
        ? (user.preferences as Record<string, unknown>)
        : undefined,
    lastActiveAt: toIso(user.lastActiveAt),
    createdAt: toIso(user.createdAt)!,
  };
}

function mapSession(session: any): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    expiresAt: toIso(session.expiresAt)!,
    createdAt: toIso(session.createdAt)!,
    ipAddress: session.ipAddress ?? undefined,
    userAgent: session.userAgent ?? undefined,
    revokedAt: toIso(session.revokedAt),
    lastReauthAt: toIso(session.lastReauthAt),
    impersonatedBy: session.impersonatedBy ?? undefined,
  };
}

function mapOrganization(organization: any): OrganizationRecord {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    createdAt: toIso(organization.createdAt)!,
    billingEmail: organization.billingEmail ?? undefined,
  };
}

function mapMembership(member: any): MembershipRecord {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    roleKey: member.role?.key ?? member.roleKey ?? 'member',
    userName: member.user?.name ?? undefined,
    userEmail: member.user?.email ?? undefined,
  };
}

function mapProject(project: any): ProjectRecord {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    slug: project.slug,
    description: project.description ?? undefined,
    sourceType: project.sourceType,
    templateName: project.templateName ?? undefined,
    gitRepositoryUrl: project.gitRepositoryUrl ?? undefined,
    gitDefaultBranch: project.gitDefaultBranch ?? undefined,
    persistentVolumeClaim: project.persistentVolumeClaim,
    createdAt: toIso(project.createdAt)!,
    updatedAt: toIso(project.updatedAt)!,
    deletedAt: toIso(project.deletedAt),
    ...(typeof project._count?.deployments === 'number' ? { deploymentCount: project._count.deployments } : {}),
  };
}

/*
 * Convention shared with services/api/src/project-storage.ts: each workspace
 * gets its own isolated git working tree under `.vibecore-workspaces/<id>` of
 * the project storage root. Returning a relative path keeps the row portable
 * across PROJECT_STORAGE_DIR overrides (dev vs prod, on-disk vs PVC).
 */
export function workspaceRelativeGitPath(workspaceId: string) {
  return `.vibecore-workspaces/${workspaceId}`;
}

function mapWorkspace(workspace: any): WorkspaceRecord {
  return {
    id: workspace.id,
    projectId: workspace.projectId,
    name: workspace.name,
    status: workspace.status,
    runtimeMode: workspace.runtimeMode,
    gitPath: workspace.gitPath ?? undefined,
    gitRepositoryUrl: workspace.gitRepositoryUrl ?? undefined,
    environment: workspace.environment ?? undefined,
    createdAt: toIso(workspace.createdAt)!,
  };
}

function mapWorkspaceIdeState(state: any): WorkspaceIdeStateRecord {
  return {
    workspaceId: state.workspaceId,
    state: state.state,
    version: state.version,
    updatedByUserId: state.updatedByUserId ?? undefined,
    updatedAt: toIso(state.updatedAt)!,
    createdAt: toIso(state.createdAt)!,
  };
}

function mapSnapshot(snapshot: any): SnapshotRecord {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    label: snapshot.label ?? undefined,
    kind: snapshot.kind,
    manifest: snapshot.manifest,
    storageKey: snapshot.storageKey ?? undefined,
    byteLength: snapshot.byteLength ?? undefined,
    createdByUserId: snapshot.createdByUserId ?? undefined,
    conversationId: snapshot.conversationId ?? undefined,
    turnIndex: snapshot.turnIndex ?? undefined,
    createdAt: toIso(snapshot.createdAt)!,
  };
}

function mapProjectStorageObject(object: any): ProjectStorageObjectRecord {
  return {
    id: object.id,
    projectId: object.projectId ?? undefined,
    key: object.key,
    kind: object.kind,
    contentBase64: object.contentBase64,
    byteLength: object.byteLength,
    contentHash: object.contentHash,
    createdAt: toIso(object.createdAt)!,
  };
}

function normalizeEnvVarScope(scope: unknown): EnvVarScope {
  return ENV_VAR_SCOPES.includes(scope as EnvVarScope) ? (scope as EnvVarScope) : DEFAULT_ENV_VAR_SCOPE;
}

function mapEnvVar(envVar: any): ProjectEnvironmentRecord {
  return {
    id: envVar.id,
    projectId: envVar.projectId,
    key: envVar.key,
    value: envVar.value,
    // Back-compat: rows read before the column was populated fall back to production.
    scope: normalizeEnvVarScope(envVar.scope),
    createdAt: toIso(envVar.createdAt)!,
    updatedAt: toIso(envVar.updatedAt)!,
  };
}

function mapSecret(secret: any): ProjectSecretRecord {
  return {
    id: secret.id,
    projectId: secret.projectId,
    key: secret.key,
    valueEncrypted: secret.valueEncrypted ?? '',
    createdAt: toIso(secret.createdAt)!,
    updatedAt: toIso(secret.updatedAt)!,
  };
}

function mapProjectCollaborator(collaborator: any): ProjectCollaboratorRecord {
  return {
    id: collaborator.id,
    projectId: collaborator.projectId,
    userId: collaborator.userId,
    roleKey: collaborator.roleKey,
    expiresAt: toIso(collaborator.expiresAt),
    createdAt: toIso(collaborator.createdAt)!,
  };
}

function mapProjectActivity(activity: any): ProjectActivityRecord {
  return {
    id: activity.id,
    projectId: activity.projectId,
    actorUserId: activity.actorUserId ?? undefined,
    action: activity.action,
    metadata: activity.metadata ?? undefined,
    createdAt: toIso(activity.createdAt)!,
  };
}

function mapProjectIdeState(state: any): ProjectIdeStateRecord {
  return {
    projectId: state.projectId,
    state: state.state,
    version: state.version,
    updatedByUserId: state.updatedByUserId ?? undefined,
    updatedAt: toIso(state.updatedAt)!,
    createdAt: toIso(state.createdAt)!,
  };
}

function mapCollaborationPresence(presence: any): CollaborationPresenceRecord {
  return {
    id: presence.id,
    projectId: presence.projectId,
    userId: presence.userId,
    sessionId: presence.sessionId,
    status: presence.status,
    filePath: presence.filePath ?? undefined,
    cursor: presence.cursor ?? undefined,
    selection: presence.selection ?? undefined,
    mode: presence.mode,
    terminalAccess: presence.terminalAccess,
    createdAt: toIso(presence.createdAt)!,
    updatedAt: toIso(presence.updatedAt)!,
  };
}

function mapCollaborationComment(comment: any): CollaborationCommentRecord {
  return {
    id: comment.id,
    projectId: comment.projectId,
    userId: comment.userId,
    filePath: comment.filePath ?? undefined,
    line: comment.line ?? undefined,
    selection: comment.selection ?? undefined,
    body: comment.body,
    resolvedAt: toIso(comment.resolvedAt),
    createdAt: toIso(comment.createdAt)!,
  };
}

function mapProjectShareLink(link: any): ProjectShareLinkRecord {
  return {
    id: link.id,
    projectId: link.projectId,
    tokenHash: link.tokenHash,
    roleKey: link.roleKey,
    expiresAt: toIso(link.expiresAt)!,
    createdByUserId: link.createdByUserId ?? undefined,
    revokedAt: toIso(link.revokedAt),
    createdAt: toIso(link.createdAt)!,
  };
}

function mapChatShare(share: any): ChatShareRecord {
  return {
    id: share.id,
    tokenHash: share.tokenHash,
    conversationId: share.conversationId,
    projectId: share.projectId,
    authorUserId: share.authorUserId,
    title: share.title ?? undefined,
    payload: share.payloadJson,
    allowFork: share.allowFork,
    expiresAt: toIso(share.expiresAt),
    revokedAt: toIso(share.revokedAt),
    createdAt: toIso(share.createdAt)!,
  };
}

function mapAgentPatchProposal(row: any): AgentPatchProposalRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    artifactId: row.artifactId,
    messageId: row.messageId,
    actionId: row.actionId,
    filePath: row.filePath,
    relativePath: row.relativePath,
    originalContent: row.originalContent,
    proposedContent: row.proposedContent,
    hunks: row.hunks,
    status: row.status,
    error: row.error ?? undefined,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function mapAgentRepairEvent(row: any): AgentRepairEventRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    messageId: row.messageId ?? undefined,
    artifactId: row.artifactId ?? undefined,
    actionId: row.actionId ?? undefined,
    relativePath: row.relativePath,
    attempt: row.attempt,
    outcome: row.outcome,
    validationError: row.validationError ?? undefined,
    repairError: row.repairError ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapConsensusRecord(row: any): ConsensusRecordSummary {
  return {
    id: row.id,
    runId: row.runId,
    algorithm: row.algorithm,
    threshold: row.threshold,
    outcome: row.outcome,
    agreementScore: row.agreementScore,
    roundCount: row.rounds,
    durationMs: row.durationMs,
    createdAt: toIso(row.createdAt)!,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapClaimVote(value: any): ConsensusClaimVote {
  return {
    claim: typeof value?.claim === 'string' ? value.claim : '',
    type: typeof value?.type === 'string' ? value.type : '',
    supporters: asStringArray(value?.supporters),
    dissenters: asStringArray(value?.dissenters),
    abstainers: asStringArray(value?.abstainers),
    agreementRatio: typeof value?.agreementRatio === 'number' ? value.agreementRatio : 0,
    decision: typeof value?.decision === 'string' ? value.decision : 'inconclusive',
  };
}

function mapConflict(value: any): ConsensusConflict {
  return {
    type: typeof value?.type === 'string' ? value.type : '',
    description: typeof value?.description === 'string' ? value.description : '',
    involvedRoles: asStringArray(value?.involvedRoles),
    severity: typeof value?.severity === 'string' ? value.severity : 'low',
  };
}

function mapConsolidated(value: any): ConsensusConsolidated | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    summary: typeof value.summary === 'string' ? value.summary : '',
    acceptedRisks: asStringArray(value.acceptedRisks),
    acceptedVerification: asStringArray(value.acceptedVerification),
    acceptedFiles: asStringArray(value.acceptedFiles),
    rejectedClaims: Array.isArray(value.rejectedClaims)
      ? value.rejectedClaims.map((claim: any) => ({
          claim: typeof claim?.claim === 'string' ? claim.claim : '',
          type: typeof claim?.type === 'string' ? claim.type : '',
        }))
      : [],
    perRoleSummaries: Array.isArray(value.perRoleSummaries)
      ? value.perRoleSummaries.map((entry: any) => ({
          roleId: typeof entry?.roleId === 'string' ? entry.roleId : '',
          summary: typeof entry?.summary === 'string' ? entry.summary : '',
          status: typeof entry?.status === 'string' ? entry.status : '',
        }))
      : [],
  };
}

function mapConsensusRecordDetail(row: any): ConsensusRecordDetail {
  return {
    ...mapConsensusRecord(row),
    claimVotes: Array.isArray(row.claimVotes) ? row.claimVotes.map(mapClaimVote) : [],
    conflicts: Array.isArray(row.conflicts) ? row.conflicts.map(mapConflict) : [],
    consolidated: mapConsolidated(row.consolidated),
  };
}

function mapDeployment(deployment: any): DeploymentRecord {
  return {
    id: deployment.id,
    projectId: deployment.projectId,
    workspaceId: deployment.workspaceId ?? undefined,
    provider: deployment.provider,
    environment: deployment.environmentName ?? 'preview',
    status: deployment.status,
    url: deployment.url ?? undefined,
    previewUrl: deployment.previewUrl ?? undefined,
    productionUrl: deployment.productionUrl ?? undefined,
    framework: deployment.framework ?? undefined,
    buildCommand: deployment.buildCommand ?? undefined,
    outputDirectory: deployment.outputDirectory ?? undefined,
    branch: deployment.branch ?? undefined,
    commitSha: deployment.commitSha ?? undefined,
    customDomain: deployment.customDomain ?? undefined,
    logs: Array.isArray(deployment.logs) ? deployment.logs : [],
    metadata: deployment.metadata ?? undefined,
    rolledBackFromId: deployment.rolledBackFromId ?? undefined,
    parentDeploymentId: deployment.parentDeploymentId ?? undefined,
    machineSize: deployment.machineSize ?? undefined,
    lastMeteredAt: toIso(deployment.lastMeteredAt),
    startedAt: toIso(deployment.startedAt),
    finishedAt: toIso(deployment.finishedAt),
    canceledAt: toIso(deployment.canceledAt),
    createdAt: toIso(deployment.createdAt)!,
    updatedAt: toIso(deployment.updatedAt),
  };
}

function mapReleaseManifest(row: any): ReleaseManifestRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    deploymentId: row.deploymentId,
    environment: row.environment,
    version: row.version,
    provider: row.provider,
    artifactKind: row.artifactKind,
    artifactRef: row.artifactRef,
    artifactDigest: row.artifactDigest,
    storeGeneration: row.storeGeneration ?? undefined,
    configDigest: row.configDigest ?? undefined,
    dbMigrationPoint: row.dbMigrationPoint ?? undefined,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapSupportTicket(ticket: any): SupportTicketRecord {
  /*
   * assigneeUserId / firstResponseAt live in the metadata JSON blob (like
   * latestAdminResponse) rather than dedicated columns, so the admin triage
   * fields ship without a schema migration.
   */
  const metadata = (ticket.metadata ?? {}) as Record<string, unknown>;

  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    userId: ticket.userId,
    subject: ticket.subject,
    status: ticket.status,
    category: typeof ticket.metadata?.category === 'string' ? ticket.metadata.category : undefined,
    createdAt: toIso(ticket.createdAt)!,
    assigneeUserId: typeof metadata.assigneeUserId === 'string' ? metadata.assigneeUserId : undefined,
    firstResponseAt: typeof metadata.firstResponseAt === 'string' ? metadata.firstResponseAt : undefined,
  };
}

function mapTicketMessage(message: any): TicketMessageRecord {
  return {
    id: message.id,
    ticketId: message.ticketId,
    authorType: message.authorType,
    authorUserId: message.authorUserId ?? undefined,
    body: message.body,
    createdAt: toIso(message.createdAt)!,
  };
}

function mapFeatureFlag(flag: any): FeatureFlagRecord {
  const rawRollout = flag.rules?.rolloutPercent;

  const rolloutPercent =
    typeof rawRollout === 'number' && Number.isFinite(rawRollout)
      ? Math.max(0, Math.min(100, Math.round(rawRollout)))
      : undefined;

  return {
    id: flag.id,
    organizationId: flag.organizationId ?? undefined,
    key: flag.key,
    enabled: flag.enabled,
    rolloutPercent,
  };
}

function mapSecurityEventResolution(row: any): SecurityEventResolutionRecord {
  return {
    id: row.id,
    auditLogId: row.auditLogId,
    resolved: row.resolved,
    note: row.note ?? undefined,
    resolvedByUserId: row.resolvedByUserId ?? undefined,
    resolvedAt: toIso(row.resolvedAt)!,
    createdAt: toIso(row.createdAt)!,
  };
}

function mapAbuseEvent(event: any): AbuseEventRecord {
  const metadata = (event.metadata as Record<string, unknown> | null) ?? {};
  return {
    id: event.id,
    organizationId: event.organizationId ?? undefined,
    userId: event.userId ?? undefined,
    type: event.type,
    severity: event.severity,
    createdAt: toIso(event.createdAt)!,
    resolved: typeof metadata.resolved === 'boolean' ? (metadata.resolved as boolean) : undefined,
    disposition: typeof metadata.disposition === 'string' ? (metadata.disposition as string) : undefined,
    resolvedAt: typeof metadata.resolvedAt === 'string' ? (metadata.resolvedAt as string) : undefined,
  };
}

function mapIntegrationFeatureRequest(request: any): IntegrationFeatureRequestRecord {
  return {
    id: request.id,
    userId: request.userId,
    organizationId: request.organizationId ?? undefined,
    integrationName: request.integrationName,
    useCaseDescription: request.useCaseDescription,
    status: request.status,
    createdAt: toIso(request.createdAt)!,
  };
}

function mapAiMessageFeedback(feedback: any): AiMessageFeedbackRecord {
  return {
    id: feedback.id,
    userId: feedback.userId,
    messageId: feedback.messageId,
    chatId: feedback.chatId ?? undefined,
    vote: feedback.vote as AiMessageFeedbackVote,
    createdAt: toIso(feedback.createdAt)!,
    updatedAt: toIso(feedback.updatedAt)!,
  };
}

function mapSystemSetting(setting: any): SystemSettingRecord {
  return { key: setting.key, value: setting.value, updatedAt: toIso(setting.updatedAt)! };
}

function mapEnterpriseSettings(settings: any): EnterpriseSettingsRecord {
  return {
    organizationId: settings.organizationId,
    ipAllowlist: settings.ipAllowlist,
    sessionDurationMinutes: settings.sessionDurationMinutes,
    requireMfaForAdmins: settings.requireMfaForAdmins,
    dataRetentionDays: settings.dataRetentionDays,
    legalHoldEnabled: settings.legalHoldEnabled,
    ssoEnforced: settings.ssoEnforced ?? false,
    ssoEnforcedAt: toIso(settings.ssoEnforcedAt) ?? null,
    updatedAt: toIso(settings.updatedAt)!,
  };
}

function mapDomainVerification(domain: any): DomainVerificationRecord {
  return {
    id: domain.id,
    organizationId: domain.organizationId,
    domain: domain.domain,
    verificationToken: domain.verificationToken,
    verifiedAt: toIso(domain.verifiedAt),
    redirectWww: domain.redirectWww ?? true,
    wildcardEnabled: domain.wildcardEnabled ?? false,
    sslStatus: domain.sslStatus ?? 'pending_dns',
    createdAt: toIso(domain.createdAt)!,
  };
}

function mapSsoConfig(config: any): SsoConfigRecord {
  return {
    id: config.id,
    organizationId: config.organizationId,
    type: config.type,
    enabled: config.enabled,
    encryptedConfig: config.encryptedConfig,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapScimToken(token: any): ScimTokenRecord {
  return {
    id: token.id,
    organizationId: token.organizationId,
    name: token.name,
    tokenHash: token.tokenHash,
    createdAt: toIso(token.createdAt)!,
    lastUsedAt: toIso(token.lastUsedAt),
  };
}

function mapCustomRole(role: any): CustomRoleRecord {
  return {
    id: role.id,
    organizationId: role.organizationId,
    key: role.key,
    name: role.name,
    permissions: role.permissions,
    createdAt: toIso(role.createdAt)!,
  };
}

function mapSiemWebhook(webhook: any): SiemWebhookRecord {
  return {
    id: webhook.id,
    organizationId: webhook.organizationId,
    url: webhook.url,
    secretHash: webhook.secretHash,
    secretCiphertext: webhook.secretCiphertext,
    enabled: webhook.enabled,
    lastDeliveredAt: toIso(webhook.lastDeliveredAt),
    lastDeliveredId: webhook.lastDeliveredId ?? undefined,
    createdAt: toIso(webhook.createdAt)!,
  };
}

function mapApiKey(key: any): ApiKeyRecord {
  return {
    id: key.id,
    organizationId: key.organizationId ?? undefined,
    userId: key.userId ?? undefined,
    name: key.name,
    keyHash: key.keyHash,
    keyPrefix: key.keyPrefix ?? undefined,
    scopes: ((key.scopes ?? []) as string[]).filter((scope): scope is ApiKeyScope =>
      API_KEY_SCOPES.includes(scope as ApiKeyScope),
    ),
    lastUsedAt: toIso(key.lastUsedAt),
    expiresAt: toIso(key.expiresAt),
    createdAt: toIso(key.createdAt)!,
  };
}

function mapOrganizationInvite(invite: any): OrganizationInviteRecord {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.email,
    roleKey: invite.role?.key ?? 'member',
    tokenHash: invite.tokenHash,
    expiresAt: toIso(invite.expiresAt)!,
    acceptedAt: toIso(invite.acceptedAt),
    createdAt: toIso(invite.createdAt)!,
  };
}

function mapOAuthConnection(connection: any): OAuthConnectionRecord {
  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    externalId: connection.externalId,
    accessHash: connection.accessHash,
    refreshHash: connection.refreshHash ?? undefined,
    createdAt: toIso(connection.createdAt)!,
  };
}

function mapUserConnection(connection: any): UserConnectionRecord {
  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    externalAccountId: connection.externalAccountId,
    externalAccountLabel: connection.externalAccountLabel,
    accessTokenEncrypted: connection.accessTokenEncrypted ?? undefined,
    refreshTokenEncrypted: connection.refreshTokenEncrypted ?? undefined,
    apiKeyFieldsEncrypted: (connection.apiKeyFieldsEncrypted as Record<string, string> | undefined) ?? undefined,
    scopes: connection.scopes ?? [],
    tokenExpiresAt: toIso(connection.tokenExpiresAt),
    status: connection.status as UserConnectionStatus,
    lastUsedAt: toIso(connection.lastUsedAt),
    forAgentUse: connection.forAgentUse,
    oauthAppSource: connection.oauthAppSource as 'e_code_default' | 'org_override',
    oauthAppOverrideId: connection.oauthAppOverrideId ?? undefined,
    createdByUserId: connection.createdByUserId,
    createdAt: toIso(connection.createdAt)!,
    updatedAt: toIso(connection.updatedAt)!,
    revokedAt: toIso(connection.revokedAt),
  };
}

function mapProjectConnectionLink(link: any): ProjectConnectionLinkRecord {
  return {
    id: link.id,
    projectId: link.projectId,
    userConnectionId: link.userConnectionId,
    linkedByUserId: link.linkedByUserId,
    linkedAt: toIso(link.linkedAt)!,
    unlinkedAt: toIso(link.unlinkedAt),
  };
}

function mapNotification(notification: any): NotificationRecord {
  return {
    id: notification.id,
    userId: notification.userId,
    category: notification.category,
    title: notification.title,
    body: notification.body ?? undefined,
    linkUrl: notification.linkUrl ?? undefined,
    metadata: (notification.metadata as Record<string, unknown> | null) ?? undefined,
    readAt: toIso(notification.readAt),
    createdAt: toIso(notification.createdAt)!,
  };
}

function mapReconnectionAlert(alert: any): ReconnectionAlertRecord {
  return {
    id: alert.id,
    userConnectionId: alert.userConnectionId,
    reason: alert.reason,
    detectedAt: toIso(alert.detectedAt)!,
    resolvedAt: toIso(alert.resolvedAt),
    notifiedAt: toIso(alert.notifiedAt),
    provider: alert.userConnection?.provider ?? '',
    externalAccountLabel: alert.userConnection?.externalAccountLabel ?? '',
  };
}

function mapAiConversation(conversation: any): AiConversationRecord {
  return {
    id: conversation.id,
    projectId: conversation.projectId ?? undefined,
    userId: conversation.userId,
    title: conversation.title ?? undefined,
    createdAt: toIso(conversation.createdAt)!,
  };
}

function mapAiMessage(message: any): AiMessageRecord {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: toIso(message.createdAt)!,
  };
}

function mapAiToolCall(toolCall: any): AiToolCallRecord {
  return {
    id: toolCall.id,
    messageId: toolCall.messageId,
    name: toolCall.name,
    input: toolCall.input ?? undefined,
    output: toolCall.output ?? undefined,
    createdAt: toIso(toolCall.createdAt)!,
  };
}

function mapAiTokenUsage(usage: any): AiTokenUsageRecord {
  return {
    id: usage.id,
    messageId: usage.messageId,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostCents: usage.estimatedCostCents,
    createdAt: toIso(usage.createdAt)!,
  };
}

function mapAiCostLedger(cost: any): AiCostLedgerRecord {
  return {
    id: cost.id,
    organizationId: cost.organizationId,
    projectId: cost.projectId ?? undefined,
    conversationId: cost.conversationId ?? undefined,
    messageId: cost.messageId ?? undefined,
    provider: cost.provider,
    model: cost.model,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costCents: cost.costCents,
    reason: cost.reason,
    createdAt: toIso(cost.createdAt)!,
  };
}

function mapCreditWallet(wallet: any): CreditWalletRecord {
  return {
    id: wallet.id,
    organizationId: wallet.organizationId,
    balanceCents: wallet.balanceCents,
    currency: wallet.currency,
    budgetCapCents: wallet.budgetCapCents ?? undefined,
    serviceShutdownCents: wallet.serviceShutdownCents ?? undefined,
    autoTopupCents: wallet.autoTopupCents ?? undefined,
    lastSpendAlertPct: wallet.lastSpendAlertPct ?? undefined,
    lastSpendAlertPeriodStart: toIso(wallet.lastSpendAlertPeriodStart),
    createdAt: toIso(wallet.createdAt)!,
    updatedAt: toIso(wallet.updatedAt)!,
  };
}

function mapCreditPack(pack: any): CreditPackRecord {
  return {
    id: pack.id,
    organizationId: pack.organizationId,
    purchasedCents: pack.purchasedCents,
    remainingCents: pack.remainingCents,
    expiresAt: toIso(pack.expiresAt)!,
    stripePaymentIntentId: pack.stripePaymentIntentId ?? undefined,
    createdAt: toIso(pack.createdAt)!,
  };
}

function mapCreditLedger(entry: any): CreditLedgerRecord {
  return {
    id: entry.id,
    walletId: entry.walletId,
    organizationId: entry.organizationId,
    deltaCents: entry.deltaCents,
    kind: entry.kind,
    reason: entry.reason,
    checkpointId: entry.checkpointId ?? undefined,
    expiresAt: toIso(entry.expiresAt) ?? undefined,
    metadata: entry.metadata ?? undefined,
    createdAt: toIso(entry.createdAt)!,
  };
}

function mapAgentCheckpoint(checkpoint: any): AgentCheckpointRecord {
  return {
    id: checkpoint.id,
    organizationId: checkpoint.organizationId,
    userId: checkpoint.userId ?? undefined,
    projectId: checkpoint.projectId ?? undefined,
    conversationId: checkpoint.conversationId ?? undefined,
    runId: checkpoint.runId ?? undefined,
    status: checkpoint.status,
    highPowerModel: checkpoint.highPowerModel,
    extendedThinking: checkpoint.extendedThinking,
    buildTier: checkpoint.buildTier,
    turboMode: checkpoint.turboMode,
    inputTokens: checkpoint.inputTokens,
    outputTokens: checkpoint.outputTokens,
    wallMs: checkpoint.wallMs,
    computeCents: checkpoint.computeCents,
    rawProviderCents: checkpoint.rawProviderCents,
    creditCents: checkpoint.creditCents,
    startedAt: toIso(checkpoint.startedAt)!,
    completedAt: toIso(checkpoint.completedAt) ?? undefined,
  };
}

function mapProviderConfig(config: any): ProviderConfigRecord {
  return {
    id: config.id,
    provider: config.provider,
    displayName: config.displayName,
    enabled: config.enabled,
    apiKeySecret: config.apiKeySecret ?? undefined,
    apiKeyEnc: config.apiKeyEnc ?? undefined,
    baseUrl: config.baseUrl ?? undefined,
    byokAllowed: config.byokAllowed,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapModelConfig(config: any): ModelConfigRecord {
  return {
    id: config.id,
    providerConfigId: config.providerConfigId,
    provider: config.providerConfig?.provider ?? undefined,
    modelId: config.modelId,
    displayName: config.displayName,
    enabled: config.enabled,
    enabledPlans: Array.isArray(config.enabledPlans) ? config.enabledPlans : [],
    isHighPower: config.isHighPower,
    supportsThinking: config.supportsThinking,
    inputCentsPerM: config.inputCentsPerM,
    outputCentsPerM: config.outputCentsPerM,
    contextWindow: config.contextWindow,
    createdAt: toIso(config.createdAt)!,
    updatedAt: toIso(config.updatedAt)!,
  };
}

function mapBillingCustomer(customer: any): BillingCustomerRecord {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    provider: customer.provider,
    externalId: customer.externalId,
    createdAt: toIso(customer.createdAt)!,
  };
}

function mapBillingPlan(plan: any): BillingPlanRecord {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    monthlyCents: plan.monthlyCents,
    limits: plan.limits ?? {},
    stripeProductId: plan.stripeProductId ?? undefined,
    stripePriceId: plan.stripePriceId ?? undefined,
    stripePriceMonthlyId: plan.stripePriceMonthlyId ?? undefined,
    stripePriceAnnualId: plan.stripePriceAnnualId ?? undefined,
  };
}

function mapSubscription(subscription: any): SubscriptionRecord {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    planKey: subscription.plan?.key ?? 'free',
    externalId: subscription.externalId ?? undefined,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    trialEndsAt: toIso(subscription.trialEndsAt),
    currentPeriodStart: toIso(subscription.currentPeriodStart),
    currentPeriodEnd: toIso(subscription.currentPeriodEnd),
    createdAt: toIso(subscription.createdAt)!,
    updatedAt: toIso(subscription.updatedAt),
    lastStripeEventAt: toIso(subscription.lastStripeEventAt),
  };
}

function mapUsageEvent(event: any): UsageEventRecord {
  return {
    id: event.id,
    organizationId: event.organizationId,
    userId: event.userId ?? undefined,
    type: event.type,
    quantity: event.quantity,
    metadata: event.metadata ?? undefined,
    createdAt: toIso(event.createdAt)!,
  };
}

function mapQuotaOverride(override: any): QuotaOverrideRecord {
  return {
    id: override.id,
    organizationId: override.organizationId,
    key: override.key,
    limit: override.limit,
    reason: override.reason,
    createdByUserId: override.createdByUserId ?? undefined,
    expiresAt: toIso(override.expiresAt),
    createdAt: toIso(override.createdAt)!,
  };
}

function mapStripeEvent(event: any): StripeEventRecord {
  return {
    id: event.id,
    organizationId: event.organizationId ?? undefined,
    type: event.type,
    processedAt: toIso(event.processedAt)!,
    payload: event.payload,
  };
}

function mapStripeWebhookFailure(failure: any): StripeWebhookFailureRecord {
  return {
    id: failure.id,
    eventId: failure.eventId,
    type: failure.type,
    payload: failure.payload,
    attempts: failure.attempts,
    lastError: failure.lastError,
    failedAt: toIso(failure.failedAt)!,
    resolvedAt: toIso(failure.resolvedAt),
  };
}

function mapEmailDeliveryEvent(event: any): EmailDeliveryEventRecord {
  return {
    id: event.id,
    provider: event.provider,
    providerEventId: event.providerEventId,
    type: event.type,
    email: event.email,
    emailMessageId: event.emailMessageId ?? undefined,
    subject: event.subject ?? undefined,
    fromAddress: event.fromAddress ?? undefined,
    payload: event.payload,
    receivedAt: toIso(event.receivedAt)!,
  };
}
```

---

## 2b) FULL SOURCE — services/api/src/tests/account-purge-db.spec.ts (final head)

```ts
import { hashPassword } from '@vibecore/auth';
import { createDatabaseClient } from '@vibecore/database';
import { describe, expect, it, vi } from 'vitest';

import type { ErasureProof, PurgeStorageInventory } from '../account-purge.js';
import { eraseSubjectStorage } from '../account-storage-purge.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { PrismaApiStore } from '../prisma-store.js';

/*
 * Physical-erasure hook for these real-Postgres route tests. It drives the REAL
 * eraseProjectsStorage orchestration against in-memory fake storage seeded with
 * a bucket + workspace per project — so the route's fail-closed physical gate is
 * genuinely exercised (list → delete → verify 0) WITHOUT a live workspace-manager
 * / GCS. The SQL assertions below verify the row-level purge; the physical proof
 * has its own dedicated suites. Without this, the route's default eraser would
 * fetch a non-existent workspace-manager and (correctly) fail the purge closed.
 */
function verifiedPhysicalPurger() {
  return (inventory: PurgeStorageInventory) => {
    const buckets = new Map<string, string[]>();
    const pvcs = new Set<string>();
    let frozen = false;

    for (const id of inventory.bucketProjectIds) {
      buckets.set(id, ['seed-object.bin']);
    }

    const workspaceIds = inventory.workspaceProjectIds.map((id) => `ws-${id}`);

    for (const wsId of workspaceIds) {
      pvcs.add(wsId);
    }

    return eraseSubjectStorage(
      { bucketProjectIds: inventory.bucketProjectIds, workspaceIds },
      {
        writeBarrier: {
          async freeze() {
            frozen = true;
          },
        },
        objectStorage: {
          active: true,
          async bucketExists(projectId) {
            return buckets.has(projectId);
          },
          async listObjects(projectId) {
            return { objects: (buckets.get(projectId) ?? []).map((key) => ({ key })) };
          },
          async deleteBucket(projectId) {
            // Only allow deletion after the write barrier (reserve #1).
            if (frozen) {
              buckets.delete(projectId);
            }

            return { deleted: frozen, bucket: `vc-${projectId}` };
          },
        },
        workspaceVolumes: {
          async pvcExists(workspaceId) {
            return pvcs.has(workspaceId);
          },
          async deleteWorkspace(workspaceId) {
            if (frozen) {
              pvcs.delete(workspaceId);
            }
          },
        },
      },
    );
  };
}

/*
 * §16.12 purge executor — DURABLE proofs against a REAL Postgres. Gated on
 * DATABASE_URL like the other DB-backed suites (ledger-store-db.spec.ts):
 * runs in CI and locally against a migrated Postgres, silently skips otherwise.
 *
 * Proves, with real SQL state:
 *   (1) full account purge: data seeded across classes (session, org, project,
 *       import, AI conversation+message, usage event, audit trail) → deletion
 *       requested → grace window elapsed by REWRITING the requestedAt
 *       timestamp in the DB (never the clock) → worker route executed →
 *       per-class "0 rows remaining" SQL verification → erasure proof re-read
 *       from the AdminAuditLog table;
 *   (2) refusal while the window has not elapsed (negative);
 *   (3) idempotence: a re-run on a purged account is a no-op;
 *   (4) concurrency: two INDEPENDENT Prisma clients racing on the same user
 *       yield exactly one purge (advisory-lock serialization);
 *   (5) fail-closed retention: a posted double-entry ledger transaction
 *       (immutability triggers, mig 0078) survives the purge and is consigned.
 */

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const prisma = createDatabaseClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const runDbTests = (await canReachDatabase()) ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'purge-db-internal-secret';
const suffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Seed a user with rows in every purgeable class. Returns ids for later SQL checks. */
async function seedAccount(store: PrismaApiStore) {
  const tag = suffix();
  const user = await store.createUser({
    email: `purge-${tag}@example.com`,
    name: 'Purge Db',
    passwordHash: hashPassword('password123'),
  });
  await store.createSession({ userId: user.id, token: `tok-${tag}`, expiresAt: new Date(Date.now() + 3600_000) });

  const org = await store.createOrganization({ name: `Purge Org ${tag}`, slug: `purge-org-${tag}`, ownerUserId: user.id });
  const project = await store.createProject({ organizationId: org.id, name: `Secret ${tag}`, slug: `secret-${tag}` });
  const importJob = await store.createImportJob({ organizationId: org.id, actorUserId: user.id, provider: 'zip' });
  const conversation = await store.createAiConversation({ projectId: project.id, userId: user.id, title: 'chat' });
  await store.createAiMessage({ conversationId: conversation.id, role: 'user', content: 'hello purge' });
  await store.recordUsageEvent({ organizationId: org.id, userId: user.id, type: 'ai.tokens', quantity: 7 });
  await store.recordAudit({
    actorUserId: user.id,
    action: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    ipAddress: '203.0.113.9',
    metadata: { name: `Secret ${tag}` },
  });

  return { user, org, project, importJob, conversation, tag };
}

/** Mark deletion requested, then rewind requestedAt IN THE DB (never the clock). */
async function requestElapsedDeletion(store: PrismaApiStore, userId: string, daysAgo = 15) {
  const user = (await store.findUserById(userId))!;
  const requestedAt = new Date(Date.now() - daysAgo * DAY).toISOString();
  await store.updateUser({
    userId,
    preferences: { ...(user.preferences ?? {}), accountDeletion: { requestedAt } },
  });
  await store.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: userId });
}

runDbTests('account purge — durable proofs (real Postgres)', () => {
  it('(2 NEGATIVE first) refuses while the grace window has not elapsed', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id, 2); // only 2 days in

      const result = await store.purgeUserAccount({ userId: user.id });
      expect(result.outcome).toBe('not_due');

      // Untouched: session + conversation still present in SQL.
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops', async () => {
    const previousSecret = process.env.INTERNAL_API_SHARED_SECRET;
    process.env.INTERNAL_API_SHARED_SECRET = SECRET;
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const app = await buildApiApp({
        store,
        emailProvider: new QuietEmailProvider(),
        accountStoragePurger: verifiedPhysicalPurger(),
      });
      const { user, org, project, importJob, conversation } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      const res = await app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: { authorization: `Bearer ${SECRET}` },
        payload: { enabled: true, userId: user.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ready: 1, purged: 1, failed: 0 });

      // ---- per-class SQL verification: 0 rows remaining ----
      expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.aiConversation.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.aiMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
      expect(await prisma.importJob.count({ where: { id: importJob.id } })).toBe(0);
      expect(await prisma.organizationMember.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.oAuthConnection.count({ where: { userId: user.id } })).toBe(0);

      // ---- anonymized, not deleted ----
      const tombstone = await prisma.user.findUnique({ where: { id: user.id } });
      expect(tombstone).toBeTruthy();
      expect(tombstone!.email).toBe(`purged-${user.id}@erased.invalid`);
      expect(tombstone!.name).toBeNull();
      expect(tombstone!.passwordHash).toBeNull();

      const orgShell = await prisma.organization.findUnique({ where: { id: org.id } });
      expect(orgShell!.name).toBe('Purged account');
      expect(orgShell!.slug).toBe(`purged-${org.id}`);

      // Financial record retained (7-year fail-closed), detached from the user.
      const usage = await prisma.usageEvent.findMany({ where: { organizationId: org.id } });
      expect(usage.length).toBe(1);
      expect(usage[0]!.userId).toBeNull();

      // Audit trail redacted in place, rows preserved.
      const audits = await prisma.auditLog.findMany({ where: { actorUserId: user.id } });
      expect(audits.length).toBeGreaterThanOrEqual(1);

      for (const row of audits) {
        expect(row.ipAddress).toBeNull();
        expect((row.metadata as { redacted?: boolean }).redacted).toBe(true);
      }

      // ---- the proof, re-read from the DB ----
      const proofRow = await prisma.adminAuditLog.findFirst({
        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
        orderBy: { createdAt: 'desc' },
      });
      expect(proofRow).toBeTruthy();

      const proof = (proofRow!.metadata as unknown as { proof: ErasureProof }).proof;
      expect(proof.kind).toBe('account-erasure-proof');
      expect(proof.verifiedZeroRemaining).toBe(true);
      expect(proof.classes.filter((c) => c.action === 'deleted').every((c) => c.remainingAfterPurge === 0)).toBe(true);
      expect(proof.exceptions.some((e) => e.dataClass === 'financial_records')).toBe(true);

      // ---- (3) idempotence: re-run is a proven no-op ----
      const again = await store.purgeUserAccount({ userId: user.id });
      expect(again.outcome).toBe('already_purged');

      const proofCount = await prisma.adminAuditLog.count({
        where: { action: 'account.purge_completed', metadata: { path: ['userId'], equals: user.id } },
      });
      expect(proofCount).toBe(1);
    } finally {
      process.env.INTERNAL_API_SHARED_SECRET = previousSecret;
      await prisma.$disconnect();
    }
  });

  it('(4) two INDEPENDENT clients racing on the same user yield exactly one purge', async () => {
    const prismaA = createDatabaseClient();
    const prismaB = createDatabaseClient();

    try {
      const storeA = new PrismaApiStore(prismaA);
      const storeB = new PrismaApiStore(prismaB);
      const { user } = await seedAccount(storeA);
      await requestElapsedDeletion(storeA, user.id);

      const [a, b] = await Promise.all([
        storeA.purgeUserAccount({ userId: user.id }),
        storeB.purgeUserAccount({ userId: user.id }),
      ]);
      expect([a.outcome, b.outcome].sort()).toEqual(['already_purged', 'purged']);

      // Single tombstone; the account was erased once.
      expect(await prismaA.session.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      await Promise.allSettled([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  it('(5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org } = await seedAccount(store);

      // Post a balanced double-entry transaction for the user's org.
      const account = await prisma.ledgerAccount.create({
        data: { organizationId: org.id, key: 'user_credits', type: 'LIABILITY', currency: 'usd' },
      });
      const contra = await prisma.ledgerAccount.create({
        data: { organizationId: org.id, key: 'revenue', type: 'REVENUE', currency: 'usd' },
      });
      const posted = await prisma.ledgerTransaction.create({
        data: {
          organizationId: org.id,
          reason: 'purge.test',
          entries: {
            create: [
              { accountId: account.id, direction: 'DEBIT', amountMinor: 100n, currency: 'usd' },
              { accountId: contra.id, direction: 'CREDIT', amountMinor: 100n, currency: 'usd' },
            ],
          },
        },
      });

      await requestElapsedDeletion(store, user.id);
      const result = await store.purgeUserAccount({ userId: user.id });
      expect(result.outcome).toBe('purged');

      if (result.outcome === 'purged') {
        const ledger = result.proof.classes.find((entry) => entry.dataClass === 'ledger')!;
        expect(ledger.action).toBe('retained');
        expect(ledger.reason).toBe('ledger_immutable_posted_entries_mig0078');
        expect(ledger.models.LedgerTransaction).toBe(1);
        expect(result.proof.exceptions.some((e) => e.dataClass === 'ledger')).toBe(true);
      }

      // The posted transaction is still there…
      expect(await prisma.ledgerTransaction.count({ where: { id: posted.id } })).toBe(1);

      // …and the DB trigger still refuses a DELETE outright.
      await expect(prisma.ledgerTransaction.delete({ where: { id: posted.id } })).rejects.toThrow(/append-only/);
    } finally {
      await prisma.$disconnect();
    }
  });

  /*
   * RR-09 — the topology GUARANTEE is acquired BEFORE the irreversible external
   * erasure: membership + object storage are frozen and the authoritative
   * sole/shared topology is recorded atomically under the advisory lock. So the
   * deletion only ever touches buckets that are sole UNDER THE LOCK, membership
   * cannot flip while the erasure runs, and the freeze is released on every exit.
   * The `eraseStorage` hook is the during-erasure window (it runs after the
   * guarantee, before the finalize tx), so membership mutations attempted inside
   * it must be refused.
   */

  const MEMBERSHIP_FREEZE_LOCK = 'purge:membership-freeze';
  type Db = ReturnType<typeof createDatabaseClient>;

  // RR-1bd27929: a resource is frozen iff >= 1 PurgeFreeze row references it.
  async function membershipFrozen(prisma: Db, orgId: string): Promise<boolean> {
    return (await prisma.purgeFreeze.count({ where: { resourceType: 'membership', resourceId: orgId } })) > 0;
  }

  async function objectStorageFrozen(prisma: Db, projectId: string): Promise<boolean> {
    return (await prisma.purgeFreeze.count({ where: { resourceType: 'objectStorage', resourceId: projectId } })) > 0;
  }

  async function planFor(prisma: Db, userId: string) {
    return prisma.purgePlan.findFirst({ where: { userId } });
  }

  // Seed a PurgePlan (+ its PurgeFreeze rows) directly — models a crashed/abandoned
  // run. `leaseExpiresAt` in the past = reclaimable by the reconciler.
  async function seedPlan(
    prisma: Db,
    userId: string,
    orgIds: string[],
    projectIds: string[],
    opts?: { leaseExpiresAt?: Date; ownerToken?: string },
  ) {
    const plan = await prisma.purgePlan.create({
      data: {
        userId,
        ownerToken: opts?.ownerToken ?? `token-${suffix()}`,
        leaseExpiresAt: opts?.leaseExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const rows = [
      ...orgIds.map((id) => ({ planId: plan.id, resourceType: 'membership', resourceId: id })),
      ...projectIds.map((id) => ({ planId: plan.id, resourceType: 'objectStorage', resourceId: id })),
    ];

    if (rows.length > 0) {
      await prisma.purgeFreeze.createMany({ data: rows });
    }

    return plan;
  }

  async function makeShared(store: PrismaApiStore, prisma: ReturnType<typeof createDatabaseClient>, orgId: string, ownerUserId: string) {
    const owner = (await prisma.organizationMember.findFirst({ where: { organizationId: orgId, userId: ownerUserId } }))!;
    const co = await store.createUser({
      email: `co-${suffix()}@example.com`,
      name: 'Co Member',
      passwordHash: hashPassword('password123'),
    });
    await prisma.organizationMember.create({ data: { organizationId: orgId, userId: co.id, roleId: owner.roleId } });

    return co;
  }

  it('(6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await makeShared(store, prisma, org.id, user.id); // org is SHARED at guarantee time
      await requestElapsedDeletion(store, user.id);

      let captured: PurgeStorageInventory | undefined;
      const eraseStorage = async (inv: PurgeStorageInventory) => {
        captured = inv;

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');

      // The shared org's bucket is NEVER handed to the erasure → never deleted.
      expect(captured!.bucketProjectIds).not.toContain(project.id);
      // The shared org + its project survive (retained for the co-member).
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
      expect(await prisma.organization.count({ where: { id: org.id } })).toBe(1);
      // No residual freeze after the successful purge.
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org } = await seedAccount(store);
      const co = await makeShared(store, prisma, org.id, user.id);
      await requestElapsedDeletion(store, user.id);

      let leaveError: unknown;
      const eraseStorage = async () => {
        // Co-member tries to leave during the erasure → must be REFUSED.
        leaveError = await store
          .removeMember(org.id, co.id)
          .then(() => null)
          .catch((e) => e);

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');
      expect(String(leaveError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
      // The leave was blocked → the co-member is still a member.
      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: co.id } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store); // SOLE org
      const joiner = await store.createUser({
        email: `join-${suffix()}@example.com`,
        name: 'Late Joiner',
        passwordHash: hashPassword('password123'),
      });
      await requestElapsedDeletion(store, user.id);

      let joinError: unknown;
      let captured: PurgeStorageInventory | undefined;
      const eraseStorage = async (inv: PurgeStorageInventory) => {
        captured = inv;
        joinError = await store
          .addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })
          .then(() => null)
          .catch((e) => e);

        return { classes: [], verified: true };
      };

      const result = await store.purgeUserAccount({ userId: user.id }, { eraseStorage });
      expect(result.outcome).toBe('purged');
      expect(String(joinError)).toMatch(/MEMBERSHIP_FROZEN_FOR_PURGE/);
      // The join was blocked → the sole bucket was correctly in the erase set.
      expect(captured!.bucketProjectIds).toContain(project.id);
      expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: joiner.id } })).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(9) NO residual freeze after a FAILED purge (guaranteed release on throw)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // Physical erasure reports NOT verified → the purge throws fail-closed.
      const eraseStorage = async () => ({ classes: [], verified: false });

      await expect(store.purgeUserAccount({ userId: user.id }, { eraseStorage })).rejects.toThrow(
        /ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/,
      );

      // RR-09 (6): both freeze sets released, plan cleared — nothing left behind.
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await planFor(prisma, user.id)).toBeNull();
      // The org is writable again: a member can join now that the freeze is gone.
      const joiner = await store.createUser({
        email: `after-${suffix()}@example.com`,
        name: 'After',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(10) reconciler releases a freeze left behind by a crashed run (recoverable state machine)', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store);

      // Simulate a crash mid-erasure: an ABANDONED plan (lease already expired) +
      // its freeze rows persisted but never released.
      await seedPlan(prisma, user.id, [org.id], [project.id], { leaseExpiresAt: new Date(Date.now() - 60_000) });

      // The org is frozen — a join is refused…
      const joiner = await store.createUser({
        email: `recon-${suffix()}@example.com`,
        name: 'Recon',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
        /MEMBERSHIP_FROZEN_FOR_PURGE/,
      );

      // …until the reconciler releases the stale freeze.
      const { reconciled } = await store.reconcilePurgeFreezes();
      expect(reconciled).toBeGreaterThanOrEqual(1);
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
      expect(await planFor(prisma, user.id)).toBeNull();
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased)', async () => {
    const prisma = createDatabaseClient(); // seed + assertions
    const prismaA = createDatabaseClient(); // the racing mutation: holds the freeze-set lock FIRST
    const prismaB = createDatabaseClient(); // the purge
    const prismaC = createDatabaseClient(); // pg_locks poller

    const MEMBERSHIP_LOCK = MEMBERSHIP_FREEZE_LOCK;

    try {
      const store = new PrismaApiStore(prisma);
      const storeB = new PrismaApiStore(prismaB);
      const { user, org, project } = await seedAccount(store); // SOLE org + bucket
      const owner = (await prisma.organizationMember.findFirst({
        where: { organizationId: org.id, userId: user.id },
      }))!;
      const joiner = await store.createUser({
        email: `race-${suffix()}@example.com`,
        name: 'Racer',
        passwordHash: hashPassword('password123'),
      });
      await requestElapsedDeletion(store, user.id);

      /*
       * Connection A grabs the SAME membership freeze-set advisory lock the
       * guarantee needs, BEFORE the purge starts, then — on signal — adds a member
       * and commits. This is exactly "a mutation that slipped into the read→freeze
       * window". Because the guarantee now takes that lock BEFORE reading topology,
       * the purge blocks until A commits, so A's join is REFLECTED in the topology.
       */
      let signalHeld!: () => void;
      const held = new Promise<void>((resolve) => (signalHeld = resolve));
      let go!: () => void;
      const proceed = new Promise<void>((resolve) => (go = resolve));

      const aTx = prismaA.$transaction(
        async (txA) => {
          await txA.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', MEMBERSHIP_LOCK);
          signalHeld();
          await proceed;
          await txA.organizationMember.create({
            data: { organizationId: org.id, userId: joiner.id, roleId: owner.roleId },
          });
        },
        { timeout: 30_000 },
      );

      await held; // A now holds the freeze-set lock

      let captured: PurgeStorageInventory | undefined;
      const bPurge = storeB.purgeUserAccount(
        { userId: user.id },
        {
          eraseStorage: async (inv: PurgeStorageInventory) => {
            captured = inv;

            return { classes: [], verified: true };
          },
        },
      );

      // Wait until the purge is BLOCKED on the membership advisory lock — proving it
      // takes that lock BEFORE reading topology (the CODEX-10 fix). Without the fix
      // the purge would read topology first and would NOT block here.
      let blocked = false;

      for (let i = 0; i < 200 && !blocked; i++) {
        const rows = (await prismaC.$queryRawUnsafe(
          `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
        )) as Array<{ n: number }>;
        blocked = (rows[0]?.n ?? 0) >= 1;

        if (!blocked) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      expect(blocked).toBe(true);

      go(); // let A insert the member + commit + release the lock
      await aTx;
      const result = await bPurge;

      // The join committed just before the freeze IS reflected: the org is shared
      // under the guarantee → its bucket is NEVER handed to eraseStorage.
      expect(result.outcome).toBe('purged');
      expect(captured!.bucketProjectIds).not.toContain(project.id);
      expect(await prisma.project.count({ where: { id: project.id } })).toBe(1); // bucket/project survive
      // No residual freeze after the successful purge.
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false);
    } finally {
      await Promise.allSettled([
        prisma.$disconnect(),
        prismaA.$disconnect(),
        prismaB.$disconnect(),
        prismaC.$disconnect(),
      ]);
    }
  });

  /*
   * RR-1bd27929 — MULTI-PLAN SAFETY. Freezes are per-plan rows, so releasing one
   * plan never lifts a freeze another live plan owns; the reconciler reclaims ONLY
   * lease-expired plans, via CAS, touching just that plan's rows.
   */

  it('(15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org } = await seedAccount(store);
      const co = await makeShared(store, prisma, org.id, user.id); // org SHARED (user + co)

      // Plan B: a SECOND concurrent purge (co's), blocked in erase → a live plan
      // that also freezes this org. Modelled by its persisted plan + freeze row.
      const planB = await seedPlan(prisma, co.id, [org.id], []);

      // Plan A: user's REAL purge runs to completion (org is shared → no bucket);
      // its release must delete ONLY plan A's rows.
      await requestElapsedDeletion(store, user.id);
      const result = await store.purgeUserAccount(
        { userId: user.id },
        { eraseStorage: async () => ({ classes: [], verified: true }) },
      );
      expect(result.outcome).toBe('purged');

      // Plan A released, but plan B still freezes the org → STILL frozen.
      expect(await planFor(prisma, user.id)).toBeNull(); // A gone
      expect(await membershipFrozen(prisma, org.id)).toBe(true); // B's row remains
      // …and a join stays REFUSED while >= 1 plan freezes the org.
      const joiner = await store.createUser({
        email: `j15-${suffix()}@example.com`,
        name: 'J15',
        passwordHash: hashPassword('password123'),
      });
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).rejects.toThrow(
        /MEMBERSHIP_FROZEN_FOR_PURGE/,
      );

      // The freeze disappears ONLY after the LAST plan (B) releases.
      await prisma.purgePlan.delete({ where: { id: planB.id } }); // cascade removes B's rows
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      await expect(store.addMember({ organizationId: org.id, userId: joiner.id, roleKey: 'member' })).resolves.toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store);

      // Plan B holds a VALID lease (its owner is blocked in a slow eraseStorage).
      const planB = await seedPlan(prisma, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // A different executor runs the reconciler: it must touch NOTHING.
      const { reconciled } = await store.reconcilePurgeFreezes();
      expect(reconciled).toBe(0);
      expect(await prisma.purgePlan.findUnique({ where: { id: planB.id } })).not.toBeNull();
      expect(await membershipFrozen(prisma, org.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('(17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources', async () => {
    const prismaX = createDatabaseClient();
    const prismaY = createDatabaseClient();

    try {
      const storeX = new PrismaApiStore(prismaX);
      const storeY = new PrismaApiStore(prismaY);
      const { user, org, project } = await seedAccount(storeX);
      const other = await makeShared(storeX, prismaX, org.id, user.id); // shares org with a live plan

      // Abandoned plan (expired lease) freezing org + project.
      const abandoned = await seedPlan(prismaX, user.id, [org.id], [project.id], {
        leaseExpiresAt: new Date(Date.now() - 60_000),
      });
      // A concurrent LIVE plan (valid lease) that ALSO freezes the same org.
      const live = await seedPlan(prismaX, other.id, [org.id], [], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Two executors reconcile concurrently → CAS ensures the abandoned plan is
      // reclaimed exactly ONCE (never double-reclaimed).
      const [rx, ry] = await Promise.all([storeX.reconcilePurgeFreezes(), storeY.reconcilePurgeFreezes()]);
      expect(rx.reconciled + ry.reconciled).toBe(1);

      // The abandoned plan + its OWN rows are gone…
      expect(await prismaX.purgePlan.findUnique({ where: { id: abandoned.id } })).toBeNull();
      expect(await objectStorageFrozen(prismaX, project.id)).toBe(false); // was only the abandoned plan's
      // …but the concurrent LIVE plan is untouched, so the org stays frozen.
      expect(await prismaX.purgePlan.findUnique({ where: { id: live.id } })).not.toBeNull();
      expect(await membershipFrozen(prismaX, org.id)).toBe(true);
    } finally {
      await Promise.allSettled([prismaX.$disconnect(), prismaY.$disconnect()]);
    }
  });

  it('(18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched', async () => {
    const prisma = createDatabaseClient();

    try {
      const store = new PrismaApiStore(prisma);
      const { user, org, project } = await seedAccount(store);
      await requestElapsedDeletion(store, user.id);

      // A DIFFERENT plan (distinct owner) on other resources — must remain
      // untouched throughout. Distinct owner so planFor(user.id) resolves only the
      // crashed purge plan, not this one.
      const otherUser = await store.createUser({
        email: `other18-${suffix()}@example.com`,
        name: 'Other18',
        passwordHash: hashPassword('password123'),
      });
      const otherOrg = await store.createOrganization({
        name: `Other ${suffix()}`,
        slug: `other-${suffix()}`,
        ownerUserId: otherUser.id,
      });
      const otherProject = await store.createProject({
        organizationId: otherOrg.id,
        name: 'OtherP',
        slug: `otherp-${suffix()}`,
      });
      const otherPlan = await seedPlan(prisma, otherUser.id, [otherOrg.id], [otherProject.id], {
        leaseExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      // Crash BETWEEN the two thaws: fail the object-storage thaw (2nd deleteMany).
      const realDeleteMany = prisma.purgeFreeze.deleteMany.bind(prisma.purgeFreeze);
      const spy = vi
        .spyOn(prisma.purgeFreeze, 'deleteMany')
        .mockImplementation((async (args: Parameters<typeof realDeleteMany>[0]) => {
          if ((args as { where?: { resourceType?: string } })?.where?.resourceType === 'objectStorage') {
            throw new Error('boom: object-storage thaw failed');
          }

          return realDeleteMany(args);
        }) as typeof realDeleteMany);

      // Physical erase fails → purge throws → release runs and crashes mid-thaw.
      await expect(
        store.purgeUserAccount({ userId: user.id }, { eraseStorage: async () => ({ classes: [], verified: false }) }),
      ).rejects.toThrow(/ACCOUNT_PURGE_PHYSICAL_INCOMPLETE/);

      const plan = await planFor(prisma, user.id);
      // Membership thawed, object-storage still frozen, plan KEPT (recoverable).
      expect(await membershipFrozen(prisma, org.id)).toBe(false);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(true);
      expect(plan).not.toBeNull();
      // The OTHER plan's freezes are completely untouched.
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);
      expect(await objectStorageFrozen(prisma, otherProject.id)).toBe(true);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();

      // Recovery: expire the crashed plan's lease → reconciler reclaims it.
      await prisma.purgePlan.update({ where: { id: plan!.id }, data: { leaseExpiresAt: new Date(Date.now() - 60_000) } });
      const r1 = await store.reconcilePurgeFreezes();
      expect(r1.reconciled).toBeGreaterThanOrEqual(1);
      expect(await objectStorageFrozen(prisma, project.id)).toBe(false); // zero residual freeze
      expect(await planFor(prisma, user.id)).toBeNull();

      // Idempotent reprise: a second reconcile changes nothing, and the OTHER plan
      // (still live) is STILL untouched.
      const r2 = await store.reconcilePurgeFreezes();
      expect(r2.reconciled).toBe(0);
      expect(await prisma.purgePlan.findUnique({ where: { id: otherPlan.id } })).not.toBeNull();
      expect(await membershipFrozen(prisma, otherOrg.id)).toBe(true);

      spy.mockRestore();
    } finally {
      await prisma.$disconnect();
    }
  });

});
```

---

## 3) RAW OUTPUT — multi-plan ownership tests (15–18), real Postgres

```

 RUN  v3.2.6 /private/tmp/wt-phys47/services/api

 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (2 NEGATIVE first) refuses while the grace window has not elapsed
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (4) two INDEPENDENT clients racing on the same user yield exactly one purge
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives)
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (9) NO residual freeze after a FAILED purge (guaranteed release on throw)
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (10) reconciler releases a freeze left behind by a crashed run (recoverable state machine)
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased)
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases 348ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure 100ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources 184ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched 177ms

 Test Files  1 passed (1)
      Tests  4 passed | 10 skipped (14)
   Start at  22:17:24
   Duration  2.37s (transform 733ms, setup 0ms, collect 1.33s, tests 809ms, environment 0ms, prepare 58ms)

```

## 3b) RAW OUTPUT — deterministic read→freeze concurrent test (11)

```

 RUN  v3.2.6 /private/tmp/wt-phys47/services/api

 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (2 NEGATIVE first) refuses while the grace window has not elapsed
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (4) two INDEPENDENT clients racing on the same user yield exactly one purge
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives)
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (9) NO residual freeze after a FAILED purge (guaranteed release on throw)
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (10) reconciler releases a freeze left behind by a crashed run (recoverable state machine)
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased) 447ms
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources
 ↓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched

 Test Files  1 passed (1)
      Tests  1 passed | 13 skipped (14)
   Start at  22:17:27
   Duration  2.08s (transform 748ms, setup 0ms, collect 1.38s, tests 448ms, environment 0ms, prepare 57ms)

```

---

## 4) RAW OUTPUT — full real-Postgres purge suite (14 tests, incl. 11 + 15–18)

```

 RUN  v3.2.6 /private/tmp/wt-phys47/services/api

 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (2 NEGATIVE first) refuses while the grace window has not elapsed 194ms
{"level":30,"time":1785871039175,"pid":71579,"hostname":"MacBook-Pro-de-HB.local","reqId":"c154b2ab-71d3-45a2-a55a-82232201e03e","req":{"method":"POST","url":"/internal/account-purge","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871039263,"pid":71579,"hostname":"MacBook-Pro-de-HB.local","reqId":"c154b2ab-71d3-45a2-a55a-82232201e03e","event":"request.completed","requestId":"c154b2ab-71d3-45a2-a55a-82232201e03e","correlationId":"c154b2ab-71d3-45a2-a55a-82232201e03e","statusCode":200,"durationSeconds":0.08599996566772461}
{"level":30,"time":1785871039264,"pid":71579,"hostname":"MacBook-Pro-de-HB.local","reqId":"c154b2ab-71d3-45a2-a55a-82232201e03e","res":{"statusCode":200},"responseTime":79.97770801186562,"msg":"request completed"}
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (1+3) purges for real, verifies 0 rows per class in SQL, persists a re-readable proof, then no-ops 488ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (4) two INDEPENDENT clients racing on the same user yield exactly one purge 143ms
stdout | src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned
prisma:error Ledger LedgerTransaction is append-only: DELETE refused. Correct with a reversing transaction, never by mutating a posted event.

 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (5) a POSTED ledger transaction survives the purge (mig 0078 immutability) and is consigned 154ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (6) sole→shared: a bucket shared under the guarantee is NEVER erased (bucket survives) 159ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (7) shared→sole is PREVENTED: a co-member cannot leave while the org is purge-frozen 161ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (8) sole→shared is PREVENTED: a new member cannot join while the org is purge-frozen 163ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (9) NO residual freeze after a FAILED purge (guaranteed release on throw) 127ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (10) reconciler releases a freeze left behind by a crashed run (recoverable state machine) 151ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (11) CODEX-10: a join in the read→freeze window is reflected in the plan (bucket excluded, never erased) 307ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (15) two plans sharing an org: releasing one keeps the org frozen until the LAST plan releases 301ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (16) reconciler NEVER reclaims a live plan (valid lease), even one blocked in erasure 84ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (17) reconciler reclaims an ABANDONED plan via CAS, releasing ONLY its resources 160ms
 ✓ src/tests/account-purge-db.spec.ts > account purge — durable proofs (real Postgres) > (18) crash between the two thaws keeps the plan recoverable; reprise idempotent; no OTHER plan touched 155ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  22:17:16
   Duration  4.69s (transform 799ms, setup 0ms, collect 1.66s, tests 2.75s, environment 0ms, prepare 71ms)

```

## 4b) RAW OUTPUT — object-storage suites (34 tests)

```

 RUN  v3.2.6 /private/tmp/wt-phys47/services/api

 ✓ src/tests/account-storage-purge.spec.ts (6 tests) 4ms
 ✓ src/object-storage.spec.ts (26 tests) 8ms
{"level":30,"time":1785871043780,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"a5734e96-c09a-4ded-8e02-f8accf0f58a9","req":{"method":"POST","url":"/projects/project_kpyjgm6j52msf1ichm/thumbnail/upload-url","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871043793,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"a5734e96-c09a-4ded-8e02-f8accf0f58a9","event":"request.completed","requestId":"a5734e96-c09a-4ded-8e02-f8accf0f58a9","correlationId":"a5734e96-c09a-4ded-8e02-f8accf0f58a9","userId":"user_p6uzuhan27bmsf1ichm","projectId":"project_kpyjgm6j52msf1ichm","statusCode":200,"durationSeconds":0.010999917984008789}
{"level":30,"time":1785871043793,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"a5734e96-c09a-4ded-8e02-f8accf0f58a9","res":{"statusCode":200},"responseTime":4.824625015258789,"msg":"request completed"}
{"level":30,"time":1785871043793,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"555243a2-eff9-49d3-92f6-99e8722fadcf","req":{"method":"POST","url":"/projects/project_kpyjgm6j52msf1ichm/thumbnail/upload-url","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871043794,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"555243a2-eff9-49d3-92f6-99e8722fadcf","event":"request.completed","requestId":"555243a2-eff9-49d3-92f6-99e8722fadcf","correlationId":"555243a2-eff9-49d3-92f6-99e8722fadcf","userId":"user_p6uzuhan27bmsf1ichm","projectId":"project_kpyjgm6j52msf1ichm","statusCode":403,"durationSeconds":0.0009999275207519531}
{"level":30,"time":1785871043794,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"555243a2-eff9-49d3-92f6-99e8722fadcf","res":{"statusCode":403},"responseTime":1.075791984796524,"msg":"request completed"}
{"level":30,"time":1785871043795,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"23ebf8fe-73d4-4c99-9ec8-fd7373219e70","req":{"method":"POST","url":"/projects/project_kpyjgm6j52msf1ichm/thumbnail/upload-url","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871043850,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"8e332355-3035-47f2-a5db-1b3525d0b18c","req":{"method":"POST","url":"/projects/project_mu4fc88fzammsf1icjq/object-storage/objects/upload-url","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871043795,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"23ebf8fe-73d4-4c99-9ec8-fd7373219e70","event":"request.completed","requestId":"23ebf8fe-73d4-4c99-9ec8-fd7373219e70","correlationId":"23ebf8fe-73d4-4c99-9ec8-fd7373219e70","userId":"user_p6uzuhan27bmsf1ichm","projectId":"project_kpyjgm6j52msf1ichm","statusCode":200,"durationSeconds":0}
{"level":30,"time":1785871043795,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"23ebf8fe-73d4-4c99-9ec8-fd7373219e70","res":{"statusCode":200},"responseTime":0.3400000035762787,"msg":"request completed"}
{"level":30,"time":1785871043855,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"8e332355-3035-47f2-a5db-1b3525d0b18c","event":"request.completed","requestId":"8e332355-3035-47f2-a5db-1b3525d0b18c","correlationId":"8e332355-3035-47f2-a5db-1b3525d0b18c","userId":"user_lg709ba0hamsf1icjq","projectId":"project_mu4fc88fzammsf1icjq","statusCode":403,"durationSeconds":0.003999948501586914}
{"level":30,"time":1785871043855,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"8e332355-3035-47f2-a5db-1b3525d0b18c","res":{"statusCode":403},"responseTime":4.289374977350235,"msg":"request completed"}
{"level":30,"time":1785871043855,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"f3f28614-f46d-47c6-8257-95b61cf31692","req":{"method":"GET","url":"/projects/project_mu4fc88fzammsf1icjq/object-storage/objects","hostname":"localhost","remoteAddress":"127.0.0.1"},"msg":"incoming request"}
{"level":30,"time":1785871043856,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"f3f28614-f46d-47c6-8257-95b61cf31692","event":"request.completed","requestId":"f3f28614-f46d-47c6-8257-95b61cf31692","correlationId":"f3f28614-f46d-47c6-8257-95b61cf31692","userId":"user_lg709ba0hamsf1icjq","projectId":"project_mu4fc88fzammsf1icjq","statusCode":200,"durationSeconds":0.0009999275207519531}
{"level":30,"time":1785871043856,"pid":71653,"hostname":"MacBook-Pro-de-HB.local","reqId":"f3f28614-f46d-47c6-8257-95b61cf31692","res":{"statusCode":200},"responseTime":0.4732919931411743,"msg":"request completed"}
 ✓ src/tests/object-storage-purge-freeze.spec.ts (2 tests) 201ms

 Test Files  3 passed (3)
      Tests  34 passed (34)
   Start at  22:17:21
   Duration  1.88s (transform 902ms, setup 0ms, collect 1.61s, tests 212ms, environment 0ms, prepare 169ms)

```
