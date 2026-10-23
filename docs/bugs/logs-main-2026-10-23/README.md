# Logs : reprise isolée sur main

Base `a1da69ae898487995f2c74cd88a1b3b171a21dcf`. Seul delta produit extrait de #769 tête `45c503a41c8b6c47e95decd2ec60ff944d143435` : `setCleared(false)` avant le chargement manuel dans `ProjectLogsPanel`. Aucun commit ni autre changement de #768 repris. #773 et #774 sont conservées par ascendance main. Inventaire : 478 fiches conservées, une fiche Logs ajoutée.

## Validation du 23 octobre

Build complet terminé avec code 0. Deux tests Chromium directs, zéro échec, retry ou omission, en 20,2 s : 1440×900 et 1024×768. API réelle locale (3019), PostgreSQL synthétique dédié (55443), application compilée (5229), Chromium système, Node 24.19.0, pnpm 9.14.4. Configuration exacte jointe ; aucune augmentation de délai, pause artificielle ou clic forcé.

Chaque test crée un compte et un projet synthétiques, importe réellement un ZIP et exige l’événement `project.files.import_zip` dans les réponses HTTP 200. Clear masque cinq lignes ; Reload restitue cinq lignes sans recharger la page. Live tail est désactivé par son bouton pour attribuer la réponse au geste manuel.

Ensuite, seule la panne est injectée avec `route.abort('failed')` sur le GET Logs : l’erreur et Retry sont visibles. Après retrait de cette interception, Retry reçoit une réponse réelle HTTP 200 avec l’événement d’import et rend les lignes visibles. Un rechargement complet est également vérifié. Le test affirme qu’aucun DELETE navigateur n’a été émis. Les succès ne proviennent d’aucun `fulfill` ou mock API.

Six contrôles d’intégrité de l’index passent. Typecheck/lint sont exécutés par les hooks normaux avant publication ; leur verdict est rapporté dans la PR. Aucune suite globale locale répétée.

## Preuves et limites

[Contre-épreuve historique rouge/verte de #769, inchangée](https://github.com/openaxcloud/vibecore/blob/45c503a41c8b6c47e95decd2ec60ff944d143435/docs/bugs/logs-reload-2026-10-22/README.md). Cette nouvelle recette ne représente pas une nouvelle contre-épreuve rouge.

`receipt.json` conserve les compteurs expurgés, le blob produit compilé et les empreintes des 2306 fichiers compilés agrégées dans un manifeste privé. Les SHA-256 en tableaux se reconstruisent par concaténation des groupes. Rapport brut, manifestes complets, traces réseau et logs API restent locaux : aucun cookie/token n’est publié. Les deux captures jointes ont été inspectées ; identités et identifiants visibles sont uniquement synthétiques. Elles montrent le retour des lignes à 1440 et l’erreur à 1024, pas toutes les étapes du parcours.

`runtimeLogCount=0` : validation des activités System, pas de commandes/runtime applicatif. La mention local-dev à l’écran ne prouve pas un runtime démarré. Pas de recette Safari/mobile tactile, export/recherche/split/polling ni production. Aucun panneau entièrement certifié. La CI de la nouvelle tête reste une validation distincte.
