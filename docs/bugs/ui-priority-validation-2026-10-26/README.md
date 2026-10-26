# Validation du lot prioritaire local

Base : tête de la PR #800 `b72c48322`, conservée sans modification. Code intégré dans les commits locaux `78da5f635` (Galerie), `1eb4049b8` (Auth) et `04878017e` (Équipe/SSO). Le build commun est celui de `fbb678704` ; les commits suivants ne changent que les preuves et la documentation. Aucun push de ce lot, aucune fusion ou action production.

## Résultats

- Build commun : sortie0, client et SSR.
- Tests ciblés par étapes :18 Auth,26 Équipe/SSO,7 Galerie (51 tests dans11 fichiers distincts). Le test de navigation imbriquée est rouge avant correction et vert ensuite ; les autres suites existantes sont réutilisées. Pas de nouvelle exécution fictive de toutes les suites après chaque commit documentaire.
- Lint global : sortie0, zéro erreur et52 avertissements préexistants. Formatage ciblé des fichiers produit conforme.
- Typage : web, scripts Node, helpers IDE, Electron main/preload réussissent dans la première commande. Le dernier groupe workspace échoue d'abord sur les dépendances mobiles absentes dans ce worktree ; un lien local vers l'installation existante résout ce point. La reprise workspace valide29 packages et révèle deux résolutions du client Prisma dans l'API, issues des liens de worktrees. Les fichiers de déclaration générés sont identiques ; une arborescence locale de liens `services/api/node_modules` relie les packages workspace à CE worktree, sans modifier l'installation partagée. Le dernier contrôle API réussit alors avec sortie0. Toutes les étapes ont ainsi un résultat réussi ; **la commande complète initiale n'est pas présentée comme ayant réussi d'un seul coup**. Aucun source backend, manifeste, installation réseau ou contournement de typage.
- Gitleaks complet : premier scan signale le SHA Git de la ligne de provenance `contracts.md` comme generic-api-key. Le texte de provenance est reformatté pour séparer chemin et révision complète ; aucune clé réelle ni exception ajoutée. Second scan complet puis scan final de l’arbre consolidé : sortie 0, aucune fuite. Le dernier journal est `gitleaks-final-tree.log`.

## Recettes compilées et revue

- [Auth](../ui-authentication-2026-10-26/after12199/README.md) :40 observations,4 parcours ; cibles44px, padding52px, clavier et saisie au resize. Quatre POST de cooldown uniquement synthétiques. Les36 POST de la phase baseline et les27 cas de protocole restent distincts.
- [Équipe/SSO](../ui-organization-access-2026-10-26/README.md) :60 observations sur3 routes,12 groupes et2 parcours de navigation ; paramètres enfant rendus, actions SSO44px. Aucun changement de droits ou réglage SSO réel.
- [Galerie](../ui-discovery-2026-10-26/README.md) :20 mesures sur le build commun,4 parcours clavier/détail/Retour. Débordements intrinsèques contrôlés dans les cartes, pas seulement à l'échelle du document.
- [Entrées et compatibilité](../ui-entry-audit-2026-10-26/README.md) :contrats et IDs réellement matchés ; aucune correction produit nécessaire.
- [Revue indépendante finale](ui-priority-final-review.md) favorable pour Auth/Galerie ; revue Équipe séparée dans son dossier. Les anciennes mentions « pending » des preuves compilées sont actualisées dans l'overlay, sans réécrire les résultats historiques.

Les journaux archivés normalisent seulement les espaces finaux et les lignes vides terminales ; originaux `/tmp/ui-priority-*` conservés. Aucun profil/cache navigateur archivé. Les serveurs de recette propres ont été arrêtés après contrôle de provenance, avec ports fermés.

## Limites et publication

La [matrice](../ui-priority-coverage-2026-10-26/README.md) couvre partiellement94 IDs sur357 ;103 restent non exercés,5 réservés historiques et155 hors UI. Ni les observations ni les parcours ne sont additionnés comme des pages entièrement validées. WebKit indisponible, pas de Firefox/Safari, lecteur d'écran ou appareil physique certifié. Polices externes bloquées pendant ces recettes, rendu local de repli. Pas d'authentification production, d'achat, de compte/invitation réels, de connexion OAuth réelle ou de mutation cliente.

La PR #800 et la livraison précédente restent suivies séparément. Ce lot local ne doit pas remplacer leurs versions en validation ou en file de livraison. Avant sa publication future : intégrer le main coordonné, préserver l'union des fiches et valider l'index exact, puis ouvrir une PR brouillon avec ces limites.
