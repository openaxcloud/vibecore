# P0-EX-08 — ProjectManifest schema EXÉCUTABLE (allOf/contains réels)

**evidenceId :** `docs/deploy-evidence/2026-07-22-project-manifest-schema/`
Refus « schéma accepte 2 artefacts mobile + manifeste minimal invalide ; allOf n'est
qu'une description » réfuté par un VRAI moteur JSON-schema (**ajv 8.17.1, draft 2020-12**).
`verify-manifest-schema.mjs` compile `docs/parity/PROJECT_MANIFEST_SCHEMA.json` (sha256
dans schema-anchor.json) et prouve :
- manifeste valide → **accepté** ;
- **2 artefacts MOBILE_APP → rejetés** (`contains`/maxContains:1) ;
- manifeste minimal → rejeté (`required`) ;
- propriété inconnue → rejetée (`additionalProperties:false`).
Échoue (exit 1) si un cas dévie. Rejouable. PROVEN_REVIEW_PENDING.
