---
id: BUG-TYPE-CI-001
---

# BUG-TYPE-CI-001 — le typage de CI ne voit aucun spec de l'application

**Section** : Dette
**Gravité** : P2 — aucune panne utilisateur, mais une classe entière de défauts
échappe à la CI.

## Constat

`tsconfig.web.json`, le seul fichier que la CI typecheck pour l'application,
exclut explicitement :

```json
"app/**/*.spec.ts",
"app/**/*.spec.tsx",
```

**Aucun spec de l'application n'est donc jamais typé.** Mesuré le 2026-09-16 sur
`main` (`c61f6dffc`), avec le `tsconfig.json` racine qui, lui, les inclut :

```
610 erreurs au total
569 dans des fichiers *.spec.ts / *.spec.tsx   ← invisibles pour la CI
 41 hors specs
```

Les 41 restantes vivent dans `apps/` et `services/`, qui portent leurs propres
`tsconfig.json` et sont typés séparément par `pnpm --recursive run typecheck` :
ce sont pour l'essentiel des artefacts de résolution du config racine, pas des
défauts de ces services.

Familles dominantes parmi les 610 : `TS2339` (220, propriété inexistante),
`TS2345` (199, argument du mauvais type).

## Pourquoi ça compte

Un spec qui ne compile pas peut quand même passer au vert : `vitest` transpile
sans vérifier les types. Un test peut donc appeler une fonction avec les mauvais
arguments, prétendre la couvrir, et ne rien tenir du tout. C'est la même famille
d'erreur que les gardes qui épinglent leur propre copie.

## Ce que coûterait l'élargissement

**Ce n'est pas une demi-heure.** Retirer les deux lignes d'exclusion fait
apparaître 569 erreurs d'un coup, et la CI reste rouge tant qu'elles ne sont pas
toutes traitées. À vue de nez plusieurs jours, et le travail est peu
parallélisable puisqu'il touche des fichiers que d'autres sessions modifient.

**Le chemin praticable est un cliquet**, pas un big bang :

1. compter les erreurs de typage des specs sur `main` et figer ce nombre ;
2. faire rougir la CI si une proposition l'AUGMENTE ;
3. laisser le nombre descendre au fil des passages, sans campagne dédiée.

Le dépôt porte déjà ce motif ailleurs (`EXPECTED_*_IDS`, les registres de
couverture). Le coût d'amorçage est de l'ordre de la demi-journée ; la
résorption se fait ensuite sans bloquer personne.

## Preuve

Repro exacte, depuis un worktree propre sur `main` :

```
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json \
  | grep -E "error TS" | wc -l              # 610
  | grep -cE '\.spec\.(ts|tsx)\('           # 569
```

⚠️ Le tas par défaut de Node ne suffit pas : sans
`--max-old-space-size`, `tsc` meurt en `Ineffective mark-compacts near heap
limit` et rend un code de sortie qui se lit comme un succès.
