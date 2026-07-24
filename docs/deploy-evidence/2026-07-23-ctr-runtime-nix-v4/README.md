# CTR-RUNTIME-NIX v4 — corrections du refus expert v3 (2026-07-23)

Refus v3 (`docs/parity/incoming/REPONSE_EXPERT_V3_20260722.md` §B) : « lock pas
prouvé immuable + enforcement incomplet ». Les 4 corrections exigées :

| # | Exigence | Correction (code) | Preuve rejouable |
|---|---|---|---|
| 1 | Pin de génération OBLIGATOIRE pour tout lock publiable | `assertLockPublishable()` refuse un pin non concret (alias mutable → `ECODE_LOCK_UNPINNED`) ; appelé à l'écriture ET au Publish | `ecode-lock.spec.ts` + `nix-generation-lifecycle.spec.ts` (sur le vrai gen-2) |
| 2 | Persister + réutiliser le pin dans release ET rollback | `RetainedRelease.storeGeneration` → `RollbackPlan.storeGeneration` → `nixGenerationRef` ; rollback lu depuis `metadata.serverDeploy.image.storeGeneration`, évalué contre la génération de SA release, re-persisté | `release-rollback.spec.ts` (pin porté release→rollback ; release sans lock ⇒ non gouverné) |
| 3 | Valider l'intégralité bundles/store paths/hashes vs catalogue signé | `assertLockAgainstRegistry` lie chaque bundle : nom (`ECODE_LOCK_BUNDLE_UNKNOWN`), store path + sha256 (`ECODE_LOCK_BUNDLE_TAMPERED`) | `ecode-lock.spec.ts` + lifecycle sur le vrai gen-2 (bundle falsifié/inconnu refusé) |
| 4 | Négatif LIVE « Publish avec lock révoqué → refus » | chaîne complète implémentée ; **requiert le déploiement de la PR** (le configmap prod ne porte pas encore `NIX_STORE_GENERATIONS`) | `live-revocation-negative.sh` — prêt à jouer au mini-merge (feu vert Avi) |

## Compteurs de tests (verts)
- `@vibecore/k8s-client` : **118** (dont tampered/unknown/unpinned sur le vrai gen-2)
- `@vibecore/api` release-rollback : **12** (pin porté release→rollback)
- `@vibecore/workspace-manager` : **76** (placement registre-aware)
- tsc strict api + `check-no-runtime-mocks` : verts

## Correction 4 — pourquoi encore BLOCKED, et le déblocage
La révocation au Publish s'évalue **dans l'api** (`assertLockAgainstRegistry`
jette `ECODE_LOCK_GENERATION_REVOKED`). Ce code est dans la PR, pas déployé —
vérifié : `configmap … NIX_STORE_GENERATIONS` est **vide** en prod. Le négatif
live exige donc un mini-merge (tier runtime+api). Séquence prête et documentée
dans `live-revocation-negative.sh` ; feu vert Avi requis pour toucher la prod.
