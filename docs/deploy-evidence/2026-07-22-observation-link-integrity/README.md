# P0-LS-06 — intégrité sémantique des liens d'observation

**evidenceId :** `docs/deploy-evidence/2026-07-22-observation-link-integrity/`
Refus « observations TRIAGED malgré liens cassés/non sémantiques » réfuté rejouablement.
`verify-observation-links.mjs` asserte (exit 1 sinon) sur `OBSERVATION_REGISTRY.yaml` :
(1) **aucun lien cassé** — chaque `archiveUri` résout sur disque (19/19) ;
(2) **aucun lien non sémantique** — chaque `contentHash` est un hash de source CANONIQUE
enregistré dans `SOURCE_REGISTRY.yaml` (19/19), ancrant l'observation à une source réelle.
En particulier, **aucune observation TRIAGED n'a de lien cassé ou non sémantique**.
Rejouable, hashé (registres observation + source). PROVEN_REVIEW_PENDING.
