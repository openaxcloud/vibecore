# `BaseChat.tsx` — sept erreurs réelles derrière `@ts-nocheck`

## Mesure

Directive retirée, `tsc --noEmit` sur le projet entier :

| | |
|---|---:|
| erreurs réelles dans `BaseChat.tsx` | **7** |
| taille du fichier | 23 760 lignes |

**Deux témoins ont servi, et le premier a évité une conclusion fausse :**

1. Un premier retrait par motif exact (`// @ts-nocheck\n`) **n'a pas pris** — la
   ligne porte un commentaire à la suite. `tsc` a rendu **0 erreur**, ce qui
   ressemblait à « le fichier est propre ». Le témoin d'erreur injectée n'a rien
   rapporté : c'est lui qui a montré que le fichier restait ignoré.
2. Après retrait correct, le même témoin **est** rapporté. `tsc` voit enfin le
   fichier, et les 7 erreurs sont réelles.

## Les sept, regroupées par cause

| cause | lignes | nature |
|---|---|---|
| **union de panneaux** | 5457, 5458 | le type fourni est plus large que `ProjectIdeWorkspacePanel` (26 membres) — les deux unions ont divergé |
| **arbre de volets** | 5465, 7783 | `{ paneTree, activePaneId, floatingPanes }` ne correspond pas à la forme persistée |
| **onglets de volet** | 5472 | `IdePaneTab[]` contre `ProjectIdePaneTab[]` — deux types parallèles pour la même chose |
| **setState** | 7478, 7480 | `((files: File[]) => void) \| undefined` passé là où un `Dispatch<SetStateAction>` est attendu |

Ce ne sont pas sept fautes indépendantes : ce sont **trois divergences de
schéma** entre les types de persistance (`projectIdeMemory.ts`) et ceux du
composant, plus deux signatures de rappel.

## Pourquoi le correctif n'est PAS écrit ici

**Le fichier est le plus disputé du dépôt.** Commits du 6 septembre, tous
auteurs confondus : 08:07, 08:51, 09:43, 11:57, 11:57, **15:11**. Une autre
session y travaille toutes les deux heures.

Retirer la directive touche la **ligne 2** — conflit trivial. Réconcilier les
trois divergences de schéma touche les lignes **5457 à 7783**, et exige de
décider si l'on élargit le type persisté ou si l'on restreint au site d'appel.
**C'est une décision de schéma de persistance**, pas un ajustement mécanique :
élargir `ProjectIdeWorkspacePanel` change ce qui est écrit dans l'état IDE de
tous les projets existants.

Livrer ça en fin de mission, dans un fichier modifié toutes les deux heures,
produirait un changement conflictuel que je ne pourrais pas vérifier
entièrement. La mesure est faite et documentée pour que le suivant n'ait pas à
la refaire ; l'édition demande un créneau où le fichier n'est pas en vol.

## Ce qu'il faudra, quand ce sera pris

1. retirer la directive (ligne 2) ;
2. réconcilier les **trois** divergences, pas les sept symptômes ;
3. un test qui **interdit la réintroduction** de `@ts-nocheck` dans ce fichier —
   sans lui, la directive reviendra au premier conflit de fusion.

Le troisième point est le plus important : la directive a tenu depuis fin août
précisément parce que rien ne l'empêchait de rester.
