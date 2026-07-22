# P0-A2-07 — le gate contractuel valide le CONTENU, pas seulement la présence

**evidenceId :** `docs/deploy-evidence/2026-07-22-contract-gate/`
Refus « architectureContracted = présence seulement ; le gate ne valide pas
schémas/références/tests/compatibilité » réfuté rejouablement. `verify-contract-gate.mjs`
asserte sur `APPROVAL_STATUS.json` (COMPUTED) : deux niveaux DISTINCTS —
`contractsPresent` (présence des fichiers, **passe**) et `contractsValidated` (CONTENU :
reviewer humain réel, ≥3 sections, pas de TODO/PLACEHOLDER, **échoue** avec des raisons
de contenu « no real reviewer »). Le gate n'est donc PAS « présence seulement ». De plus
les **schémas annoncés** (`PROJECT_MANIFEST_SCHEMA.json`, `PROJECT_ARTIFACTS_SCHEMA.json`)
**compilent sous ajv** (réels + valides). La validation « tests/compatibilité » reste
portée par `validate-registries` en CI. PROVEN_REVIEW_PENDING.
