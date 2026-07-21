# Import state machine aligned on the contract + safety billing (2026-07-20) — P0-EX-04

**evidenceId:** `docs/deploy-evidence/2026-07-20-import-state-machine/`
**Branch:** `feat/import-state-machine-p0ex04`
**Refus expert résolu:** P0-EX-04 — le CODE Import suivait encore l'ancienne machine
linéaire (`SCANNING → COMMITTING` direct). Il suit désormais la machine du contrat.

## Machine à états — avant / après

Avant (code) : `… SCANNING → COMMITTING → COMMITTED` (raccourci ; clean et findings
convergeaient sur COMMITTING).

Après (code, aligné plan §9.2 / IMPORT_REMIX_CONTRACT) :

```
RECEIVED → STAGING_ISOLATED → SCANNING
   ├─ clean ─────────────────→ READY_TO_COMMIT
   └─ blocking findings ────→ QUARANTINED → AWAITING_USER_ACTION → RESCANNING → READY_TO_COMMIT
READY_TO_COMMIT → COMMITTING → COMMITTED
latéraux (depuis tout état non terminal) : ROLLING_BACK · CLEANUP_PENDING · EXPIRED · CANCELLED · FAILED
```

- **COMMITTING ne part QUE de READY_TO_COMMIT** (`assertImportTransition` → `IMPORT_COMMIT_NOT_READY`).
- **Un import propre ne passe pas par la quarantaine** ; un import avec findings ne
  saute pas à READY (`assertScanBranch` → `IMPORT_CLEAN_FORCED_QUARANTINE` /
  `IMPORT_FINDINGS_SKIP_QUARANTINE`).
- Commit atomique : la cible n'est écrite qu'à COMMITTED (jamais avant).
- cancel / timeout / rollback / failure → cleanup (staging jeté, cible jamais montée).

## Billing minimal de sûreté (`import-billing.ts`)

- **Réservation idempotente AVANT tout travail payant** (clé d'idempotence
  obligatoire ; retry même clé = pas de double réservation).
- **Settle = seul débit, seulement si COMMITTED** (`BILLING_SETTLE_WITHOUT_COMMIT`
  sinon).
- **Compensation (débit zéro) sur toute sortie non-committée** (cancel/timeout/rollback/failure).
- Invariant : `assertNoDebitWithoutCommit` — un débit > 0 n'existe qu'en état SETTLED.

## Les 4 preuves exigées (E2E via la vraie app Fastify)

| # | Scénario | Résultat prouvé |
|---|---|---|
| 1 | import propre | `SCANNING → READY_TO_COMMIT` (pas de raccourci) → COMMITTED ; réservation **SETTLED**, débit > 0 ; cible écrite 1× au commit |
| 2 | finding bloquant | `QUARANTINED → AWAITING_USER_ACTION` ; réservation **RESERVED**, débit 0 ; cible jamais touchée |
| 2b | consentement | commit passe par `RESCANNING → READY_TO_COMMIT → COMMITTED` |
| 3a | cancel | cible **INTACTE** ; réservation **COMPENSATED**, débit 0 |
| 3b | timeout | sweep → EXPIRED ; cible intacte ; réservation **COMPENSATED**, débit 0 |
| 4 | échec après réservation | write cible échoue → ROLLING_BACK ; **pas de débit** (COMPENSATED) |
| 5 | idempotence | replay même clé → même import, pas de 2ᵉ réservation |

## Tests

- `import-pipeline.spec.ts` — 20 tests (machine alignée + 3 tests négatifs du contrat :
  SCANNING→COMMITTING refusé, clean→QUARANTINE refusé, findings→READY refusé).
- `import-billing.spec.ts` — 21 tests (réducteur + ledger idempotent).
- `tests/import-state-machine-e2e.spec.ts` — 7 tests (les 4 preuves + rescan + idempotence).
- `tests/import-routes.spec.ts` — 9 tests (mis à jour : clé d'idempotence, nouvelle machine).
- Non-régression : `api.spec.ts` 121/121, `connector-import`/`zip-import-cleanup` verts.
- Build strict CI-parité (`tsc … src/server.ts`) : **0 erreur**.

## Reproduire

```bash
cd services/api
V=../../node_modules/.bin/vitest
$V --run --config vitest.config.ts src/import-pipeline.spec.ts            # 20
$V --run --config vitest.config.ts src/import-billing.spec.ts             # 21
$V --run --config vitest.config.ts src/tests/import-state-machine-e2e.spec.ts  # 7 (les 4 preuves)
$V --run --config vitest.config.ts src/tests/import-routes.spec.ts        # 9
$V --run --config vitest.config.ts src/tests/api.spec.ts                  # 121 (non-régression)
../../node_modules/.bin/tsc --outDir /tmp/b --rootDir src --module NodeNext \
  --moduleResolution NodeNext --target ES2022 --lib ES2022 --types node \
  --skipLibCheck true --esModuleInterop true --strict true src/server.ts  # 0 error
```

Sorties capturées : [`unit-machine-billing.txt`](unit-machine-billing.txt),
[`e2e-machine-billing.txt`](e2e-machine-billing.txt).

## Portée / honnêteté

- Le ledger de réservation est **in-process** (même pattern que `importStaging`) —
  proportionné à « billing minimal de sûreté ». La **persistance durable** (survie
  au redémarrage du process) reste le follow-up `UsageReservation` ; les invariants
  de sûreté ci-dessus tiennent quel que soit le backend.
- Aucun déploiement, k8s, workspace-manager ni Nix touché.
