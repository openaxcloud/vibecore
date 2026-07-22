# P0-EX-05 — entitlements : apps publiées (compte) vs types d'Artifact (ensemble)

**evidenceId :** `docs/deploy-evidence/2026-07-22-entitlement-distinction/`
Refus « l'artefact ne distingue pas apps supplémentaires et types d'Artifact » levé :
`docs/parity/ENTITLEMENT_ARTIFACT_SCHEMA.json` (draft 2020-12) sépare structurellement
`publishedAppQuota` (un COMPTE, Starter=1 app expirant 30j) de `allowedArtifactKinds`
(un ENSEMBLE de ArtifactKind §5.2, ou `UNKNOWN` si non observé — honnête).
`verify-entitlement-distinction.mjs` (ajv) prouve : Starter/Core valides ACCEPTÉS ;
types-comme-nombre, quota-comme-ensemble, kind inconnu, dimension manquante REJETÉS.
Les deux dimensions ne sont jamais interchangeables. Rejouable, hashé. PROVEN_REVIEW_PENDING.
