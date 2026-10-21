---
id: BUG-UX-DATABASE-SEQUENTIAL-LOAD-001
---

# La liste des bases déjà chargée est redemandée au montage

## 📤 Dispatché

Constat UX sur main `fc8a687e` + #750 + #753 : premier BFF terminé en 200 après environ 24 s, puis second BFF déclenché 4,8 s plus tard, encore en attente à l'échec. La relecture confirme une connexion DATABASE_URL ; aucune disparition physique de données démontrée. [Recette source](https://github.com/openaxcloud/vibecore/blob/d6b719fe8234da5565d5fc32ad5279730357e63c/docs/bugs/ux-combined-fc8a687e-2026-10-21/README.md).

## 💻 Codé

Correctif local proposé, non publié et non fusionné. `ProjectDatabasePanel` reçoit la réponse normalisée mais ne la transmettait pas à `DatabaseWorkbench`, qui lançait son propre GET au montage. L'enfant accepte `initialData` et affiche cette réponse réelle sans nouvelle requête. Le parent doit passer sa réponse réussie ; sa garde de chargement/erreur empêche déjà le montage avant celle-ci.

Les rafraîchissements explicites et après provisionnement restent possibles. Une nouvelle réponse du parent remplace une réponse locale plus ancienne (par exemple après ajout d'une connexion). Un rafraîchissement conserve les données visibles pendant l'attente, puis expose une erreur et Réessayer si aucune réponse n'arrive. Le changement de projet remonte l'enfant et ses fetchers pour ne conserver ni sélection ni réponse de l'ancien projet.

## ✅ Testé live

Non certifié. Huit tests de composant couvrent affichage immédiat, état vide réel, montage autonome, rafraîchissement, échec sans réponse, mise à jour parent, provisionnement et changement de projet. La recette navigateur combinée reste à exécuter après branchement BaseChat. Aucun délai E2E, assertion E2E, exemption ou politique de retry changé. Ce correctif retire une requête séquentielle inutile ; il ne démontre pas la cause des latences API observées.

Le garde statique `loadAttempted && fetcher.data === undefined` devient `loadAttempted && data === undefined` parce que la réponse affichée peut désormais provenir du parent. Sa condition d'échec n'est pas supprimée : le test de composant déclenche un rafraîchissement sans réponse, vérifie l'alerte et actionne réellement Réessayer.

Recette navigateur locale : deux cas EN/FR à 390 px passent directement, avec une seule requête liste jusqu’à la carte et lecture des tables réelles après ouverture. Le vrai BFF est retenu puis relâché sans changement de contenu. Build aced48d + patch166daa38 (commentaire GitHub6314488603), résultats `initialization-handoff.json`. Pas de certification complète du panneau ni de production.
