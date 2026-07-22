# P0-A2-01 — DOCUMENT_MANIFEST : provenance par-fichier complète + signature de contenu

**evidenceId :** `docs/deploy-evidence/2026-07-22-manifest-provenance/`
Refus « manifeste non signé, provenance/validation par fichier incomplètes, reviewers
UNKNOWN » traité rejouablement. `verify-manifest-provenance.mjs` asserte (exit 1 sinon) :
1. **chaque fichier listé existe** et son `sha256` == recalcul (166/166) ;
2. **provenance par-fichier complète** : chaque entrée porte `{file, sha256, schemaVersion,
   repoCommit, reviewer}` ;
3. **signature de contenu** déterministe (racine sha256 des paires `file:sha256` triées)
   recalculable → manifeste **tamper-evident**.

> La dimension **reviewer humain** est reportée HONNÊTEMENT (`reviewerCoverage`, 165
> UNKNOWN / 1 signé) — c'est précisément ce que `PROVEN_REVIEW_PENDING` attend ; jamais
> falsifiée. L'intégrité, la complétude de provenance et la signature de contenu sont,
> elles, prouvées mécaniquement.

Le vérificateur détecte toute dérive (démontré : une édition de P0_REGISTRY sans
régénération le fait échouer). PROVEN_REVIEW_PENDING.
