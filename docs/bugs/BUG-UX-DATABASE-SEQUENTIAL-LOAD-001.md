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

## Diagnostic antérieur conservé depuis #753 cef42091

Les résultats ci-dessous précèdent le correctif #749 ; ils restent historiques.

# Le panneau Base de données recharge les données déjà reçues avant d’afficher la connexion

## 📤 Dispatché

Recette combinée main fc8a687e + #750 e996671 + #753 f06923ff. Dépendance à coordonner avec le chantier BaseChat ; aucune modification de ce fichier réservé dans le lot UX.

## 💻 Codé

Non corrigé. `ProjectDatabasePanel` reçoit `data` mais monte `DatabaseWorkbench` avec le seul `projectId`. Le composant enfant lance alors son propre `fetcher.load`. Proposition à vérifier ensemble : lui transmettre les données initiales normalisées, les afficher dès le montage, conserver les rafraîchissements et les erreurs, éviter de doubler le chargement initial. Ne pas augmenter le délai du test ni masquer le chargement par un faux contenu.

## ✅ Testé live

Reproduit localement au deuxième passage complet : le bouton DATABASE_URL est absent avant toute mesure de hauteur. Le premier BFF finit en 200 après environ 24 s ; un second BFF démarre 4,8 s plus tard et attend encore à l’échec. Le parent n’est plus busy mais l’enfant affiche Loading databases. Les appels API sont 200, certains en 7–9,5 s ; la relecture réelle confirme une variable et une connexion DATABASE_URL. La cause de la lenteur et l’identité avec la cause CI restent non démontrées.

Voir [la recette et les request IDs](ux-combined-fc8a687e-2026-10-21/README.md). Pas de certification production ou de correction validée.
