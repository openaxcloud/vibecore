# Preuve — worker de purge de compte (§16.12) — 2026-07-22

## Contexte

Gap **HAUTE** du threat model / table de rétention
(`docs/parity/SECURITY_PRIVACY_COMPLIANCE.md` v3, §Rétention ligne 1) :
la machine d'états de suppression self-serve existait
(`services/api/src/data-deletion.ts` : request → grâce 14 j → `ready_to_purge`)
et la file admin `/admin/account-deletions` aussi, mais **aucun exécuteur ne
consommait `ready_to_purge`** — `purgedAt` n'était jamais écrit hors des specs.
Invariant §16.12 : toute suppression = tombstone → fenêtre de récupération →
**purge réelle** → **PREUVE d'effacement**.

## Ce qui est livré

- `services/api/src/account-purge.ts` — module pur : types de la **preuve
  d'effacement** (par classe : lignes supprimées / anonymisées / conservées
  avec motif, vérification « 0 ligne restante »), `buildErasureProof`,
  tombstones (`anonymizedEmail`, `anonymizedOrgSlug`).
- `store.purgeUserAccount` (interface `store.ts`, implémentations
  `prisma-store.ts` + `tests/test-api-store.ts`) — la purge réelle classe par
  classe, dans UNE transaction Postgres ouverte par
  `pg_advisory_xact_lock('account-purge:<userId>')` :
  - **supprimées** : sessions, tokens (email/reset/MFA), clés API, comptes
    connectés, historique IA (conversations + messages + tool calls),
    collaboration, projets + imports des orgs dont l'utilisateur est le SEUL
    membre, memberships, abonnement newsletter ;
  - **anonymisées** : AuditLog/AdminAuditLog **RÉDIGÉS jamais supprimés**
    (ipAddress→null, metadata→`{redacted:true}`), références utilisateur
    détachées (UsageEvent, AgentCallLog, LedgerReservation, AgentCheckpoint,
    ProjectActivity, ImportJob, GalleryListing, SupportTicket), org shells
    (nom/slug), **tombstone User** portant `purgedAt` ;
  - **conservées fail-closed, CONSIGNÉES** : enregistrements financiers dans
    la fenêtre 7 ans (`canPurgeFinancialRecord` — les lignes plus vieilles que
    2555 j sont effacées), **ledger 0078 immuable** (jamais de DELETE — retenu
    + consigné), contenu des orgs partagées (appartient aux autres membres).
  - **Vérification post-purge** : recomptage par classe supprimée ; toute
    ligne restante ⇒ exception ⇒ ROLLBACK complet (une purge partielle ne peut
    jamais être déclarée faite).
- Route interne `POST /internal/account-purge` (`requireInternalSecret`,
  **DRY-RUN par défaut** — purge seulement si `ACCOUNT_PURGE_ENABLED=true` ou
  `body.enabled`) : consomme `account.pendingDeletionUserIds`, purge les
  demandes échues, **persiste la preuve dans l'AdminAuditLog**
  (`account.purge_completed`, la preuve est écrite AVANT de sortir l'id de la
  file), retire l'id de la file. Échec ⇒ `account.purge_failed` + l'id reste.
- Worker BullMQ : job `account.purge` (queue `enterprise-jobs`,
  `triggerAccountPurge` dans `services/worker/src/index.ts`) + CronJob Helm
  `accountPurge` (30 4 * * *, `infra/helm/platform/templates/cronjobs.yaml`,
  rendu vérifié par `helm template`). Même patron que `inactivity.gc`.

## Tests

- `account-purge-routes.spec.ts` — 9 tests (négatifs d'abord) : 401 sans
  secret ; fenêtre NON échue → refus + données intactes ; annulation pendant
  la grâce → jamais purgé ; dry-run par défaut ; double exécution → no-op
  prouvé (1 seule preuve) ; 2 appels concurrents → 1 seule purge ; rétention
  financière fail-closed avec exception CONSIGNÉE ; purge complète (0 ligne
  par classe + preuve + tombstone + session morte → 401) ; org partagée
  conservée + consignée.
- `account-purge-db.spec.ts` — 4 preuves DURABLES contre un VRAI Postgres
  (gaté `DATABASE_URL`, tourne en CI) : refus fenêtre non échue ; purge réelle
  E2E (compte semé multi-classes → `requestedAt` reculé DANS LA DB, jamais
  l'horloge → route worker → vérifs SQL « 0 ligne » par classe → preuve RELUE
  depuis `AdminAuditLog` → re-run no-op, 1 seule preuve) ; 2 clients Prisma
  INDÉPENDANTS en course → exactement 1 purge (verrou advisory) ; transaction
  ledger POSTÉE survit + trigger 0078 refuse le DELETE (`append-only`).

Suite complète api : **1303 tests verts** (159 fichiers) avec DB réelle.

## Reproduire la preuve PG

```bash
docker run -d --name purge-proof-pg -e POSTGRES_DB=vibecore -e POSTGRES_USER=vibecore \
  -e POSTGRES_PASSWORD=vibecore -p 55440:5432 pgvector/pgvector:pg16   # PAS postgres:16 (migrations pgvector)
cd packages/database && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
  pnpm exec prisma migrate deploy --schema prisma/schema.prisma
cd ../../services/api && DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55440/vibecore \
  pnpm exec vitest run --config vitest.config.ts src/tests/account-purge-db.spec.ts
docker rm -f purge-proof-pg
```

## Pièces

- `purge-db-run1.log` — sortie vitest de la preuve PG (4/4 verts).
- `purge-sql-verification.log` — requêtes SQL brutes post-purge : tombstones
  anonymisés (`purged-<id>@erased.invalid`, passwordHash NULL, `purgedAt`
  stampé), 0 session / 0 conversation / 0 membership restants, org shells
  anonymisés, ledger retenu, UsageEvent détachés, preuves
  `verifiedZeroRemaining=true` (17 classes, 3 exceptions), AuditLog rédigé.
- `proof-sample.json` — une preuve d'effacement complète relue depuis la DB.

Conteneur `purge-proof-pg` détruit après la preuve.
