# REGRESSION_RUN_CONTRACT — exécutions de régression (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat de l'entité `RegressionRun` : une exécution datée et rejouable d'une
suite de preuves, pour détecter qu'une parité ACQUISE régresse.

## Entité `RegressionRun`

| champ | rôle |
|---|---|
| `runId` | id unique de l'exécution |
| `ranAt` | ISO 8601 |
| `commit` | SHA du repo évalué |
| `proofIds` | preuves e2e rejouées (réf. `E2E_PROOFS.yaml`) |
| `results` | par preuve : PASS \| FAIL \| SKIPPED + `evidenceId` |
| `verdict` | GREEN (toutes PASS) \| RED (≥1 FAIL) |
| `baselineCommit` | commit de référence comparé |

## Invariants

- **I-REG-1 (rejouable)** : un `RegressionRun` rejoue des preuves e2e existantes
  (mêmes fixtures) ; un run n'invente pas de preuve.
- **I-REG-2 (régression = RED bloquant)** : une preuve précédemment PROVEN qui
  repasse FAIL fait basculer le `verdict` en RED — signal bloquant, jamais ignoré.
- **I-REG-3 (traçable)** : chaque résultat porte son `evidenceId` (I-EVD-1) ; un
  FAIL sans artefact n'est pas exploitable.
- **I-REG-4 (comparatif)** : le run se compare à `baselineCommit` — une parité qui
  disparaît entre deux commits est détectée, pas seulement l'état absolu.

## État

🟡 **Non implémenté** : entité + contrat définis ; le harnais de rejeu automatisé
(cron de régression sur les preuves e2e) est un follow-up. Aujourd'hui les
preuves sont exécutées manuellement/à la session. `UNK-REGRESSION-HARNESS` trace
le manque.
