---
id: BUG-DEPLOY-004
---

## Bug

**P0 chaîne de livraison bloquée** — après le merge du lot B6/B7 (PR #81), l'étape `sign-images` de `infra/cloudbuild/runtime-tier.yaml` utilisait `$REFS` en **simple dollar**. Cloud Build résout ses substitutions sur le **texte brut** de la config (commentaires inclus) et traite tout nom MAJUSCULE en simple dollar comme une clé ; `REFS` n'étant ni un built-in ni une substitution `_`-préfixée, `gcloud builds submit` **refusait la config entière** (`INVALID_ARGUMENT: key in the template "REFS" is not a valid built-in substitution`). Le build ne démarrait pas → `helm upgrade` jamais atteint → **plus aucun déploiement prod possible**.

## 📤 Dispatché

✅

## 💻 Codé

✅ `57efc379`

## ✅ Testé live

☐

## Preuve

Constaté en CI réelle sur le run `31166961502` (`aa447067`) : étape « Build runtime tier (Cloud Build) » rouge en quelques secondes, gate Trivy et `helm upgrade` **skipped**. La prod continuait de servir 200 sur l'ancienne image — panne de *livraison*, pas de *service*. Les variables **minuscules** (`img`, `ref`, `digest_ref`) sont ignorées par le substituteur, d'où le fait que seule celle-ci morde ; `$$PATH` juste au-dessus suivait déjà la bonne convention. Correctif : double dollar sur les 2 occurrences, commentaire explicatif rédigé **sans** nom MAJUSCULE en simple dollar (sinon il rejouait exactement le même échec). Vérifs : scanner dédié = **0** substitution MAJUSCULE non échappée sur les 3 configs, YAML valide, `validate-image-signing-wired.py` verte (self-test 4/4 + 3/3 configs câblées). `single-web.yaml` / `workspace-agent.yaml` n'utilisent que des variables minuscules — non touchés.

