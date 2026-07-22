# P0-A2-03 — modèle Project → Artifacts formalisé (schéma complet + exécutable)

**evidenceId :** `docs/deploy-evidence/2026-07-22-project-artifacts-schema/`
Refus « modèle partiel au §5 (ArtifactKind), aucun schéma complet Project→Artifacts »
levé : `docs/parity/PROJECT_ARTIFACTS_SCHEMA.json` (draft 2020-12) formalise
PLAN_PARITE §5 — entités §5.1, taxonomies §5.2 (ArtifactKind / GeneratedAssetKind /
ComponentKind / DeploymentType, enums verrouillés), release groupée §5.4,
`additionalProperties:false`. `verify-project-artifacts-schema.mjs` (ajv 8.17.1) prouve :
projet valide **accepté** ; ArtifactKind inconnu, **SERVICE-comme-Artifact** (interdit
§5.2), `projectId` manquant, propriété inconnue, release vide → **rejetés**. Rejouable,
hashé. PROVEN_REVIEW_PENDING.
