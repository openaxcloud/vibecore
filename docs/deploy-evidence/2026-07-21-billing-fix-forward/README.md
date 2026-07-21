# Fix-forward facturation — réponse au refus expert des PR #27 / #28 (2026-07-21)

Réf. : `docs/parity/incoming/REPONSE_EXPERT_PR37_20260721.md` §D. Les deux PR
étant **mergées sur main**, les corrections sont fix-forward (branche
`fix/billing-ledger-concurrency`), pas un revert.

## Défauts corrigés 1 à 1

### PR #27 — Import + billing de sûreté

| # | Défaut (expert) | Correction | Preuve |
|---|---|---|---|
| 1 | `ImportCreditLedger.byKey` indexé par clé brute, sans namespace org | Réservation portée par `LedgerReservation` : contrainte **unique DB `(organizationId, idempotencyKey)`** ; backend in-memory (tests) également org-scoped | `import-billing-db.spec.ts` **A1** (même clé, 2 orgs → 2 réservations indépendantes, 2 rows) ; `import-billing.spec.ts` (multi-org in-memory) |
| 2 | Création idempotente non sérialisée (2 requêtes → 2 jobs) | La réservation durable est acquise **avant** la création du job ; create/catch-P2002 = sérialisation DB ; seul le gagnant (`created: true`) crée le job, le perdant rejoue | **A2** (2 reserves concurrentes, 2 connexions → exactement 1 `created`, 1 row) ; `import-routes.spec.ts` (2 POST simultanés → **1 seul ImportJob**, rejeu `replayed: true` même jobId) |
| 3 | Réservation in-process, perdue au redémarrage | `DurableImportCreditLedger` sur le grand livre #28 (Postgres) ; l'in-memory ne sert que les tests sans DB | **A3** (réservée+attachée par le client A, déconnecté ; lue et settlée par le client B) |
| 4 | Pas de contrôle d'ownership | `settleByJob`/`getByJob` prennent l'organisation appelante et refusent (`BILLING_RESERVATION_FOREIGN`) | **A4** (org intruse : settle refusé, lecture vide, hold du propriétaire intact) |

### PR #28 — Grand livre double entrée

| # | Défaut (expert) | Correction | Preuve |
|---|---|---|---|
| 1 | `COMMITTED` avant le post du settlement, sans transaction commune | `commitReservation` / `releaseReservation` / `compensateReservation` / `reserveUsage` : compare-and-set d'état **et** écritures postées via `postEntriesInTrx` dans **une seule `$transaction`** — tout ou rien | **B1** (double-commit concurrent → 1 seul settlement ; invariant : 0 réservation `COMMITTED` avec `settleTxId` null) |
| 2 | Hard limit lu/contrôlé hors verrou (2 réservations dépassent le plafond) | `SELECT … FOR UPDATE` sur le compte `reserved` puis balance + check + post **dans la même transaction** | **B2** (limite 100, 2×70 concurrents sur 2 connexions → exactement 1 accepté, 1 refus `LEDGER_HARD_LIMIT`, 1 seul hold ACTIVE) |
| 3 | `postTransaction` ne valide ni l'appartenance org ni la devise des comptes | `postEntriesInTrx` vérifie chaque compte : existence, `organizationId`, devise stockée = devise de l'écriture (`LEDGER_ACCOUNT_ORG_MISMATCH` / `LEDGER_ACCOUNT_CURRENCY_MISMATCH`) avant toute écriture | **B3** (compte d'une autre org → refus ; compte eur sur écriture usd → refus ; **0 transaction, 0 écriture persistées** après les refus) |
| 4 | Compensation fiscale dépendante d'un `taxMinor` refourni par l'appelant | `deriveCompensationEntries` : la ventilation (revenue/tax) est **dérivée des écritures de settlement persistées** ; `compensateReservation(id)` ne prend plus d'argument fiscal | **B4** (settle 60 dont tax 9 → compensation dérivée DEBIT revenue 51 + DEBIT tax 9 + CREDIT user_credits 60, `reversalOfId` = settleTx, tous les comptes à **zéro**) |

## Chiffres bruts

- Suites rejouées : **10 fichiers, 96/96 verts** (`test-runs.log`), dont :
  - `ledger-store-db.spec.ts` : 7/7 contre **vrai Postgres** (non-régression #28) ;
  - `import-billing-db.spec.ts` : **8/8 contre vrai Postgres** (A1-A4 + B1-B4, nouvelles preuves) ;
  - `import-routes.spec.ts` : 11/11 (dont 2 nouvelles preuves de sérialisation route) ;
  - suites import/connector/state-machine/zip : inchangées, vertes.
- Postgres réel : docker local `vibecore-postgres-1` (pgvector/pg16), migrations déployées jusqu'à `0078_double_entry_ledger` (`prisma migrate deploy` : « All migrations have been successfully applied »).
- Typecheck `tsc --noEmit -p tsconfig.json` (services/api) : exit 0.
- Build strict CI-équivalent (`tsc … src/server.ts`, TypeScript **5.8.3** épinglé) : exit 0.
  ⚠️ Note environnement : `npx tsc` local résout TypeScript 7.0.2 → `TS5112` sur le script `build` ; reproduit À L'IDENTIQUE sur main non modifié = préexistant, sans lien avec ce lot. Le CI (lockfile) utilise TS 5.x.

## Rejouer

```bash
DATABASE_URL=postgresql://…@127.0.0.1:55432/vibecore \
  npx vitest --run src/tests/import-billing-db.spec.ts src/tests/ledger-store-db.spec.ts
npx vitest --run src/import-billing.spec.ts src/tests/import-routes.spec.ts
```

Contrats mis à jour (v3, PENDING_REVIEW, rien d'auto-clôturé) :
`docs/parity/BILLING_LEDGER_CONTRACT.md`, `docs/parity/IMPORT_REMIX_CONTRACT.md`.
