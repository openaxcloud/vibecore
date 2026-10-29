# Navigation responsive et reprise Workbench — preuves locales

Base compilée : `fe790924209dbbd79d11eeb73b82cb9c315fe401` après #852. Chromium local, données et transport synthétiques isolés. Aucune donnée cliente, opération de production, installation ou nouvelle autorisation. Le serveur de recette est possédé par le parent ; les navigateurs des recettes terminées sont fermés.

## État de validation

## Validation finale locale acquise

- Modales : `menus/focus-fixed-visible/receipt.json`, **5/5 formats, 15 dialogues** (390×844, 820×900, 1180×757, paysage 844×390 et 390×320). Entrée naturelle, premier Tab, confinement Tab/Maj+Tab, contrôles extrêmes visibles et atteignables, Escape et restauration du focus passent. `focus-fixed-query-handoff/receipt.json` ajoute **1/1** : query et focus restaurés lors du remplacement de coque.
- Workbench : `workbench/compiled-green/receipt.json` et `compiled-double-failure/receipt.json`, **4/4 cas à 390/1180**. Deux GET exactement : récupération avec éditeur visible si le secours réussit ; erreur accessible après double échec, sans boucle après reprise automatique ou manuelle. La reprise ne recharge pas la page parente.
- Validation parent : **59 tests** (43 UI et16 inventaire), typage officiel complet, build client/SSR, lint 0 erreur / 52 avertissements préexistants, i18n et typage E2E verts. Revues indépendantes :25 tests helper et18 tests modales, plus lecture statique E2E ; ces ensembles se recouvrent, ne pas les additionner.
- Aucun E2E complet avec backend local réel exécuté pour ce lot ; son exécution appartient à la CI future. Publication et production non validées par ces recettes.

La cause initiale de l’import en production, l’action inline Open ambiguë et le trou temporel Enter pendant remplacement de coque restent ouverts. Les rouges historiques restent conservés. Aucun résultat ne clôt #834 ni ne certifie 31/31 panneaux, Safari ou appareils physiques.

| Groupe | Preuve acquise | Limite |
| --- | --- | --- |
| Modales mobiles | À 390×844, trois dialogues : focus initial BODY, premier Tab derrière la modale ; Tab et Maj+Tab sortent aux extrémités. Escape ferme et rend le focus. | Correctif compilé vérifié sur les cinq formats détaillés ci-dessus. |
| Remplacement de coque | Deux ouvertures clavier perdues : le contrôle disparaît avant Enter, événement reçu par BODY. | Cause temporelle observée ; pas de correspondance prouvée avec tous les retries CI. |
| Menus et resize | Quatre recettes au pointeur préparatoire, 16 transitions Files/Editor ; tailles, query et Escape exercés. | Ces témoins isolent la course d’ouverture clavier, ils ne la corrigent pas. |
| Search | 390/768 : ancien input détaché après hydratation, alpha et sélection 1–4 conservés ; Retour/Avancer sans vol de focus. | API synthétique ; aucune clôture du flaky Search ou de #834. |
| Navigation interrompue | 390/768 : quatre GET Settings suspendus, passage Files puis réponses libérées, README ouvert au clavier, deux cycles Retour/Avancer. | Compteurs explicites ; focus/caret de l’éditeur après Retour non certifiés. |
| Import Workbench | 390/1180 : échec réseau du chunk injecté une fois ; reprise automatique et Reload panel restent sur l’erreur sans nouvelle requête. Le rechargement de la page parente récupère. | Ce rouge est local et déterministe, pas une preuve de la cause de l’incident production. |
| Cache de module | Même URL rejetée sans nouveau GET ; URL diagnostique avec query puis rechargement de page réussissent. | Double cache React.lazy/module map observé dans Chromium ; autres moteurs non validés. |

## Incidents et contre-preuves conservés

- `menus/resize-baseline` conserve aussi deux erreurs de préparation : mauvais bouton recherché dans le header Agent. Elles ne sont pas des défauts produit.
- `navigation/interrupted` conserve le sélecteur périmé feature-settings ; `interrupted-selector-fixed` conserve le rôle treeitem erroné alors que README était visible. Les sélecteurs ont été corrigés dans le harnais seulement, sans affaiblir les assertions de navigation.
- L’essai desktop 1280 de l’import ne charge pas le Workbench mobile et ne reproduit donc pas l’échec. Ce cas n’est pas compté comme une réparation.
- La cause initiale de l’échec d’import en production reste inconnue. Le résultat curl CONNECT 403 provient du proxy avant l’origine ; ce n’est pas un refus HTTP du service de production. Aucun accès refusé ni artefact #834 n’a été retenté.

## Organisation et intégrité

`menus/`, `navigation/` et `workbench/` contiennent scripts, reçus et captures sélectionnés. Leurs README conservent les diagnostics historiques et ont été actualisés pour signaler le verdict final. `manifest.json` donne les SHA-256 des sources et des copies. Les JSON sont seulement compactés (espaces supprimés), sans suppression ni modification de valeurs ; scripts et images sont copiés octet pour octet ; les notes actualisées sont identifiées comme telles dans le manifeste. Aucun profil Chromium, journal brut ou cookie réel n’est archivé. Les valeurs synthetic-ui dans les scripts sont des fixtures locales, pas des accès réels.

Volume borné ; le complément final ajoute uniquement les reçus, deux scripts et deux captures utiles. Les scripts gardent leurs chemins de dépendances locaux ; aucune nouvelle dépendance n’est requise. Pas de Safari/WebKit local, appareil physique, clavier virtuel réel, backend/runtime réel ou certification globale. Le décompte historique 31/31 est partiel, jamais une validation complète. #834 reste ouvert. Aucune fusion ou livraison des correctifs ne découle de cette archive.
