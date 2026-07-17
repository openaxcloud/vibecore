# D4 phase 1 — billing minimal de sûreté (UsageReservation) — 2026-07-17

**Règle d'Avi (17/07, approuvée « Oui ») :** _un import qui consomme des crédits ne doit pas
démarrer sans réservation idempotente et compensation sur échec._ Prérequis des
connecteurs — pas la facturation commerciale complète.

Branche : `feat/billing-usage-reservation` (base `b774bfa3` = origin/main). PR sans merge.

## Ce qui est livré

| Exigence | Implémentation |
| --- | --- |
| `UsageReservation` (clé d'idempotence · montant max · expiration · release/commit) | Modèle Prisma + migration `0076_usage_reservation` ; unique DB `(organizationId, idempotencyKey)` ; états `ACTIVE → COMMITTED/COMPENSATED/RELEASED/EXPIRED` par compare-and-set |
| Débit réel APRÈS l'étape billable | `commitReservation()` — seul point de débit, via le chemin comptable partagé `debitCredits` ; la réservation elle-même ne débite jamais |
| Compensation auto (cancel/timeout/échec) | `releaseReservation` (pré-commit : rien n'a été débité), sweep `expireUsageReservations` (timeout), `compensateReservation` (post-commit : entrée `REFUND` opposée) |
| Hard limit à une frontière sûre | `evaluateBoundary()` — pur, appelé UNIQUEMENT avant l'étape atomique (route commit : avant `COMMITTING`) ; jamais au milieu ; débit borné au plafond (clamp + overflow visible) |
| `UsageEvent` immuable | Trigger Postgres `usage_event_immutable` (UPDATE/DELETE → exception), aucune méthode de mutation dans `ApiStore`, `refuseUsageEventMutation()` au niveau service |
| Corrections par LedgerEntry compensatoire | `compensateReservation` APPEND une entrée `REFUND` corrélée — l'événement et le débit d'origine restent intacts |
| Corrélation explicite | `importJobId ↔ reservationId ↔ CreditLedger.reservationId` (colonne + index) ; `UsageEvent.metadata` porte `{reservationId, importJobId, ledgerEntryIds}` |
| `PaymentAuthorization` distincte | Modèle + service séparés (`payment-authorization-service.ts`) ; ne touche JAMAIS wallet/ledger (prouvé par test) ; achats refusés côté réservation (`PURCHASE_REQUIRES_PAYMENT_AUTHORIZATION`) et usage refusé côté paiement (`USAGE_REQUIRES_RESERVATION`) |
| UI estimation / plafond / résultat facturé | Réponses des routes d'import (`billing: {estimatedCents, maxAmountCents, committedCents…}`), `GET /orgs/:orgId/usage/reservations`, section « Credit reservations » sur `app/routes/usage.tsx` |

## Preuves négatives exigées (toutes en tests qui échouent sans le fix)

Fichier : `services/api/src/tests/usage-reservation-service.spec.ts` (21 tests) +
`services/api/src/tests/import-billing-routes.spec.ts` (6 tests, bout en bout HTTP) +
`services/api/src/tests/payment-authorization-service.spec.ts` (7 tests).

1. **Opération sans réservation → refusée.** `requireActiveReservation` jette
   `RESERVATION_REQUIRED` (402) ; prouvé aussi en live HTTP : commit d'import avec
   réservation supprimée → 402, aucun projet monté. Structurel : appliqué même en SHADOW.
2. **Rejouer la même idempotency key → une seule réservation.** Le rejeu renvoie la MÊME
   ligne (`replayed: true`), ne relève pas le plafond, `listUsageReservations` = 1 ;
   côté Prisma, unique DB + create/catch-P2002 (pas de read-then-write). Rejouer un
   commit débite exactement une fois (solde 700, pas 400).
3. **Cancel / timeout / échec → compensation, solde correct.** Cancel pré-commit :
   solde intact (1000), 0 entrée ledger. Timeout : sweep → `EXPIRED('timeout')`, solde
   intact. Échec post-commit : `REFUND +400` appliqué, solde revient à 1000, le débit
   d'origine `CONSUMPTION −400` reste dans l'historique ; double compensation = no-op.
4. **Hard limit au milieu d'un commit atomique → ne coupe PAS là.** Test N4 : l'étape
   atomique dépasse le plafond en plein milieu et se termine quand même ; la frontière
   SUIVANTE bloque (`proceed:false`, `remainingCents:0`). Le débit commis est borné au
   plafond (140 demandés / plafond 100 → 100 débités, overflow 40 tracé, jamais facturé).
   Sur la route : les deux contrôles sont AVANT `advance('COMMITTING')`, aucun dans le bloc.
5. **Mutation d'un `UsageEvent` → refusée.** Au niveau base : trigger
   `usage_event_immutable` (migration 0076) — `RAISE EXCEPTION` sur UPDATE et DELETE.
   Au niveau interface : aucune méthode update/delete (asserté par test). Au niveau
   service : `refuseUsageEventMutation()` → `USAGE_EVENT_IMMUTABLE` (409). La correction
   post-commit laisse l'événement byte-identique et APPEND au ledger.

## Chiffres — aucun sans mesure

Le prix builtin d'un import est **0** (`BUILTIN_IMPORT_PRICING`, version 1) : aucun prix
d'import n'a été mesuré ni décidé, donc rien n'est inventé. Le mécanisme complet
(réservation → frontière → commit → compensation) tourne à l'identique avec un plafond
réel ; les tests service utilisent des montants explicites non nuls pour prouver la
comptabilité. Fixer un prix = nouvelle version de pricing, jamais une mutation.

## Zéro mock sur les chemins d'argent

Les tests s'exécutent sur `TestApiStore` (implémentation complète en mémoire de
`ApiStore`, même contrat que `PrismaStore`) et sur l'app Fastify réelle (`buildApiApp` +
`app.inject`) — pas de stub des fonctions comptables. `debitCredits` (packs
earliest-first, clamp overdraw) est le chemin partagé existant, non dupliqué.

## Vérifications (worktree, base b774bfa3)

- `services/api` : `tsc --noEmit -p tsconfig.json` → exit 0
- `services/api` : build CI-strict (`tsc … src/server.ts`) → exit 0
- `packages/billing` : typecheck strict → exit 0
- Web app (`tsc --noEmit -p tsconfig.web.json`, couvre `app/routes/usage.tsx`) → exit 0
- `app/routes/usage.tsx` : eslint → clean
- Tests nouveaux : 21 + 7 + 6 = 34 verts ; non-régression : `credits-service`,
  `import-routes`, `credit-store`, `metering-service`, `connector-import` → exit 0
- Sorties complètes : [`test-runs.log`](./test-runs.log)

## Reste (hors phase 1, tracé)

- Prix d'import réel (nouvelle version de pricing) + activation `BILLING_CREDITS_ENABLED`.
- Branchement du hub connecteurs (`project-import-hub`, session dédiée, non commité au
  moment de cette branche) sur `reserveUsage`/`commitReservation` — l'API service est
  prête et documentée pour ça.
- Flux d'achat de domaines consommant `PaymentAuthorization` (l'objet + invariants sont
  livrés ; le PaymentIntent Stripe arrive avec le flux).
- Test live prod (migration 0076 + trigger) après merge — à l'écran + greps, 3 formats.
