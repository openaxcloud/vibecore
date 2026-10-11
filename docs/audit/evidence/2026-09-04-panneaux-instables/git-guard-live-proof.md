# Preuve live : la projection ne casse pas git

Production `be197c3e38` (SHA vérifié avant et après), projet de **401 fichiers**,
`sess_preuve_face203b2ff31ef7` (révoquée). Marqueur `QA-GUARD-1788547726`.

Le commentaire de `project-storage.ts:900` décrit un défaut qui a **déjà
existé** : sans le magasin `files` de `ide-state`, un fichier édité à la main
devenait invisible pour git et `status` annonçait « 0 changement »
indéfiniment. Je ne voulais pas l'assurance qu'il ne revient pas — je voulais la
preuve. Et plutôt que de mesurer la base actuelle, j'ai **simulé le comportement
du client APRÈS la projection** contre le vrai serveur de production : un `PUT
ide-state` qui n'envoie PAS `files`.

| # | étape | résultat |
|---|---|---|
| 1 | édition à la main de `package.json` par le chemin de sauvegarde de l'IDE | `HTTP 200`, `{"ok":true}` |
| 2 | relecture du fichier | marqueur **présent** |
| 3 | `GET ide-state` | **401 entrées**, marqueur **présent** dans `package.json` |
| 4 | **`PUT ide-state` SANS `files`** (comportement du client projeté), `If-Match: 3` | `HTTP 200` |
| 5 | état après ce PUT | **401 entrées conservées**, marqueur **toujours présent** |
| 6 | l'écriture a bien eu lieu | `ui.rightPanelWidth` passé à **333** |
| 7 | **`git status`** | `branch: main`, **407 fichiers modifiés**, `package.json` **présent** |
| 8 | relecture du fichier | marqueur **toujours présent** |

**Le serveur a conservé le magasin que le client n'a pas renvoyé** — c'est la
branche `gardeExistant` de `mergeProjectIdeState`. Et git voit toujours
l'édition à la main.

La projection est donc sûre sur le chemin d'écriture, prouvé en réel et non
raisonné. Le test `ide-state-browser-projection.spec.ts` épingle cette
dépendance : si quelqu'un retire cette branche du serveur, il rougit **avant**
que `git status` ne se remette à annoncer « 0 changement ».
