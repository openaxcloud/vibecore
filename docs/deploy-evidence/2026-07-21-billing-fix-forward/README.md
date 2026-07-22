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

## Ronde 2 — refus expert de la PR #39 (corrigé)

| # | Défaut (expert) | Correction | Preuve |
|---|---|---|---|
| A | Réservation sans `importJobId` (crash entre reserve et attach) → `IMPORT_CREATE_IN_PROGRESS` indéfini, même expirée | Récupération des orphelines : `LedgerStore.reviveReservation` — hold mort non-attaché (EXPIRED/RELEASED) ré-armé + hold ré-écrit dans **une** transaction ; ACTIVE périmé : extension seule (pas de double hold) ; hold **vivant** non-attaché jamais ré-armé (pas de fork de job) | PG **A1/A2/A3 (#39)** : clé expirée → retry `created:true`, attach+settle OK, compte `reserved` à zéro ; stale-ACTIVE → 1 seule écriture de hold ; hold vivant → replay. Route : clé morte → retry **201**, 1 job |
| B | Settlement APRÈS persistance de la cible → échec settlement = cible utilisable non facturée | Settlement AVANT le tampon COMMITTED ; sur échec : `hardDeleteProject` **explicite** de la cible (quota `projects.count` = count vivant → restitué), job ROLLING_BACK, hold relâché | Route **#39-2** : settle forcé en échec → commit ≥400, **0 projet survivant**, job ROLLING_BACK, réservation COMPENSATED débit 0 |
| C | Sous hard limit, 2 retries idempotents concurrents → le second refusé `LEDGER_HARD_LIMIT` à tort | Re-vérification de `(organizationId, idempotencyKey)` immédiatement **après** le verrou FOR UPDATE, **avant** le calcul du plafond → le perdant rejoue | PG **C1 (#39)** : 2 retries concurrents même clé (2 connexions), limite 100/hold 70 → **zéro refus**, `[created, replayed]`, 1 réservation |

Log brut complet (non filtré) : `test-runs-raw.txt` — **committé en `.txt`** ; la
ronde 1 annonçait `test-runs.log`, avalé silencieusement par la règle `*.log`
du `.gitignore` racine (le 404 constaté par l'expert était réel, l'annonce
« log joint » était donc fausse — corrigé et leçon retenue : jamais d'artefact
d'évidence en `.log`).

## Chiffres bruts

- Suites rejouées (ronde 2) : **10 fichiers, 102/102 verts** (`test-runs-raw.txt`, sortie brute), dont :
  - `import-billing-db.spec.ts` : **12/12 vrai Postgres** (A1-A4+B1-B4 ronde 1, C1+A1/A2/A3 ronde 2) ;
  - `import-routes.spec.ts` : 13/13 (dont #39-1 récupération route et #39-2 compensation de cible).
- Checks CI de la PR : « Install, test, build, scan » échouait sur
  `apps/admin/src/admin-model.test.ts` (32 sections vs 31 attendues) —
  défaut **préexistant de main** (même fix que la PR #40, non mergée) appliqué
  ici ; « Quality Gates » est un méta-check qui suit ce job ; « Validate
  registries » échouait sur la dérive de `DOCUMENT_MANIFEST.yaml` (vue calculée
  non régénérée après l'édition des contrats) — régénérée et committée ;
  « Production E2E / Playwright local stack » (51 tests `ui-details-*`) est en
  échec sur TOUTES les branches, y compris des PR docs-only (runs 29893345877,
  29838622737, 29838616226) — chantier repo-wide hors périmètre billing.
- Détail ronde 1 :
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
