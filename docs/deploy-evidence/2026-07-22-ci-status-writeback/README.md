# P0-EX-10 — la CI GÉNÈRE ET ÉCRIT le statut (pas « --check seulement »)

**evidenceId :** `docs/deploy-evidence/2026-07-22-ci-status-writeback/`
Refus « la CI vérifie --check seulement, ne génère/écrit pas le statut » = **périmé**.
`verify-ci-writeback.mjs` asserte (exit 1 sinon) sur `.github/workflows/parity-registries.yml` :
(1) la CI **régénère** toutes les vues (`generate-*`) ; (2) réécrit l'attestation in-place
(`open(p,'w').write`) ; (3) **`git add docs/parity` + `git commit` + `git push origin
HEAD:main`**. (4) Preuve réelle : un commit **« attestation roulée automatiquement »**
existe sur main (`96454f3d`, run 29909965011), confirmé via `gh api`. Rejouable.
PROVEN_REVIEW_PENDING.
