---
id: BUG-WORKSPACE-ENV-METADATA-20261111
section: "Promotion IDE locale du 11 novembre 2026"
---

# Métadonnées IDE exclues de l’environnement runtime

## Bug

Les neuf états internes *_STATE étaient projetés dans l’environnement du workspace, pouvant changer son manifeste lors d’une édition de panneau.

## 📤 Dispatché

Préparé localement le 11 novembre 2026. Publication non effectuée.

## 💻 Codé

Candidat local uniquement. Ni commit publié, ni fusion dans main.

## ✅ Testé live

Non validé live. CI complète, build, typecheck et recette responsive restent à vérifier.

## Correction et périmètre

Filtrer une liste exacte de neuf clés au point commun collapseEnvForWorkspace. Aucun filtre de préfixe, suppression de données, changement de priorité de scope ou modification des vrais secrets et variables applicatives. Les cinq appels runtime restent inchangés. Les pods existants contenant ces clés peuvent subir un remplacement lors du retrait; aucune garantie de zéro interruption.

Base exacte : `aea6e1dfbac93eb9da097a27d0ac8eb5ffbb7fc5` (PR894). Les résultats de PR893 ne constituent pas une acceptation de ce portage.

## Vérification locale

`tests/guards/workspace-env-metadata.spec.ts` : 7 cas Vitest exécutent la vraie projection API et importent le vrai prédicat. Inclus dans la découverte Vitest normale sans workflow éphémère. Vérifie scopes, neuf clés, priorité, non-mutation et variation des vraies variables.

Sources de produit revues : PR893 jusqu’à `014cf3a4790ef421936f0aaec92bdff6b2f158a0`; correction de câblage de test reprise de `16636768acb8365f4ec64ab6657b10eeaac42e7d` quand applicable. Aucun workflow k3s/gVisor, exemption de clé payante, seed temporaire ou audit GCS actif importé.
