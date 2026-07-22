# P0-EX-02 — IMPLEMENTATION_STATUS.yaml est GÉNÉRÉ (générateur + CI + garde anti-dérive)

**evidenceId :** `docs/deploy-evidence/2026-07-22-implementation-status-generator/`
Refus « aucun générateur d'IMPLEMENTATION_STATUS dans scripts/CI » = **périmé**.
`verify-generator.mjs` asserte : (1) `scripts/parity/generate-implementation-status.mjs`
existe (sha256 dans generator-anchor.json) ; (2) il est invoqué dans
`.github/workflows/parity-registries.yml` (lignes citées) devant `validate-registries` ;
(3) recalcul == fichier committé (no drift, sinon exit 1). Rejouable. PROVEN_REVIEW_PENDING.
