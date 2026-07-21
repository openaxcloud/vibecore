# Canonical double-entry ledger — durable, proven (2026-07-20) — P0-V3-12 / C1

**evidenceId:** `docs/deploy-evidence/2026-07-20-double-entry-ledger/`
**Branch:** `feat/billing-double-entry-ledger`
**Refus expert:** P0-V3-12 (« Ledger de billing insuffisant »). Ce lot livre le grand
livre comptable **à double entrée strict, durable et canonique** qui remplace le
« porte-monnaie » single-entry (`CreditWallet.balanceCents`) et rend **durable** la
réservation en-mémoire de la PR #27.

Décision Avi appliquée : **nouveau ledger adopté, ancien wallet abandonné, AUCUNE
migration de soldes** (tout fictif, on repart propre). L'ancien `CreditWallet`/
`CreditLedger` n'est ni lu ni migré.

## Ce qui est construit

| Pièce | Fichier |
|---|---|
| Cœur pur double-entrée (balance, écriture inverse, FX exact, hard limit, ceil) | `services/api/src/ledger-core.ts` |
| Cycle de réservation en écritures équilibrées (reserve/settle/compensate/release + taxes) | `services/api/src/ledger-reservation.ts` |
| Rapprochement GCP/Stripe ↔ ledger (détection d'écart exacte) | `services/api/src/ledger-reconciliation.ts` |
| Store durable (transactions atomiques, cycle réservation, FX, réconciliation) | `services/api/src/ledger-store.ts` |
| Modèles Prisma + migration + triggers d'immutabilité | `packages/database/prisma/schema.prisma`, `.../migrations/0078_double_entry_ledger/migration.sql` |

### Invariants (tous testés)
- **I-LED-1** double entrée : Σ débits == Σ crédits **par devise** ; validé AVANT toute écriture (transaction déséquilibrée refusée, jamais écrite).
- **I-LED-2** FX exact : taux rationnel `num/den` (bigint), arrondi déterministe (HALF_UP/DOWN), **cutoff** respecté à la sélection du taux. Décimal exact = `bigint` d'unités mineures, jamais de flottant.
- **I-LED-3** immutabilité : transactions/entrées postées **append-only** au niveau DB (triggers `BEFORE UPDATE/DELETE` **et** `BEFORE TRUNCATE`) ; une correction est une **nouvelle transaction inverse** (`reversalOfId`), jamais une mutation.
- **I-LED-4** hard limit : un mouvement qui dépasserait une frontière sûre est refusé **en entier**, rien n'est posté (jamais de corruption).

## Les preuves exigées — VERTES en réel (vrai Postgres)

Le suite d'intégration tourne contre un vrai Postgres (`pgvector/pgvector:pg16`,
l'image que la CI utilise ; migrations appliquées via `prisma migrate deploy`).

| Preuve | Test | Résultat |
|---|---|---|
| transaction débit=crédit persiste ; déséquilibre refusé | (1) | ✅ |
| **réservation survit à un redémarrage** (client A écrit, client B indépendant relit) | (2) | ✅ |
| compensation = écriture inverse : **chaque compte revient à zéro**, settle original **intact**, lié par `reversalOfId` | (3) | ✅ |
| **mutation d'un événement passé refusée** par la DB (UPDATE et DELETE → `append-only`) | (4) | ✅ |
| rapprochement **détecte un écart** ledger vs Stripe (+ run persisté) | (5) | ✅ |
| **hard limit refusé** en entier — réservation non créée | (6) | ✅ |
| idempotence réservation (même clé → même réservation, pas de double hold) | (neg) | ✅ |

Plus 32 tests purs (double-entrée, écriture-inverse-nette-zéro, FX exact+cutoff,
réconciliation, conservation de la monnaie reserve→settle→compensate).

**Total : 39 tests verts** (32 purs + 7 intégration DB), build strict CI-parité **0 erreur**.

Triggers réellement vivants dans la DB (extrait `pg_trigger`) :
[`live-triggers.txt`](live-triggers.txt) — `ledger_entry_immutable`,
`ledger_entry_no_truncate`, `ledger_transaction_immutable`,
`ledger_transaction_no_truncate`.

## Reproduire

```bash
# 1. Postgres jetable (même image que la CI)
docker run -d --name vc-ledger-db -e POSTGRES_USER=vibecore -e POSTGRES_PASSWORD=vibecore \
  -e POSTGRES_DB=vibecore -p 55432:5432 pgvector/pgvector:pg16
export DATABASE_URL="postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore"

# 2. Appliquer les migrations (dont 0078)
pnpm --filter @vibecore/database db:deploy

# 3. Tests purs (aucune DB requise)
cd services/api; V=../../node_modules/.bin/vitest
$V --run --config vitest.config.ts src/ledger-core.spec.ts src/ledger-reservation.spec.ts src/ledger-reconciliation.spec.ts  # 32

# 4. Preuves durables (vrai Postgres) — les 6 preuves exigées + idempotence
$V --run --config vitest.config.ts src/tests/ledger-store-db.spec.ts   # 7

# 5. Build strict CI-parité
$V >/dev/null; ../../node_modules/.bin/tsc --outDir /tmp/b --rootDir src --module NodeNext \
  --moduleResolution NodeNext --target ES2022 --lib ES2022 --types node \
  --skipLibCheck true --esModuleInterop true --strict true src/server.ts   # 0 error
```

Sorties : [`pure-tests.txt`](pure-tests.txt), [`db-integration-tests.txt`](db-integration-tests.txt).

## Portée / honnêteté

- Le store durable `LedgerStore.reserveUsage/commitReservation/compensateReservation/
  releaseReservation` a **exactement le cycle** de l'`ImportCreditLedger` en-mémoire de
  la PR #27 (reserve → settle au commit → compensation/release) : c'est le remplaçant
  durable. Le **câblage** de l'endpoint import sur ce store se fera quand #27 et ce lot
  seront mergés (les deux sont des PR ouvertes, non mergées) — point d'intégration
  documenté, non spéculé ici.
- **Budgets, taxes, refunds, chargebacks** : modélisés par les primitives du ledger
  (hard limit, `tax_payable`, compensation/écriture inverse, `reversalOfId`) et couverts
  par des tests. **Proration** = un settle partiel (committed < max) ; la proration
  calendaire complète et le câblage PSP Stripe (capture/void réels) restent des
  follow-ups. `RateCardVersion` est stampée sur chaque transaction (`rateCardVersion`).
- Aucune migration de soldes ; aucun déploiement, k8s, workspace-manager ni Nix touché.
- **P0-V3-12 NON clôturé — PROVEN_REVIEW_PENDING** jusqu'à re-signature humaine.
