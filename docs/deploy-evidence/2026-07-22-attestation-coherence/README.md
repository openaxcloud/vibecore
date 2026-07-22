# P0-A2-13 — cohérence de l'attestation CI (même commit, generatedAt cohérent, run réel)

**evidenceId :** `docs/deploy-evidence/2026-07-22-attestation-coherence/`
Refus « champs provenance absents, attestation sur un autre commit, generatedAt
incohérent » réfuté rejouablement. `verify-attestation-coherence.mjs` asserte (exit 1
sinon) sur `docs/parity/CI_ATTESTATION.yaml` : (1) `repoCommit == runCommit == mergedCommit`
(même commit — pas « un autre commit ») ; (2) `runDate == mergedToMainAt` (generatedAt
cohérent) ; (3) `conclusion=success` ; (4) le run GitHub référencé est **RÉEL**
(`gh api` : `head_sha` == commit attesté, success). `--offline` = cohérence interne seule.
Complète la garde existante `validate-registries` (commits vérifiés dans l'historique git).
PROVEN_REVIEW_PENDING.
